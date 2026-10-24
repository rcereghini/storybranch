import type { UserRecord } from "firebase-admin/auth";
import type { DocumentData } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import type {
  AdminAuditEntry,
  AdminUser,
  AdminUserDetail,
  AdminUsersPage,
  AdminUsersQuery,
} from "../../packages/contracts/admin";
import type { EmailLogEntry } from "../../packages/contracts/email";
import { storedFeatures } from "../../packages/contracts/profile";
import {
  effectiveLimits,
  storedAccountLimits,
} from "../../packages/contracts/settings";
import type { AiUsage } from "../../packages/contracts/usage";
import {
  addTotals,
  dayRange,
  emptyTotals,
  usageTotals,
} from "../../packages/domain/usage";
import { AUDIT } from "./admin-audit";
import { auth, db } from "./firebase";
import * as paths from "./paths";
import { appSettings } from "./settings";

// Firebase Auth can't search, so the list is read whole (the first 10,000
// sign-ups) and kept for 30 seconds; search, filters and paging happen here
// and the browser receives one page. Past that size, profiles need the email
// copied onto them so Firestore can search instead.
const maxAccounts = 10000;
const pageSize = 50;
const cacheMs = 30000;
let cached: { at: number; users: AdminUser[] } | null = null;
export const clearUsersCache = () => {
  cached = null;
};

export function adminUser(u: UserRecord, profile: DocumentData | undefined) {
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName:
      (typeof profile?.displayName === "string" && profile.displayName) ||
      u.displayName ||
      "Player",
    status: !profile
      ? "no-profile"
      : profile.status === "active"
        ? "active"
        : "disabled",
    features: storedFeatures(profile),
    createdAt: u.metadata.creationTime
      ? new Date(u.metadata.creationTime).toISOString()
      : null,
    lastSignIn: u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime).toISOString()
      : null,
    lastActive: u.metadata.lastRefreshTime
      ? new Date(u.metadata.lastRefreshTime).toISOString()
      : null,
  } satisfies AdminUser;
}

export async function allUsers() {
  if (cached && Date.now() - cached.at < cacheMs) return cached.users;
  const records: UserRecord[] = [];
  let token: string | undefined;
  do {
    const result = await auth.listUsers(1000, token);
    records.push(...result.users);
    token = result.pageToken;
  } while (token && records.length < maxAccounts);
  const profiles = await db.collection("users").get();
  const byUid = new Map(profiles.docs.map((d) => [d.id, d.data()]));
  const users = records
    .map((u) => adminUser(u, byUid.get(u.uid)))
    .sort((a, b) => (b.lastSignIn ?? "").localeCompare(a.lastSignIn ?? ""));
  cached = { at: Date.now(), users };
  return users;
}

export async function listUsers(
  query: AdminUsersQuery,
): Promise<AdminUsersPage> {
  const users = await allUsers();
  const q = query.q.toLowerCase();
  const matching = users.filter(
    (u) =>
      (!q ||
        `${u.email ?? ""} ${u.displayName} ${u.uid}`
          .toLowerCase()
          .includes(q)) &&
      (query.status === "all" || u.status === query.status) &&
      (!query.feature ||
        u.features[query.feature] ||
        (query.feature !== "admin" && u.features.admin)),
  );
  const items = matching.slice(query.cursor, query.cursor + pageSize);
  return {
    items,
    total: matching.length,
    scanned: users.length,
    nextCursor:
      query.cursor + pageSize < matching.length
        ? query.cursor + pageSize
        : null,
  };
}

// Equality-only queries need no composite index; the newest are picked here.
async function newest<T extends { at: number }>(
  collection: string,
  field: string,
  value: string,
  count: number,
  map: (id: string, data: DocumentData) => T,
) {
  const docs = await db
    .collection(collection)
    .where(field, "==", value)
    .limit(500)
    .get();
  return docs.docs
    .map((d) => map(d.id, d.data()))
    .sort((a, b) => b.at - a.at)
    .slice(0, count);
}

export async function userDetail(uid: string): Promise<AdminUserDetail> {
  let record: UserRecord;
  try {
    record = await auth.getUser(uid);
  } catch {
    throw new GameError("NOT_FOUND", "Account not found.");
  }
  const days = dayRange(Date.now(), 30);
  const [
    profile,
    roots,
    drafts,
    draftCount,
    playthroughs,
    usage,
    ai,
    images,
    settings,
  ] = await Promise.all([
    db.doc(paths.user(uid)).get(),
    db.collection("stories").where("creatorUid", "==", uid).limit(100).get(),
    db.collection(paths.drafts(uid)).limit(20).get(),
    db.collection(paths.drafts(uid)).count().get(),
    db.collection(paths.saves(uid)).count().get(),
    db.getAll(...days.map((day) => db.doc(`aiUsageUsers/${day}_${uid}`))),
    db.doc(paths.aiQuota(uid)).get(),
    db.doc(paths.imageQuota(uid)).get(),
    appSettings(),
  ]);
  const listings = roots.size
    ? await db.getAll(...roots.docs.map((r) => db.doc(`catalogue/${r.id}`)))
    : [];
  const [emails, audit] = await Promise.all([
    newest<EmailLogEntry>("emailLog", "uid", uid, 20, (id, e) => ({
      id,
      template: e.template,
      version: e.version,
      test: e.test === true,
      to: e.to,
      uid: e.uid ?? null,
      status: e.status,
      detail: e.detail ?? null,
      at: e.at,
    })),
    newest<AdminAuditEntry>(AUDIT, "target", uid, 20, (id, e) => ({
      id,
      ...(e as Omit<AdminAuditEntry, "id">),
    })),
  ]);
  const data = profile.data();
  return {
    user: {
      ...adminUser(record, data),
      emailVerified: record.emailVerified,
      providers: record.providerData.map((p) => p.providerId),
      signInBlocked: record.disabled,
    },
    limits: {
      own: storedAccountLimits(data),
      effective: effectiveLimits(data, settings),
      defaults: settings.limits,
      usedToday: {
        ai: ai.data()?.count ?? 0,
        images: images.data()?.count ?? 0,
      },
    },
    // Published stories are the ones in the catalogue.
    stories: listings.flatMap((l) =>
      l.exists
        ? [
            {
              id: l.id,
              title: (l.data()!.title as string) ?? l.id,
              hidden: l.data()!.hidden === true,
            },
          ]
        : [],
    ),
    drafts: {
      count: draftCount.data().count,
      titles: drafts.docs.map(
        (d) => (d.data().story?.title as string | undefined) || d.id,
      ),
    },
    playthroughs: playthroughs.data().count,
    usage30d: usage.reduce(
      (sum, d) =>
        d.exists
          ? addTotals(sum, usageTotals(d.data() as AiUsage, settings.prices))
          : sum,
      emptyTotals(),
    ),
    emails,
    audit,
  };
}
