import { createHash, randomBytes } from "node:crypto";
import { FieldPath, type Transaction } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  invitationCommandSchema,
  redeemInvitationSchema,
  type EntryPolicy,
  type StoryInvitation,
} from "../../packages/contracts/invitations";
import type { Features } from "../../packages/contracts/profile";
import { db } from "./firebase";
import * as paths from "./paths";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const entryKey = (uid: string, storyId: string) =>
  db.doc(`users/${uid}/storyEntryKeys/${storyId}`);
const invitations = (storyId: string) =>
  db.collection(`stories/${storyId}/invitations`);
const policyOf = (data: Record<string, unknown>) =>
  (data.entryPolicy ?? {
    version: 1,
    revision: 0,
    invitationRequired: false,
  }) as EntryPolicy;

async function access(tx: Transaction, uid: string, storyId: string) {
  const root = await tx.get(db.doc(`stories/${storyId}`));
  if (!root.exists || !root.data()!.publishedVersionId)
    throw new GameError("NOT_FOUND", "Published Story not found.");
  const policy = policyOf(root.data()!);
  const grant = await tx.get(entryKey(uid, storyId));
  return {
    invitationRequired: policy.invitationRequired,
    hasKey: grant.exists,
    canStart:
      !policy.invitationRequired ||
      root.data()!.creatorUid === uid ||
      grant.exists,
  };
}
export async function assertStoryEntry(
  tx: Transaction,
  uid: string,
  storyId: string,
) {
  if (!(await access(tx, uid, storyId)).canStart)
    throw new GameError(
      "FORBIDDEN",
      "This Story needs an invitation. Open its Story details to redeem your code.",
    );
}

export async function invitationRoutes(
  request: Request,
  uid: string,
  segments: string[],
  features: Features,
  cursor: string | null,
) {
  const storyId = segments[2];
  if (!storyId || segments.length !== 3)
    throw new GameError("NOT_FOUND", "Route not found.");
  const ownerRoute = segments[1] === "story-invitations";
  const rootRef = db.doc(`stories/${storyId}`);
  if (request.method === "GET") {
    if (!ownerRoute) return db.runTransaction((tx) => access(tx, uid, storyId));
    const root = await rootRef.get();
    if (root.data()?.creatorUid !== uid)
      throw new GameError(
        "FORBIDDEN",
        "Only the Story creator can manage invitations.",
      );
    let query = invitations(storyId).orderBy(FieldPath.documentId()).limit(50);
    if (cursor) query = query.startAfter(cursor);
    const records = await query.get();
    return {
      published: !!root.data()!.publishedVersionId,
      policy: policyOf(root.data()!),
      items: records.docs.map((d) => d.data()),
      nextCursor: records.size === 50 ? records.docs.at(-1)!.id : null,
    };
  }
  if (request.method !== "POST")
    throw new GameError("NOT_FOUND", "Route not found.");
  const raw = await request.text();
  if (raw.length > 4096)
    throw new GameError("VALIDATION_FAILED", "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = ownerRoute
    ? invitationCommandSchema.parse(body)
    : redeemInvitationSchema.parse(body);
  if (ownerRoute && !features.publish)
    throw new GameError(
      "FORBIDDEN",
      "Publishing access is required to manage invitations.",
    );
  const fingerprint = digest(JSON.stringify({ storyId, ownerRoute, command }));
  const receipt = db.doc(
    paths.receipt(uid, "invitation", command.idempotencyKey),
  );
  const code = randomBytes(24).toString("hex");
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const oldReceipt = await tx.get(receipt);
    if (oldReceipt.exists) {
      if (oldReceipt.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This key was used for another invitation command.",
        );
      return oldReceipt.data()!.result;
    }
    const root = await tx.get(rootRef);
    if (
      !root.exists ||
      (!root.data()!.publishedVersionId &&
        !("action" in command && command.action === "policy"))
    )
      throw new GameError(
        "NOT_FOUND",
        "Publish the Story before issuing invitations.",
      );
    let result: unknown;
    if ("action" in command) {
      if (root.data()!.creatorUid !== uid)
        throw new GameError(
          "FORBIDDEN",
          "Only the Story creator can manage invitations.",
        );
      if (command.action === "policy") {
        const current = policyOf(root.data()!);
        if (current.revision !== command.expectedRevision)
          throw new GameError(
            "STALE_REVISION",
            "Reload the invitation settings before saving.",
          );
        result = {
          version: 1,
          revision: current.revision + 1,
          invitationRequired: command.invitationRequired,
        };
        tx.update(rootRef, { entryPolicy: result });
      } else if (command.action === "create") {
        const ref = invitations(storyId).doc(digest(code));
        const invitation: StoryInvitation = {
          id: ref.id,
          storyId,
          issuerUid: uid,
          createdAt: now,
          expiresAt: now + command.days * 86400000,
          maxClaims: command.maxClaims,
          claims: 0,
          revision: 1,
          disabled: false,
        };
        tx.create(ref, invitation);
        result = { invitation, code };
      } else {
        const ref = invitations(storyId).doc(command.invitationId);
        const old = await tx.get(ref);
        if (!old.exists)
          throw new GameError("NOT_FOUND", "Invitation not found.");
        if (old.data()!.revision !== command.expectedRevision)
          throw new GameError(
            "STALE_REVISION",
            "Reload invitations before disabling this code.",
          );
        result = {
          ...old.data(),
          disabled: true,
          revision: command.expectedRevision + 1,
        };
        tx.set(ref, result as StoryInvitation);
      }
    } else {
      const grantRef = entryKey(uid, storyId);
      const grant = await tx.get(grantRef);
      if (grant.exists) result = { granted: true, alreadyGranted: true };
      else {
        const ref = invitations(storyId).doc(digest(command.code));
        const snapshot = await tx.get(ref);
        const invite = snapshot.data() as StoryInvitation | undefined;
        if (
          !invite ||
          invite.storyId !== storyId ||
          invite.issuerUid !== root.data()!.creatorUid ||
          invite.disabled ||
          invite.expiresAt <= now ||
          invite.claims >= invite.maxClaims
        )
          throw new GameError(
            "FORBIDDEN",
            "This invitation is unavailable. Ask the creator for another code.",
          );
        tx.create(grantRef, {
          version: 1,
          kind: "invitation-entry",
          storyId,
          issuerUid: invite.issuerUid,
          invitationId: invite.id,
          grantedAt: now,
        });
        tx.update(ref, {
          claims: invite.claims + 1,
          revision: invite.revision + 1,
        });
        result = { granted: true, alreadyGranted: false };
      }
    }
    tx.create(receipt, { fingerprint, result, ...paths.receiptExpiry(now) });
    return result;
  });
}
