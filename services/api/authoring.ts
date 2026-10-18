import { createHash } from "node:crypto";
import { FieldPath, type DocumentReference } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  draftCommandSchema,
  publishCommandSchema,
  type DraftRecord,
} from "../../packages/contracts/authoring";
import { validatePublication } from "../../packages/domain/authoring";
import { resolveFixtureMedia } from "../../fixtures/media";
import { assetIdOf, type PublishedClip } from "../../packages/contracts/media";
import { db, config } from "./firebase";
import * as paths from "./paths";
import { publishedClip } from "./uploads";
import type { Features } from "../../packages/contracts/profile";
import { contentOf } from "../../packages/contracts/page-library";

export async function authoring(
  request: Request,
  uid: string,
  segments: string[],
  cursor: string | null,
  limit: number,
  features: Features,
) {
  const canPublish = features.publish;
  const collection = db.collection(paths.drafts(uid));
  const storyId = segments[2];
  if (request.method === "GET" && segments.length === 2) {
    let query = collection.orderBy(FieldPath.documentId()).limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const records = await query.get();
    return {
      canPublish,
      items: records.docs.map((d) => ({
        id: d.id,
        title: d.data().story.title,
        revision: d.data().revision,
        publishedVersionId: d.data().publishedVersionId,
      })),
      nextCursor: records.size === limit ? records.docs.at(-1)!.id : null,
    };
  }
  if (!storyId) throw new GameError("NOT_FOUND", "Draft not found.");
  const ref = collection.doc(storyId);
  if (request.method === "GET" && segments.length === 3) {
    const record = await ref.get();
    if (!record.exists) throw new GameError("NOT_FOUND", "Draft not found.");
    return record.data();
  }
  const publishing = segments.length === 4 && segments[3] === "publish";
  if (request.method !== "POST" || (!publishing && segments.length !== 3))
    throw new GameError("NOT_FOUND", "Route not found.");
  if (publishing && !canPublish)
    throw new GameError(
      "FORBIDDEN",
      "Publishing is limited to approved creators during this alpha.",
    );
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 250000)
    throw new GameError("VALIDATION_FAILED", "Draft exceeds the 250 KB limit.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = publishing
    ? publishCommandSchema.parse(body)
    : draftCommandSchema.parse(body);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ segments, command }))
    .digest("hex");
  const receipt = db.doc(paths.receipt(uid, "author", command.idempotencyKey));
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This request key was already used. Reload the saved draft.",
        );
      return previous.data()!.result;
    }
    const current = await tx.get(ref);
    const old = current.data() as DraftRecord | undefined;
    const root = db.doc(`stories/${storyId}`);
    const rootSnapshot = await tx.get(root);
    if (rootSnapshot.exists && rootSnapshot.data()!.creatorUid !== uid)
      throw new GameError(
        "FORBIDDEN",
        "That story ID belongs to another creator.",
      );
    if ((old?.revision ?? 0) !== command.expectedRevision)
      throw new GameError(
        "STALE_REVISION",
        "This draft changed elsewhere. Reload it before saving or publishing.",
      );
    let result: DraftRecord;
    if (!publishing) {
      const c = draftCommandSchema.parse(command);
      if (c.draft.story.id !== storyId)
        throw new GameError(
          "VALIDATION_FAILED",
          "Story ID does not match the draft.",
        );
      result = {
        ...c.draft,
        revision: (old?.revision ?? 0) + 1,
        publishedVersionId: old?.publishedVersionId ?? null,
      };
      if (!rootSnapshot.exists) tx.create(root, { creatorUid: uid });
      tx.set(ref, result);
    } else {
      if (!old) throw new GameError("NOT_FOUND", "Save your draft first.");
      const versionId = `edition-${old.revision}`;
      const story = validatePublication({ ...old.story, versionId });
      // Only the publisher's own finished clips and photos; the edition records
      // each file so players never read the creator's clip records.
      const clips = new Map<string, DocumentReference>();
      const published: Record<string, PublishedClip> = {};
      for (const page of Object.values(story.pages)) {
        if (page.sourcePage) {
          const root = (
            await tx.get(db.doc(`pageLibrary/${page.sourcePage.id}`))
          ).data();
          const source = (
            await tx.get(
              db.doc(
                `pageLibrary/${page.sourcePage.id}/revisions/${page.sourcePage.revision}`,
              ),
            )
          ).data();
          if (
            root?.ownerUid !== uid ||
            !source ||
            JSON.stringify(contentOf(page)) !== JSON.stringify(source.content)
          )
            throw new GameError(
              "VALIDATION_FAILED",
              `${page.title}: the linked page revision does not match. Save it to the library again.`,
            );
        }
        const imageId = assetIdOf(page.image);
        if (imageId) {
          const image = db.doc(paths.clip(uid, imageId));
          const asset = (await tx.get(image)).data();
          if (asset?.status !== "ready" || !asset.contentType.startsWith("image/"))
            throw new GameError(
              "VALIDATION_FAILED",
              `${page.title}: choose one of your finished photos.`,
            );
          clips.set(imageId, image);
          published[imageId] = publishedClip(asset);
        }
        const assetId = assetIdOf(page.video);
        if (assetId) {
          const clip = db.doc(paths.clip(uid, assetId));
          const asset = (await tx.get(clip)).data();
          if (asset?.status !== "ready" || !asset.contentType.startsWith("video/"))
            throw new GameError(
              "VALIDATION_FAILED",
              `${page.title}: choose one of your finished uploads or a sample clip.`,
            );
          clips.set(assetId, clip);
          published[assetId] = publishedClip(asset);
        } else if (page.video && !resolveFixtureMedia(page.video))
          throw new GameError(
            "VALIDATION_FAILED",
            `${page.title}: choose an available sample clip.`,
          );
        if (page.branchLocation)
          throw new GameError(
            "VALIDATION_FAILED",
            "Community location authoring is not available yet.",
          );
      }
      const version = root.collection("versions").doc(versionId);
      const existing = await tx.get(version);
      const manifestHash = createHash("sha256")
        .update(JSON.stringify(story))
        .digest("hex");
      if (existing.exists && existing.data()!.manifestHash !== manifestHash)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "Published editions cannot change. Save a new draft revision.",
        );
      if (!existing.exists) {
        const { pages, ...manifest } = story;
        tx.create(version, {
          ...manifest,
          ready: true,
          manifestHash,
          ...(clips.size ? { clips: published } : {}),
        });
        for (const page of Object.values(pages))
          tx.create(version.collection("pages").doc(page.id), page);
      }
      // Published clips stay available to every pinned save.
      for (const clip of clips.values()) tx.update(clip, { published: true });
      result = { ...old, publishedVersionId: versionId };
      tx.set(ref, result);
      tx.update(root, { publishedVersionId: versionId });
      // Merge keeps an admin's hidden flag across republishing.
      tx.set(
        db.doc(`catalogue/${storyId}`),
        {
          id: storyId,
          title: story.title,
          description: old.description,
          publishedVersionId: versionId,
        },
        { merge: true },
      );
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
