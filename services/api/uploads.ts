import { createHash, randomUUID } from "node:crypto";
import * as paths from "./paths";
import type { DocumentData } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  assetIdOf,
  uploadCommandSchema,
  uploadLimits,
  type ClipAsset,
  type PublishedClip,
  type SceneMedia,
  type UploadListing,
  type videoTypes,
} from "../../packages/contracts/media";
import { resolveFixtureMedia } from "../../fixtures/media";
import { db, bucket, config } from "./firebase";
import { publisherAllowed } from "./creator-access";
import { downloadUrl, sniffAsset } from "./video-check";

// A clip's record is users/{uid}/clips/{assetId} and its file sits at the
// same path in Storage. The browser uploads straight to Storage; Storage rules
// accept only a pending clip this API created for the same user, with the
// declared size and type (firebase/storage.rules).
function access(uid: string) {
  if (!config.storageHost && config.mode === "emulator")
    return "Clip uploads are not available in this preview.";
  if (
    !publisherAllowed(config.mode, uid, process.env.STORYBRANCH_PUBLISHER_UIDS)
  )
    return "Clip uploads are limited to approved creators during this alpha.";
  return null;
}

const fileUrl = (file: PublishedClip) =>
  downloadUrl(config.storageHost, config.bucket, file.path, file.token);
const clipMedia = (clip: PublishedClip): SceneMedia | undefined =>
  clip.contentType.startsWith("video/")
    ? {
        landscape: {
          src: fileUrl(clip),
          type: clip.contentType as (typeof videoTypes)[number],
        },
      }
    : undefined;
export const assetMedia = (asset: DocumentData) =>
  asset.status === "ready" ? clipMedia(asset as PublishedClip) : undefined;
export const publishedClip = (asset: DocumentData): PublishedClip => ({
  path: asset.path,
  token: asset.token,
  contentType: asset.contentType,
});

export function assetView(id: string, asset: DocumentData): ClipAsset {
  return {
    id,
    fileName: asset.fileName,
    contentType: asset.contentType,
    bytes: asset.bytes,
    durationSeconds: asset.durationSeconds,
    status: asset.status,
    published: asset.published,
    createdAt: asset.createdAt,
    ...(asset.status === "ready"
      ? asset.contentType.startsWith("video/")
        ? { media: assetMedia(asset) }
        : { url: fileUrl(asset as PublishedClip) }
      : {}),
  };
}

// Media for a page in a published edition (or a shared library page): a
// shipped clip or an uploaded file recorded when it was published.
export function pageMedia(
  video: string | undefined,
  clips: Record<string, PublishedClip>,
) {
  const assetId = assetIdOf(video);
  if (!assetId) return resolveFixtureMedia(video ?? "");
  return clips[assetId] ? clipMedia(clips[assetId]) : undefined;
}

export function pageImage(
  image: string | undefined,
  clips: Record<string, PublishedClip>,
) {
  const file = clips[assetIdOf(image) ?? ""];
  return file?.contentType.startsWith("image/") ? fileUrl(file) : undefined;
}

export async function uploads(
  request: Request,
  uid: string,
  segments: string[],
) {
  const reason = access(uid);
  if (request.method === "GET" && segments.length === 2) {
    const records = await db
      .collection(paths.clips(uid))
      .limit(uploadLimits.maxAssets)
      .get();
    const listing: UploadListing = {
      enabled: !reason,
      reason,
      items: records.docs
        .map((d) => assetView(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt),
    };
    return listing;
  }
  if (request.method !== "POST")
    throw new GameError("NOT_FOUND", "Route not found.");
  if (reason) throw new GameError("FORBIDDEN", reason);
  if (segments.length === 2) return create(request, uid);
  if (segments.length === 4 && segments[3] === "complete")
    return complete(uid, segments[2]);
  throw new GameError("NOT_FOUND", "Route not found.");
}

async function create(request: Request, uid: string) {
  const raw = await request.text();
  if (raw.length > 4096)
    throw new GameError("VALIDATION_FAILED", "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = uploadCommandSchema.parse(body);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const receipt = db.doc(paths.receipt(uid, "upload", command.idempotencyKey));
  const previous = await receipt.get();
  if (previous.exists) {
    if (previous.data()!.fingerprint !== fingerprint)
      throw new GameError(
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used for another file.",
      );
    return previous.data()!.result;
  }
  // A soft cap: concurrent requests can pass together, which is acceptable here.
  const owned = await db.collection(paths.clips(uid)).count().get();
  if (owned.data().count >= uploadLimits.maxAssets)
    throw new GameError(
      "VALIDATION_FAILED",
      `You can keep up to ${uploadLimits.maxAssets} clips during this alpha.`,
    );
  const assetId = randomUUID();
  const asset = {
    ownerUid: uid,
    status: "pending",
    published: false,
    path: paths.clipFile(uid, assetId),
    fileName: command.fileName,
    contentType: command.contentType,
    bytes: command.bytes,
    durationSeconds: command.durationSeconds,
    // Becomes the Storage download token once the file is verified.
    token: randomUUID(),
    createdAt: Date.now(),
  };
  const result = { asset: assetView(assetId, asset), path: asset.path };
  await db.runTransaction(async (tx) => {
    const again = await tx.get(receipt);
    if (again.exists) return;
    tx.create(db.doc(paths.clip(uid, assetId)), asset);
    tx.create(receipt, {
      actor: uid,
      fingerprint,
      result,
      at: Date.now(),
      ...paths.receiptExpiry(Date.now()),
    });
  });
  const stored = (await receipt.get()).data()!;
  if (stored.fingerprint !== fingerprint)
    throw new GameError(
      "IDEMPOTENCY_CONFLICT",
      "This request key was already used for another file.",
    );
  return stored.result;
}

async function complete(uid: string, assetId: string) {
  const ref = db.doc(paths.clip(uid, assetId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new GameError("NOT_FOUND", "Clip not found.");
  const asset = snapshot.data()!;
  if (asset.status === "ready") return { asset: assetView(assetId, asset) };
  const file = bucket.file(asset.path);
  const [exists] = await file.exists();
  if (!exists)
    throw new GameError(
      "VALIDATION_FAILED",
      "The upload has not finished. Try again in a moment.",
    );
  const [metadata] = await file.getMetadata();
  const [head] = await file.download({ start: 0, end: 63 });
  if (
    Number(metadata.size) !== asset.bytes ||
    metadata.contentType !== asset.contentType ||
    sniffAsset(new Uint8Array(head)) !== asset.contentType
  ) {
    await file.delete({ ignoreNotFound: true });
    await ref.delete();
    throw new GameError(
      "VALIDATION_FAILED",
      "That file does not match its declared image or video format. Choose another file.",
    );
  }
  await file.setMetadata({
    metadata: { firebaseStorageDownloadTokens: asset.token },
  });
  const ready = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data()!;
    if (current.status !== "ready")
      tx.update(ref, { status: "ready", readyAt: Date.now() });
    return { ...current, status: "ready" };
  });
  return { asset: assetView(assetId, ready) };
}
