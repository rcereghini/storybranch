import { FieldPath } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import { GameError } from "../../packages/contracts/index";
import {
  adminStoryCommandSchema,
  adminUserCommandSchema,
  adminUsersQuerySchema,
  type AdminAuditEntry,
  type AdminOverview,
  type AdminStory,
  type AdminUser,
} from "../../packages/contracts/admin";
import {
  storedFeatures,
  type Features,
} from "../../packages/contracts/profile";
import { usageReportDays } from "../../packages/contracts/usage";
import {
  addTotals,
  emptyTotals,
  usageTotals,
} from "../../packages/domain/usage";
import { auth, db } from "./firebase";
import * as paths from "./paths";
import { aiUsageDays, usageReport } from "./usage-report";
import { AUDIT, run } from "./admin-audit";
import {
  appSettings,
  clearSettingsCache,
  readSettings,
  settingsRef,
} from "./settings";
import {
  adminSettingsCommandSchema,
  settingsChanges,
} from "../../packages/contracts/settings";
import { emailCommand, emailLog, listEmails } from "./admin-emails";
import { clearUsersCache, listUsers, userDetail } from "./admin-users";
import { storedAccountLimits } from "../../packages/contracts/settings";

// Admin routes: everything here is reached only by accounts whose features
// include admin; the handler passes the effective flags in.

async function allAuthUsers() {
  const users: UserRecord[] = [];
  let cursor: string | undefined;
  do {
    const result = await auth.listUsers(1000, cursor);
    users.push(...result.users);
    cursor = result.pageToken;
  } while (cursor && users.length < 10000);
  return users;
}

async function body(request: Request, max = 4096) {
  const raw = await request.text();
  if (raw.length > max)
    throw new GameError("VALIDATION_FAILED", "Request too large.");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
}

export async function admin(
  request: Request,
  uid: string,
  segments: string[],
  features: Features,
) {
  if (!features.admin) throw new GameError("FORBIDDEN", "Admins only.");
  const [, , area, target, ...rest] = segments;
  if (rest.length) throw new GameError("NOT_FOUND", "Route not found.");

  if (request.method === "GET" && area === "overview" && !target) {
    const [users, profiles, catalogue, drafts, playthroughs, usage, settings] =
      await Promise.all([
        allAuthUsers(),
        db.collection("users").get(),
        db.collection("catalogue").get(),
        db.collectionGroup("drafts").count().get(),
        db.collectionGroup("playthroughs").count().get(),
        aiUsageDays(30),
        appSettings(),
      ]);
    const ai = usage.reduce(
      (sum, day) => addTotals(sum, usageTotals(day, settings.prices)),
      emptyTotals(),
    );
    const overview: AdminOverview = {
      users: users.length,
      disabledUsers: profiles.docs.filter((d) => d.data().status === "disabled")
        .length,
      admins: profiles.docs.filter((d) => storedFeatures(d.data()).admin)
        .length,
      publishedStories: catalogue.size,
      hiddenStories: catalogue.docs.filter((d) => d.data().hidden === true)
        .length,
      drafts: drafts.data().count,
      playthroughs: playthroughs.data().count,
      aiRequests30d: ai.claudeRequests + ai.images,
      aiEstimatedUsd30d: ai.estimatedUsd,
    };
    return overview;
  }

  if (request.method === "GET" && area === "usage" && !target) {
    const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
    if (!(usageReportDays as readonly number[]).includes(days))
      throw new GameError("VALIDATION_FAILED", "Choose 7, 30 or 90 days.");
    return usageReport(days);
  }

  if (request.method === "GET" && area === "users" && !target)
    return listUsers(
      adminUsersQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  if (request.method === "GET" && area === "users" && target)
    return userDetail(target);

  if (request.method === "GET" && area === "stories" && !target) {
    const catalogue = await db
      .collection("catalogue")
      .orderBy(FieldPath.documentId())
      .get();
    const roots = await Promise.all(
      catalogue.docs.map((d) => db.doc(`stories/${d.id}`).get()),
    );
    const creators = [
      ...new Set(roots.map((r) => r.data()?.creatorUid).filter(Boolean)),
    ] as string[];
    const emails = new Map(
      creators.length
        ? (
            await auth.getUsers(creators.map((creator) => ({ uid: creator })))
          ).users.map((u) => [u.uid, u.email ?? null])
        : [],
    );
    const list: AdminStory[] = catalogue.docs.map((d, i) => {
      const data = d.data();
      const creatorUid = roots[i].data()?.creatorUid ?? null;
      return {
        id: d.id,
        title: data.title ?? d.id,
        description: data.description ?? "",
        publishedVersionId: data.publishedVersionId ?? data.versionId ?? null,
        creatorUid,
        creatorEmail: creatorUid ? (emails.get(creatorUid) ?? null) : null,
        hidden: data.hidden === true,
      };
    });
    return { items: list };
  }

  if (request.method === "GET" && area === "audit" && !target) {
    const entries = await db
      .collection(AUDIT)
      .orderBy("at", "desc")
      .limit(100)
      .get();
    return {
      items: entries.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as AdminAuditEntry[],
    };
  }

  if (request.method === "GET" && area === "emails" && !target)
    return listEmails();
  // Fresh, not cached: the editor must start from what is stored.
  if (request.method === "GET" && area === "settings" && !target)
    return readSettings((await settingsRef().get()).data());
  if (request.method === "GET" && area === "email-log" && !target)
    return emailLog();

  if (request.method !== "POST" || !target)
    throw new GameError("NOT_FOUND", "Route not found.");
  const actorEmail = (await auth.getUser(uid)).email ?? null;

  if (area === "emails")
    return emailCommand(uid, actorEmail, target, await body(request, 16384));

  if (area === "settings" && target === "app") {
    const command = adminSettingsCommandSchema.parse(
      await body(request, 16384),
    );
    const result = await run(
      uid,
      actorEmail,
      command.idempotencyKey,
      command,
      async (tx) => {
        const current = readSettings((await tx.get(settingsRef())).data());
        if (current.revision !== command.expectedRevision)
          throw new GameError(
            "STALE_REVISION",
            "Settings changed in another tab. Reload them before saving.",
          );
        const changes = settingsChanges(current.settings, command.settings);
        if (!changes.length)
          throw new GameError("VALIDATION_FAILED", "Nothing has changed.");
        const revision = current.revision + 1;
        tx.set(settingsRef(), {
          settings: command.settings,
          revision,
          updatedAt: Date.now(),
          updatedBy: actorEmail,
        });
        return {
          audit: { action: "settings", target: "app", change: { changes } },
          result: { revision },
        };
      },
    );
    clearSettingsCache();
    return result;
  }

  if (area === "users") {
    const command = adminUserCommandSchema.parse(await body(request));
    const ref = db.doc(paths.user(target));
    // Admins cannot lock themselves out; another admin has to do it. So the
    // API can never remove the last admin: the actor is one.
    if (target === uid) {
      if (command.features?.admin === false)
        throw new GameError(
          "VALIDATION_FAILED",
          "You cannot remove your own admin access.",
        );
      if (command.status === "disabled")
        throw new GameError(
          "VALIDATION_FAILED",
          "You cannot disable your own account.",
        );
    }
    const result = await run(
      uid,
      actorEmail,
      command.idempotencyKey,
      command,
      async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists)
          throw new GameError(
            "NOT_FOUND",
            "This account has no profile yet. It is created on first sign-in.",
          );
        const change: Record<string, unknown> = {};
        for (const [feature, on] of Object.entries(command.features ?? {}))
          change[`features.${feature}`] = on;
        if (command.status) change.status = command.status;
        if (command.limits) change.limits = command.limits;
        if (Object.keys(change).length) tx.update(ref, change);
        for (const kind of command.resetToday ?? [])
          tx.delete(
            db.doc(
              kind === "ai" ? paths.aiQuota(target) : paths.imageQuota(target),
            ),
          );
        const before = snapshot.data()!;
        const status = command.status ?? before.status;
        const merged = {
          features: { ...(before.features ?? {}), ...(command.features ?? {}) },
          limits: command.limits ?? before.limits,
        };
        return {
          audit: {
            action: "user",
            target,
            change: { ...command, idempotencyKey: undefined },
          },
          result: {
            uid: target,
            status: status === "active" ? "active" : "disabled",
            features: storedFeatures(merged),
            limits: storedAccountLimits(merged),
          },
        };
      },
    );
    clearUsersCache();
    // Disabling also signs them out everywhere at once (tokens are checked for
    // revocation) and blocks signing in until an admin enables them again.
    if (command.status === "disabled") {
      await auth.revokeRefreshTokens(target);
      await auth.updateUser(target, { disabled: true });
    } else if (command.status === "active")
      await auth.updateUser(target, { disabled: false });
    return result;
  }

  if (area === "stories") {
    const command = adminStoryCommandSchema.parse(await body(request));
    const ref = db.doc(`catalogue/${target}`);
    return run(uid, actorEmail, command.idempotencyKey, command, async (tx) => {
      if (!(await tx.get(ref)).exists)
        throw new GameError("NOT_FOUND", "Story not found in the catalogue.");
      tx.update(ref, { hidden: command.hidden });
      return {
        audit: { action: "story", target, change: { hidden: command.hidden } },
        result: { id: target, hidden: command.hidden },
      };
    });
  }
  throw new GameError("NOT_FOUND", "Route not found.");
}
