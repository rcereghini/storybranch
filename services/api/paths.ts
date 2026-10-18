import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";

// Firestore layout. Everything a player owns sits under users/{uid}; published
// stories, the catalogue and community branches are shared at the top level:
//
//   users/{uid}                              profile (stats, display fields)
//   users/{uid}/playthroughs/{saveId}        save; events/{revision} below it
//   users/{uid}/drafts/{storyId}             private Studio draft
//   users/{uid}/clips/{clipId}               uploaded or generated clip/photo
//   users/{uid}/receipts/{hash}              command idempotency, expires
//   stories/{storyId}/versions/{v}/pages/{p} immutable published editions
//   catalogue/{storyId}, branches/{id}, placements/{locationId}
//   pageLibrary/{pageId}/revisions/{r}       reusable pages (shareable)
//   generationJobs/{id}, generationQuotas/{id}
//
// Storage mirrors it: an uploaded clip's file is users/{uid}/clips/{clipId}.
export const user = (uid: string) => `users/${uid}`;
export const saves = (uid: string) => `users/${uid}/playthroughs`;
export const save = (uid: string, saveId: string) =>
  `users/${uid}/playthroughs/${saveId}`;
export const events = (uid: string, saveId: string) =>
  `users/${uid}/playthroughs/${saveId}/events`;
export const drafts = (uid: string) => `users/${uid}/drafts`;
export const clips = (uid: string) => `users/${uid}/clips`;
export const clip = (uid: string, clipId: string) =>
  `users/${uid}/clips/${clipId}`;
export const clipFile = clip;

// Receipts only answer retries of the same command, so a TTL policy on the
// receipts collection group deletes them after expireAt.
const RECEIPT_DAYS = 30;
export const receipt = (uid: string, kind: string, key: string) =>
  `users/${uid}/receipts/${createHash("sha256").update(`${uid}:${kind}:${key}`).digest("hex")}`;
export const receiptExpiry = (now: number) => ({
  expireAt: Timestamp.fromMillis(now + RECEIPT_DAYS * 24 * 60 * 60 * 1000),
});
