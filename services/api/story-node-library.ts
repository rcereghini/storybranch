import { createHash } from "node:crypto";
import { FieldPath, type DocumentReference } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  libraryCommandSchema,
  shareStoryNodeCommandSchema,
} from "../../packages/contracts/story-node-library";
import { assetIdOf, type PublishedClip } from "../../packages/contracts/media";
import { db, config } from "./firebase";
import type { Features } from "../../packages/contracts/profile";
import * as paths from "./paths";
import { storyNodeMedia, storyNodeImage, publishedClip } from "./uploads";
import { resolveFixtureMedia } from "../../fixtures/media";
import {
  legacyCommand,
  legacyStoryStorage,
  readStoryData,
} from "../../packages/contracts/legacy-story-format";
import { libraryRecord } from "./story-storage";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export async function sharedStoryNode(storyNodeId: string, revision: string) {
  if (!/^[1-9][0-9]*$/.test(revision))
    throw new GameError("NOT_FOUND", "StoryNode not found.");
  const record = await libraryRecord(`${storyNodeId}/revisions/${revision}`);
  if (!record?.shared) throw new GameError("NOT_FOUND", "StoryNode not found.");
  // Sharing recorded the StoryNode's files, so viewers never read clip records.
  const { clips = {}, ...storyNode } = record;
  return {
    ...storyNode,
    media: storyNodeMedia(record.content.video, clips),
    image: storyNodeImage(record.content.image, clips),
  };
}

export async function storyNodeLibrary(
  request: Request,
  uid: string,
  segments: string[],
  cursor: string | null,
  limit: number,
  features: Features,
) {
  const collection = db.collection("storyNodeLibrary");
  if (request.method === "GET" && segments.length === 2) {
    const batches = await Promise.all(
      [legacyStoryStorage.library, "storyNodeLibrary"].map(async (name) => {
        let query = db
          .collection(name)
          .where("ownerUid", "==", uid)
          .orderBy(FieldPath.documentId())
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor);
        return (await query.get()).docs;
      }),
    );
    const unique = new Map(batches.flat().map((d) => [d.id, d]));
    const ordered = [...unique.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const docs = ordered.slice(0, limit);
    return {
      items: docs.map((d) => readStoryData(d.data().latest)),
      nextCursor: ordered.length > limit ? docs.at(-1)!.id : null,
    };
  }
  if (
    request.method !== "POST" ||
    !segments[2] ||
    segments.length > 4 ||
    (segments.length === 4 && segments[3] !== "share")
  )
    throw new GameError("NOT_FOUND", "Route not found.");
  const sharing = segments[3] === "share";
  if (sharing && !features.publish)
    throw new GameError(
      "FORBIDDEN",
      "Sharing StoryNodes is limited to approved creators during alpha.",
    );
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 30000)
    throw new GameError("VALIDATION_FAILED", "StoryNode too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = sharing
    ? shareStoryNodeCommandSchema.parse(body)
    : libraryCommandSchema.parse(body);
  const fingerprint = hash(
    JSON.stringify(legacyCommand({ segments, command })),
  );
  const receipt = db.doc(
    paths.receipt(
      uid,
      legacyStoryStorage.libraryReceiptScope,
      command.idempotencyKey,
    ),
  );
  const root = collection.doc(segments[2]);
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "Request key already used.",
        );
      return readStoryData(previous.data()!.result);
    }
    const old = await libraryRecord(root.id, tx);
    if (old && old.ownerUid !== uid)
      throw new GameError("FORBIDDEN", "StoryNode belongs to another creator.");
    let result;
    if (sharing) {
      const c = shareStoryNodeCommandSchema.parse(command);
      const ref = root.collection("revisions").doc(String(c.revision));
      const record = await libraryRecord(
        `${root.id}/revisions/${c.revision}`,
        tx,
      );
      if (!record)
        throw new GameError("NOT_FOUND", "Save the StoryNode first.");
      const assets: DocumentReference[] = [];
      const clips: Record<string, PublishedClip> = {};
      for (const value of [record.content.video, record.content.image]) {
        const assetId = assetIdOf(value);
        if (!assetId) continue;
        const ref = db.doc(paths.clip(uid, assetId));
        const asset = (await tx.get(ref)).data();
        if (asset?.status !== "ready")
          throw new GameError(
            "VALIDATION_FAILED",
            "Choose your own finished assets.",
          );
        assets.push(ref);
        clips[assetId] = publishedClip(asset);
      }
      result = { ...record, shared: true };
      tx.set(ref, { ...record, shared: true, clips });
      if (old?.latest.revision === c.revision)
        tx.set(root, { ...old, latest: result });
      for (const asset of assets) tx.update(asset, { published: true });
    } else {
      const c = libraryCommandSchema.parse(command);
      if ((old?.latest.revision ?? 0) !== c.expectedRevision)
        throw new GameError(
          "STALE_REVISION",
          "Reload the StoryNode library before saving.",
        );
      for (const [field, value] of Object.entries({
        video: c.content.video,
        image: c.content.image,
      })) {
        const assetId = assetIdOf(value);
        if (assetId) {
          const asset = (await tx.get(db.doc(paths.clip(uid, assetId)))).data();
          if (
            asset?.status !== "ready" ||
            !asset.contentType.startsWith(
              field === "video" ? "video/" : "image/",
            )
          )
            throw new GameError(
              "VALIDATION_FAILED",
              "Choose your own finished asset of the correct type.",
            );
        } else if (value && !resolveFixtureMedia(value))
          throw new GameError("VALIDATION_FAILED", "Unknown clip.");
      }
      result = {
        id: root.id,
        revision: c.expectedRevision + 1,
        content: c.content,
        shared: false,
      };
      tx.create(
        root.collection("revisions").doc(String(result.revision)),
        result,
      );
      tx.set(root, { ownerUid: uid, latest: result });
    }
    tx.create(receipt, {
      actor: uid,
      fingerprint,
      result,
      at: Date.now(),
      ...paths.receiptExpiry(Date.now()),
    });
    return result;
  });
}
