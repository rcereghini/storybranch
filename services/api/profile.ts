import { FieldPath, type DocumentData } from "firebase-admin/firestore";
import { db } from "./firebase";
import { GameError, type Save } from "../../packages/contracts/index";
import { profileUpdateSchema } from "../../packages/contracts/profile";
import {
  outlineKey,
  summarizeDashboard,
  type CatalogueOutline,
  type StoryOutline,
} from "../../packages/domain/dashboard";
import { projectProfile } from "./profile-projection";
import { version } from "./story-store";

// The dashboard summarizes at most this many recent saves.
const DASHBOARD_SAVES = 100;

export async function profileRoutes(
  request: Request,
  uid: string,
  segments: string[],
  data: DocumentData,
  tokenName?: string,
) {
  if (segments.length !== 2)
    throw new GameError("NOT_FOUND", "Route not found.");
  if (segments[1] === "profile" && request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 1024)
      throw new GameError("VALIDATION_FAILED", "Profile update too large.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
    }
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success)
      throw new GameError(
        "VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Invalid profile.",
      );
    // Only presentation fields change; stats and status stay server-owned.
    await db.doc(`playerProfiles/${uid}`).update(parsed.data);
    return projectProfile(uid, { ...data, ...parsed.data }, tokenName);
  }
  if (request.method !== "GET")
    throw new GameError("NOT_FOUND", "Route not found.");
  const profile = projectProfile(uid, data, tokenName);
  if (segments[1] === "profile") return profile;

  const [savesSnapshot, catalogueSnapshot] = await Promise.all([
    db
      .collection("playthroughs")
      .where("playerUid", "==", uid)
      .orderBy("updatedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(DASHBOARD_SAVES)
      .get(),
    db.collection("catalogue").orderBy(FieldPath.documentId()).limit(50).get(),
  ]);
  // Pre-page prototype saves have no pageId and cannot be resumed.
  const saves = savesSnapshot.docs
    .map((d) => d.data() as Save)
    .filter((s) => s.pageId);
  const catalogue: CatalogueOutline[] = catalogueSnapshot.docs
    .map((d) => d.data())
    .filter((c) => c.versionId ?? c.publishedVersionId)
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description ?? "",
      // Seeded entries name versionId; Studio publications publishedVersionId.
      versionId: c.versionId ?? c.publishedVersionId,
    }));

  const editions = new Map<string, [string, string]>();
  for (const s of saves)
    editions.set(outlineKey(s.storyId, s.versionId), [s.storyId, s.versionId]);
  for (const c of catalogue)
    editions.set(outlineKey(c.id, c.versionId), [c.id, c.versionId]);
  const outlines = new Map<string, StoryOutline>();
  await Promise.all(
    [...editions].map(async ([key, [storyId, versionId]]) => {
      try {
        const story = await db.runTransaction((tx) =>
          version(tx, storyId, versionId),
        );
        outlines.set(key, {
          title: story.title,
          pages: Object.fromEntries(
            Object.entries(story.pages).map(([pageId, page]) => [
              pageId,
              { title: page.title, kind: page.kind },
            ]),
          ),
        });
      } catch {
        // An unavailable edition still lists its saves, by id.
      }
    }),
  );
  return { profile, summary: summarizeDashboard(saves, outlines, catalogue) };
}
