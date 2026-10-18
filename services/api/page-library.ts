import { createHash } from "node:crypto";
import { FieldPath, type DocumentReference } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  libraryCommandSchema,
  sharePageCommandSchema,
} from "../../packages/contracts/page-library";
import { assetIdOf, type PublishedClip } from "../../packages/contracts/media";
import { db, config } from "./firebase";
import type { Features } from "../../packages/contracts/profile";
import * as paths from "./paths";
import { pageMedia, pageImage, publishedClip } from "./uploads";
import { resolveFixtureMedia } from "../../fixtures/media";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export async function sharedPage(pageId: string, revision: string) {
  if (!/^[1-9][0-9]*$/.test(revision))
    throw new GameError("NOT_FOUND", "Page not found.");
  const snapshot = await db
    .doc(`pageLibrary/${pageId}/revisions/${revision}`)
    .get();
  const record = snapshot.data();
  if (!record?.shared) throw new GameError("NOT_FOUND", "Page not found.");
  // Sharing recorded the page's files, so viewers never read clip records.
  const { clips = {}, ...page } = record;
  return {
    ...page,
    media: pageMedia(record.content.video, clips),
    image: pageImage(record.content.image, clips),
  };
}

export async function pageLibrary(
  request: Request,
  uid: string,
  segments: string[],
  cursor: string | null,
  limit: number,
  features: Features,
) {
  const collection = db.collection("pageLibrary");
  if (request.method === "GET" && segments.length === 2) {
    let query = collection
      .where("ownerUid", "==", uid)
      .orderBy(FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const docs = await query.get();
    return {
      items: docs.docs.map((d) => d.data().latest),
      nextCursor: docs.size === limit ? docs.docs.at(-1)!.id : null,
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
      "Sharing pages is limited to approved creators during alpha.",
    );
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 30000)
    throw new GameError("VALIDATION_FAILED", "Page too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = sharing
    ? sharePageCommandSchema.parse(body)
    : libraryCommandSchema.parse(body);
  const fingerprint = hash(JSON.stringify({ segments, command }));
  const receipt = db.doc(paths.receipt(uid, "page", command.idempotencyKey));
  const root = collection.doc(segments[2]);
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "Request key already used.",
        );
      return previous.data()!.result;
    }
    const old = (await tx.get(root)).data();
    if (old && old.ownerUid !== uid)
      throw new GameError("FORBIDDEN", "Page belongs to another creator.");
    let result;
    if (sharing) {
      const c = sharePageCommandSchema.parse(command);
      const ref = root.collection("revisions").doc(String(c.revision));
      const record = (await tx.get(ref)).data();
      if (!record) throw new GameError("NOT_FOUND", "Save the page first.");
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
      tx.update(ref, { shared: true, clips });
      if (old?.latest.revision === c.revision)
        tx.update(root, { latest: result });
      for (const asset of assets) tx.update(asset, { published: true });
    } else {
      const c = libraryCommandSchema.parse(command);
      if ((old?.latest.revision ?? 0) !== c.expectedRevision)
        throw new GameError(
          "STALE_REVISION",
          "Reload the page library before saving.",
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
