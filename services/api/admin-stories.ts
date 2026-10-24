import { FieldPath } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import type {
  AdminAuditEntry,
  AdminStory,
  AdminStoryDetail,
} from "../../packages/contracts/admin";
import { storyStats } from "../../packages/domain/analytics";
import { legacyStoryStorage } from "../../packages/contracts/legacy-story-format";
import { AUDIT } from "./admin-audit";
import { allSaves } from "./analytics";
import { auth, db } from "./firebase";

async function creatorEmails(uids: string[]) {
  const unique = [...new Set(uids.filter(Boolean))];
  return new Map(
    unique.length
      ? (await auth.getUsers(unique.map((uid) => ({ uid })))).users.map((u) => [
          u.uid,
          u.email ?? null,
        ])
      : [],
  );
}

// Published stories (the catalogue) with their creator and play counts.
export async function listStories(): Promise<{ items: AdminStory[] }> {
  const [catalogue, saves] = await Promise.all([
    db.collection("catalogue").orderBy(FieldPath.documentId()).get(),
    allSaves(),
  ]);
  const roots = await Promise.all(
    catalogue.docs.map((d) => db.doc(`stories/${d.id}`).get()),
  );
  const emails = await creatorEmails(
    roots.map((r) => r.data()?.creatorUid as string),
  );
  const now = Date.now();
  return {
    items: catalogue.docs.map((d, i) => {
      const data = d.data();
      const creatorUid = (roots[i].data()?.creatorUid as string) ?? null;
      const stats = storyStats(saves.saves, d.id, now);
      return {
        id: d.id,
        title: data.title ?? d.id,
        description: data.description ?? "",
        publishedVersionId: data.publishedVersionId ?? data.versionId ?? null,
        creatorUid,
        creatorEmail: creatorUid ? (emails.get(creatorUid) ?? null) : null,
        hidden: data.hidden === true,
        players: stats.players,
        finishers: stats.finishers,
      };
    }),
  };
}

// Edition IDs like edition-12 sort by number; others (fixtures) by name.
const editionOrder = (a: string, b: string) => {
  const n = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? NaN);
  return Number.isNaN(n(a)) || Number.isNaN(n(b))
    ? b.localeCompare(a)
    : n(b) - n(a);
};

export async function storyDetail(id: string): Promise<AdminStoryDetail> {
  const [listing, root, versions, saves, audit] = await Promise.all([
    db.doc(`catalogue/${id}`).get(),
    db.doc(`stories/${id}`).get(),
    db.collection(`stories/${id}/versions`).get(),
    allSaves(),
    db.collection(AUDIT).where("target", "==", id).limit(500).get(),
  ]);
  if (!listing.exists && !root.exists)
    throw new GameError("NOT_FOUND", "Story not found.");
  const data = listing.data() ?? {};
  const creatorUid = (root.data()?.creatorUid as string) ?? null;
  const emails = await creatorEmails(creatorUid ? [creatorUid] : []);
  const stats = storyStats(saves.saves, id, Date.now());
  const current =
    (data.publishedVersionId as string | undefined) ??
    (data.versionId as string | undefined) ??
    (root.data()?.publishedVersionId as string | undefined) ??
    null;
  // StoryNodes are counted in whichever collection the edition was published
  // with; older editions used the legacy name.
  const editions = await Promise.all(
    versions.docs
      .filter((v) => v.data().ready === true)
      .map(async (v) => {
        const manifest = v.data();
        const nodes = Object.hasOwn(manifest, "entryStoryNodeId")
          ? "storyNodes"
          : legacyStoryStorage.nodes;
        const count = await v.ref.collection(nodes).count().get();
        return {
          versionId: v.id,
          title: (manifest.title as string) ?? id,
          current: v.id === current,
          storyNodes: count.data().count,
          players: stats.byEdition[v.id]?.players ?? 0,
          finishers: stats.byEdition[v.id]?.finishers ?? 0,
        };
      }),
  );
  return {
    story: {
      id,
      title: (data.title as string) ?? id,
      description: (data.description as string) ?? "",
      publishedVersionId: current,
      creatorUid,
      creatorEmail: creatorUid ? (emails.get(creatorUid) ?? null) : null,
      hidden: data.hidden === true,
      players: stats.players,
      finishers: stats.finishers,
      genre: (data.genre as string | undefined) ?? null,
      duration: (data.duration as string | undefined) ?? null,
    },
    stats: {
      players: stats.players,
      finishers: stats.finishers,
      completionRate: stats.completionRate,
      recentPlayers: stats.recentPlayers,
      lastPlayedAt: stats.lastPlayedAt,
    },
    editions: editions.sort((a, b) => editionOrder(a.versionId, b.versionId)),
    audit: audit.docs
      .map((d) => ({ id: d.id, ...d.data() }) as AdminAuditEntry)
      .sort((a, b) => b.at - a.at)
      .slice(0, 20),
  };
}
