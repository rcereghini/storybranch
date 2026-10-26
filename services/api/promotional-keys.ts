import { createHash, randomBytes } from "node:crypto";
import { FieldPath, type Transaction } from "firebase-admin/firestore";
import { GameError, type Story } from "../../packages/contracts/index";
import {
  promotionalCommandSchema,
  promotionalRedemptionSchema,
  type PromotionalDefinition,
  type PromotionalGrant,
} from "../../packages/contracts/promotional-keys";
import type { Features } from "../../packages/contracts/profile";
import { db } from "./firebase";
import * as paths from "./paths";

type Definition = PromotionalDefinition & { issuerUid: string };
const definitions = db.collection("promotionalKeys");
const grantRef = (uid: string, id: string) =>
  db.doc(`users/${uid}/promotionalKeys/${id}`);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const active = (d: Definition | undefined, now: number) =>
  !!d && !d.revoked && d.expiresAt > now;
function publicDefinition(d: Definition): PromotionalDefinition {
  return {
    id: d.id,
    label: d.label,
    storyIds: d.storyIds,
    expiresAt: d.expiresAt,
    redeemBy: d.redeemBy,
    maxClaims: d.maxClaims,
    claims: d.claims,
    revoked: d.revoked,
    revision: d.revision,
  };
}

export async function validateAccountKeys(
  tx: Transaction,
  story: Story,
  uid: string,
) {
  for (const key of story.accountKeys?.keys ?? []) {
    const d = (await tx.get(definitions.doc(key.definitionId))).data() as
      | Definition
      | undefined;
    if (
      !active(d, Date.now()) ||
      d!.issuerUid !== uid ||
      !d!.storyIds.includes(story.id)
    )
      throw new GameError(
        "VALIDATION_FAILED",
        "Choose an active promotional key authorized for this Story.",
      );
  }
}

// These facts exist only for this evaluation. Never persist or cache them.
export async function liveAccountKeys(
  tx: Transaction,
  uid: string,
  story: Story,
): Promise<string[]> {
  const keys = story.accountKeys?.keys ?? [];
  if (!keys.length) return [];
  const rootPath = `stories/${story.id}`;
  const refs = [
    ...new Set([
      rootPath,
      ...keys.flatMap((key) => [
        definitions.doc(key.definitionId).path,
        grantRef(uid, key.definitionId).path,
      ]),
    ]),
  ];
  const snapshots = await tx.getAll(...refs.map((path) => db.doc(path)));
  const records = new Map(
    snapshots.map((record) => [record.ref.path, record.data()]),
  );
  const issuer = records.get(rootPath)?.creatorUid;
  const now = Date.now();
  return keys
    .filter((key) => {
      const d = records.get(definitions.doc(key.definitionId).path) as
        | Definition
        | undefined;
      const grant = records.get(grantRef(uid, key.definitionId).path);
      return (
        active(d, now) &&
        d!.issuerUid === issuer &&
        d!.storyIds.includes(story.id) &&
        grant?.issuerUid === issuer
      );
    })
    .map((key) => key.keyId);
}

export async function promotionalRoutes(
  request: Request,
  uid: string,
  segments: string[],
  features: Features,
  cursor: string | null,
) {
  if (segments.length !== 2)
    throw new GameError("NOT_FOUND", "Route not found.");
  const creator = segments[1] === "promotional-keys";
  if (request.method === "GET") {
    if (cursor !== null && !cursor)
      throw new GameError("VALIDATION_FAILED", "Invalid cursor.");
    let query = (
      creator
        ? definitions.where("issuerUid", "==", uid)
        : db.collection(`users/${uid}/promotionalKeys`)
    )
      .orderBy(FieldPath.documentId())
      .limit(20);
    if (cursor) query = query.startAfter(cursor);
    return db.runTransaction(async (tx) => {
      const records = await tx.get(query);
      const items = [];
      for (const record of records.docs) {
        if (creator) items.push(publicDefinition(record.data() as Definition));
        else {
          const d = (await tx.get(definitions.doc(record.id))).data() as
            | Definition
            | undefined;
          const owned = d && d.issuerUid === record.data().issuerUid;
          items.push({
            definitionId: record.id,
            label: record.data().label,
            grantedAt: record.data().grantedAt,
            expiresAt: owned ? d.expiresAt : null,
            status: !owned
              ? "unavailable"
              : d.revoked
                ? "revoked"
                : d.expiresAt <= Date.now()
                  ? "expired"
                  : "active",
          } satisfies PromotionalGrant);
        }
      }
      return {
        items,
        nextCursor: records.size === 20 ? records.docs.at(-1)!.id : null,
      };
    });
  }
  if (request.method !== "POST")
    throw new GameError("NOT_FOUND", "Route not found.");
  if (creator && !features.publish)
    throw new GameError(
      "FORBIDDEN",
      "Publishing access is required to issue or revoke promotional keys.",
    );
  const raw = await request.text();
  if (raw.length > 4096)
    throw new GameError("VALIDATION_FAILED", "Command too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = creator
    ? promotionalCommandSchema.parse(body)
    : promotionalRedemptionSchema.parse(body);
  const fingerprint = digest(JSON.stringify({ creator, command }));
  const receipt = db.doc(
    paths.receipt(uid, "promotional-key", command.idempotencyKey),
  );
  const code = randomBytes(24).toString("hex");
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "Command key already used.",
        );
      return previous.data()!.result;
    }
    const now = Date.now();
    let result: unknown;
    if ("action" in command) {
      const ref = definitions.doc(command.definitionId);
      const old = await tx.get(ref);
      if (command.action === "create") {
        if (old.exists)
          throw new GameError(
            "IDEMPOTENCY_CONFLICT",
            "This promotional key already exists.",
          );
        for (const storyId of command.storyIds) {
          const root = await tx.get(db.doc(`stories/${storyId}`));
          if (root.data()?.creatorUid !== uid)
            throw new GameError(
              "FORBIDDEN",
              "Promotional keys may only name your saved Stories.",
            );
        }
        const expiresAt = now + command.days * 86400000;
        const d: Definition = {
          id: command.definitionId,
          issuerUid: uid,
          label: command.label,
          storyIds: command.storyIds,
          expiresAt,
          redeemBy: Math.min(
            expiresAt,
            now + command.redemptionDays * 86400000,
          ),
          maxClaims: command.maxClaims,
          claims: 0,
          revoked: false,
          revision: 1,
        };
        tx.create(ref, d);
        tx.create(db.doc(`promotionalCodes/${digest(code)}`), {
          definitionId: d.id,
        });
        result = { definition: publicDefinition(d), code };
      } else {
        const d = old.data() as Definition | undefined;
        if (!d || d.issuerUid !== uid)
          throw new GameError(
            "FORBIDDEN",
            "Only the issuer can revoke this key.",
          );
        if (d.revision !== command.expectedRevision)
          throw new GameError(
            "STALE_REVISION",
            "Reload promotional keys before revoking.",
          );
        const updated = { ...d, revoked: true, revision: d.revision + 1 };
        tx.set(ref, updated);
        result = { definition: publicDefinition(updated) };
      }
    } else {
      const index = await tx.get(
        db.doc(`promotionalCodes/${digest(command.code)}`),
      );
      const definitionId = index.data()?.definitionId as string | undefined;
      const unavailable = () =>
        new GameError(
          "FORBIDDEN",
          "This promotional code is unavailable. Ask its creator for another code.",
        );
      if (!definitionId) throw unavailable();
      const ref = definitions.doc(definitionId);
      const d = (await tx.get(ref)).data() as Definition | undefined;
      const grant = await tx.get(grantRef(uid, definitionId));
      if (!active(d, now)) throw unavailable();
      if (grant.exists) result = { granted: true, alreadyGranted: true };
      else {
        if (d!.redeemBy <= now || d!.claims >= d!.maxClaims)
          throw unavailable();
        tx.create(grant.ref, {
          version: 1,
          issuerUid: d!.issuerUid,
          label: d!.label,
          grantedAt: now,
        });
        tx.update(ref, { claims: d!.claims + 1, revision: d!.revision + 1 });
        result = { granted: true, alreadyGranted: false };
      }
    }
    tx.create(receipt, { fingerprint, result, ...paths.receiptExpiry(now) });
    return result;
  });
}
