import { createHash, randomUUID } from "node:crypto";
import { FieldPath, type Transaction } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import { GameError } from "../../packages/contracts/index";
import {
  adminStoryCommandSchema,
  adminUserCommandSchema,
  type AdminAuditEntry,
  type AdminOverview,
  type AdminStory,
  type AdminUser,
} from "../../packages/contracts/admin";
import {
  storedFeatures,
  type Features,
} from "../../packages/contracts/profile";
import { auth, db } from "./firebase";
import * as paths from "./paths";

// Admin routes: everything here is reached only by accounts whose features
// include admin; the handler passes the effective flags in.
const AUDIT = "adminAudit";

async function allAuthUsers() {
  const users: UserRecord[] = [];
  let page: string | undefined;
  do {
    const result = await auth.listUsers(1000, page);
    users.push(...result.users);
    page = result.pageToken;
  } while (page && users.length < 10000);
  return users;
}

async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 4096)
    throw new GameError("VALIDATION_FAILED", "Request too large.");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
}

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

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
    const [users, profiles, catalogue, drafts, playthroughs] =
      await Promise.all([
        allAuthUsers(),
        db.collection("users").get(),
        db.collection("catalogue").get(),
        db.collectionGroup("drafts").count().get(),
        db.collectionGroup("playthroughs").count().get(),
      ]);
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
    };
    return overview;
  }

  if (request.method === "GET" && area === "users" && !target) {
    const [users, profiles] = await Promise.all([
      allAuthUsers(),
      db.collection("users").get(),
    ]);
    const byUid = new Map(profiles.docs.map((d) => [d.id, d.data()]));
    const list: AdminUser[] = users.map((u) => {
      const profile = byUid.get(u.uid);
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
      };
    });
    return {
      items: list.sort((a, b) =>
        (b.lastSignIn ?? "").localeCompare(a.lastSignIn ?? ""),
      ),
    };
  }

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

  if (request.method !== "POST" || !target)
    throw new GameError("NOT_FOUND", "Route not found.");
  const actorEmail = (await auth.getUser(uid)).email ?? null;

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
    return run(uid, actorEmail, command.idempotencyKey, command, async (tx) => {
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
      tx.update(ref, change);
      const before = snapshot.data()!;
      const status = command.status ?? before.status;
      const merged = {
        features: { ...(before.features ?? {}), ...(command.features ?? {}) },
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
        },
      };
    });
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

// Runs one admin change in a transaction with an idempotency receipt and an
// audit entry, so a retry returns the first result instead of acting twice.
async function run(
  actorUid: string,
  actorEmail: string | null,
  key: string,
  command: unknown,
  apply: (tx: Transaction) => Promise<{
    audit: Pick<AdminAuditEntry, "action" | "target" | "change">;
    result: unknown;
  }>,
) {
  const fingerprint = digest(JSON.stringify(command));
  const receipt = db.doc(paths.receipt(actorUid, "admin", key));
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.data()!.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This request key was used for another change.",
        );
      return previous.data()!.result;
    }
    const { audit, result } = await apply(tx);
    const at = Date.now();
    tx.create(db.collection(AUDIT).doc(randomUUID()), {
      at,
      actorUid,
      actorEmail,
      ...audit,
      change: JSON.parse(JSON.stringify(audit.change)),
    });
    tx.create(receipt, {
      actor: actorUid,
      fingerprint,
      result,
      at,
      ...paths.receiptExpiry(at),
    });
    return result;
  });
}
