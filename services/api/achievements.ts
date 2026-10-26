import { createHash } from "node:crypto";
import { FieldPath, type Transaction } from "firebase-admin/firestore";
import { GameError, id, type Save } from "../../packages/contracts/index";
import {
  achievementSubmissionSchema,
  achievementReviewSchema,
  type AchievementDefinition,
  type AchievementClaim,
} from "../../packages/contracts/achievements";
import type { Features } from "../../packages/contracts/profile";
import { db } from "./firebase";
import { edition } from "./story-store";
import * as paths from "./paths";
import { run } from "./admin-audit";

const digest = (...parts: string[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const definitions = () => db.collection("achievementDefinitions");
const definitionId = (storyId: string, versionId: string, nodeId: string) =>
  digest(storyId, versionId, nodeId);

export async function achievementRoutes(
  request: Request,
  uid: string,
  segments: string[],
  features: Features,
  cursor: string | null,
) {
  const admin = segments[1] === "admin";
  if (admin && !features.admin)
    throw new GameError("FORBIDDEN", "Admins only.");
  const target = segments[admin ? 3 : 2];
  if (segments.length > (admin ? 4 : 3))
    throw new GameError("NOT_FOUND", "Route not found.");
  const claims = segments[1] === "achievements";
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    if (!admin && !claims && params.has("storyId")) {
      const storyId = id.parse(params.get("storyId"));
      const versionId = id.parse(params.get("versionId"));
      const nodeId = id.parse(params.get("storyNodeId"));
      const root = await db.doc(`stories/${storyId}`).get();
      if (root.data()?.creatorUid !== uid)
        throw new GameError(
          "FORBIDDEN",
          "Only the creator can inspect submissions.",
        );
      const record = await definitions()
        .doc(definitionId(storyId, versionId, nodeId))
        .get();
      return { definition: record.exists ? record.data() : null };
    }
    if (target) {
      if (claims) throw new GameError("NOT_FOUND", "Route not found.");
      const record = await definitions().doc(target).get();
      if (!record.exists || (!admin && record.data()!.creatorUid !== uid))
        throw new GameError("NOT_FOUND", "Achievement not found.");
      return record.data();
    }
    let query = claims
      ? db
          .collection(`users/${uid}/achievementClaims`)
          .orderBy(FieldPath.documentId())
          .limit(50)
      : admin
        ? definitions().orderBy(FieldPath.documentId()).limit(50)
        : definitions()
            .where("creatorUid", "==", uid)
            .orderBy(FieldPath.documentId())
            .limit(50);
    if (cursor) query = query.startAfter(cursor);
    const records = await query.get();
    const items = claims
      ? await Promise.all(
          records.docs.map(async (doc) => {
            const claim = doc.data() as AchievementClaim;
            const definition = await definitions()
              .doc(claim.definitionId)
              .get();
            return {
              ...claim,
              revoked: definition.data()?.status !== "approved",
            };
          }),
        )
      : records.docs.map((doc) => doc.data());
    return {
      items,
      nextCursor: records.size === 50 ? records.docs.at(-1)!.id : null,
    };
  }
  if (
    request.method !== "POST" ||
    claims ||
    (admin && !target) ||
    (!admin && target)
  )
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
  if (admin) {
    const command = achievementReviewSchema.parse(body);
    return run(
      uid,
      null,
      command.idempotencyKey,
      { target, ...command },
      async (tx) => {
        const ref = definitions().doc(target);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists)
          throw new GameError("NOT_FOUND", "Achievement not found.");
        const old = snapshot.data() as AchievementDefinition;
        if (old.revision !== command.expectedRevision)
          throw new GameError(
            "STALE_REVISION",
            "Reload this achievement before reviewing.",
          );
        if (
          (command.status === "rejected" && old.status !== "pending") ||
          (command.status === "revoked" && old.status !== "approved") ||
          (command.status === "approved" &&
            !["pending", "revoked"].includes(old.status))
        )
          throw new GameError(
            "VALIDATION_FAILED",
            "That review transition is unavailable.",
          );
        const next = {
          ...old,
          status: command.status,
          revision: old.revision + 1,
          reviewReason: command.reason,
          updatedAt: Date.now(),
        };
        tx.set(ref, next);
        return {
          result: next,
          audit: {
            action: "achievement",
            target: target!,
            change: {
              from: old.status,
              to: next.status,
              reason: command.reason,
            },
          },
        };
      },
    );
  }
  const command = achievementSubmissionSchema.parse(body);
  const ref = definitions().doc(
    definitionId(command.storyId, command.versionId, command.storyNodeId),
  );
  const fingerprint = digest(JSON.stringify(command));
  const receipt = db.doc(
    paths.receipt(uid, "achievement-submit", command.idempotencyKey),
  );
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This key was used for another submission.",
        );
      return previous.data()!.result;
    }
    const owner = await tx.get(db.doc(`stories/${command.storyId}`));
    if (!owner.exists || owner.data()!.creatorUid !== uid)
      throw new GameError(
        "FORBIDDEN",
        "Only the Story creator can submit its achievements.",
      );
    const { story } = await edition(tx, command.storyId, command.versionId);
    if (story.storyNodes[command.storyNodeId]?.kind !== "ending")
      throw new GameError("VALIDATION_FAILED", "Choose a published StoryLeaf.");
    const snapshot = await tx.get(ref);
    const old = snapshot.data() as AchievementDefinition | undefined;
    if ((old?.revision ?? 0) !== command.expectedRevision)
      throw new GameError(
        "STALE_REVISION",
        "Reload this achievement before submitting.",
      );
    if (old && !["pending", "rejected"].includes(old.status))
      throw new GameError(
        "VALIDATION_FAILED",
        "Approved achievement definitions cannot be edited.",
      );
    const next: AchievementDefinition = {
      rewardKeys: (story.progression?.keys ?? [])
        .filter((k) => k.achievementStoryNodeId === command.storyNodeId)
        .map(({ keyId, label }) => ({ keyId, label })),
      ending: {
        title: story.storyNodes[command.storyNodeId].title,
        transcript: story.storyNodes[command.storyNodeId].transcript,
        storyNodeType: story.storyNodes[command.storyNodeId].storyNodeType,
      },
      id: ref.id,
      achievementId: digest(command.storyId, command.storyNodeId),
      creatorUid: uid,
      storyId: command.storyId,
      versionId: command.versionId,
      storyNodeId: command.storyNodeId,
      title: command.title,
      description: command.description,
      revision: (old?.revision ?? 0) + 1,
      status: "pending",
      reviewReason: "",
      updatedAt: Date.now(),
    };
    tx.set(ref, next);
    tx.create(receipt, {
      fingerprint,
      result: next,
      ...paths.receiptExpiry(next.updatedAt),
    });
    return next;
  });
}

// Called before any command writes. Claims, completion and command receipts
// commit together, including first-placement leaves and isolated child runs.
export async function prepareAchievement(
  tx: Transaction,
  uid: string,
  save: Save,
) {
  const none = {
    write: () => {},
    approved: undefined as AchievementDefinition | undefined,
  };
  if (!save.completion || save.completion.revision !== save.revision)
    return none;
  const definition = await tx.get(
    definitions().doc(
      definitionId(save.storyId, save.versionId, save.storyNodeId),
    ),
  );
  if (!definition.exists) return none;
  const approved = definition.data() as AchievementDefinition;
  if (approved.status !== "approved") return none;
  const ref = db.doc(
    `users/${uid}/achievementClaims/${approved.achievementId}`,
  );
  const existing = await tx.get(ref);
  let claim: AchievementClaim | undefined;
  if (!existing.exists) {
    claim = {
      id: ref.id,
      definitionId: approved.id,
      definitionRevision: approved.revision,
      storyId: save.storyId,
      versionId: save.versionId,
      storyNodeId: save.storyNodeId,
      runId: save.id,
      title: approved.title,
      description: approved.description,
      at: save.completion.at,
    };
  }
  save.completion.accountAchievement = {
    id: approved.achievementId,
    title: approved.title,
    newlyGranted: !existing.exists,
  };
  return {
    approved,
    write: () => {
      if (claim) tx.create(ref, claim);
    },
  };
}
