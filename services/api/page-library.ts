import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  libraryCommandSchema,
  sharePageCommandSchema,
} from "../../packages/contracts/page-library";
import { assetIdOf } from "../../packages/contracts/media";
import { db, config } from "./firebase";
import { publisherAllowed } from "./creator-access";
import { pageMedia, pageImage } from "./uploads";
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
  return {
    ...record,
    media: await pageMedia(record.content.video),
    image: await pageImage(record.content.image),
  };
}

export async function pageLibrary(
  request: Request,
  uid: string,
  segments: string[],
  cursor: string | null,
  limit: number,
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
  if (
    sharing &&
    !publisherAllowed(config.mode, uid, process.env.STORYBRANCH_PUBLISHER_UIDS)
  )
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
  const receipt = db.doc(
    `commandReceipts/${hash(`${uid}:page:${command.idempotencyKey}`)}`,
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
      const assets = [];
      for (const value of [record.content.video, record.content.image]) {
        const assetId = assetIdOf(value);
        if (!assetId) continue;
        const ref = db.doc(`assets/${assetId}`);
        const asset = (await tx.get(ref)).data();
        if (asset?.ownerUid !== uid || asset.status !== "ready")
          throw new GameError(
            "VALIDATION_FAILED",
            "Choose your own finished assets.",
          );
        assets.push(ref);
      }
      result = { ...record, shared: true };
      tx.update(ref, { shared: true });
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
          const asset = (await tx.get(db.doc(`assets/${assetId}`))).data();
          if (
            asset?.ownerUid !== uid ||
            asset.status !== "ready" ||
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
    tx.create(receipt, { actor: uid, fingerprint, result, at: Date.now() });
    return result;
  });
}
