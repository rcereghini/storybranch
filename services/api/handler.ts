import { createHash, randomUUID } from "node:crypto";
import { FieldPath, type Transaction } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { auth, db } from "./firebase";
import {
  GameError,
  id,
  startSchema,
  choiceCommandSchema,
  branchCommandSchema,
  type Save,
  type Story,
  type Stats,
} from "../../packages/contracts/index";
import { start, transition, validateStory } from "../../packages/domain/index";
import { resolveFixtureMedia } from "../../fixtures/media";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
async function owner(saveId: string, uid: string) {
  const d = await db.doc(`playthroughs/${saveId}`).get();
  if (!d.exists) throw new GameError("NOT_FOUND", "Adventure not found.");
  const s = d.data() as Save;
  if (s.playerUid !== uid)
    throw new GameError(
      "FORBIDDEN",
      "This adventure belongs to another player.",
    );
  return s;
}
async function version(
  tx: Transaction,
  storyId: string,
  versionId: string,
): Promise<Story> {
  const ref = db.doc(`stories/${storyId}/versions/${versionId}`);
  const manifest = await tx.get(ref);
  if (!manifest.exists || !manifest.data()!.ready)
    throw new GameError("NOT_FOUND", "Story edition unavailable.");
  const nodes = await tx.get(ref.collection("nodes"));
  const { manifestHash: _, ready: __, ...data } = manifest.data()!;
  return validateStory({
    ...data,
    nodes: Object.fromEntries(nodes.docs.map((n) => [n.id, n.data()])),
  });
}
export async function handle(request: Request): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace("/.netlify/functions/api", "/api");
    const segments = path.split("/").filter(Boolean);
    for (const segment of segments) id.parse(segment);
    const cursor = url.searchParams.get("cursor");
    if (cursor) id.parse(cursor);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new GameError("VALIDATION_FAILED", "Page size must be 1–50.");
    if (request.method === "GET" && path === "/api/catalogue") {
      let q = db
        .collection("catalogue")
        .orderBy(FieldPath.documentId())
        .limit(limit);
      if (cursor) q = q.startAfter(cursor);
      const docs = await q.get();
      return json({
        items: docs.docs.map((d) => d.data()),
        nextCursor: docs.size === limit ? docs.docs.at(-1)!.id : null,
      });
    }
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
      throw new GameError("UNAUTHENTICATED", "Sign in to save your adventure.");
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(token)).uid;
    } catch {
      throw new GameError(
        "UNAUTHENTICATED",
        "Your session expired. Sign in again.",
      );
    }
    const profile = await db.doc(`playerProfiles/${uid}`).get();
    if (!profile.exists || profile.data()!.status !== "active")
      throw new GameError(
        "FORBIDDEN",
        "This account is not enabled for the local prototype. Use a seeded account.",
      );
    if (request.method === "GET") {
      if (path === "/api/playthroughs") {
        let q = db
          .collection("playthroughs")
          .where("playerUid", "==", uid)
          .orderBy("updatedAt", "desc")
          .orderBy(FieldPath.documentId(), "desc")
          .limit(limit);
        if (cursor) {
          const [timestamp, saveId] = cursor.split("_");
          if (!/^\d{13}$/.test(timestamp) || !saveId)
            throw new GameError("VALIDATION_FAILED", "Invalid save cursor.");
          id.parse(saveId);
          q = q.startAfter(Number(timestamp), saveId);
        }
        const d = await q.get();
        return json({
          items: d.docs.map((x) => x.data()),
          nextCursor:
            d.size === limit
              ? `${d.docs.at(-1)!.data().updatedAt}_${d.docs.at(-1)!.id}`
              : null,
        });
      }
      const saveId = segments[2];
      if (segments[1] === "playthroughs" && saveId) {
        const s = await owner(saveId, uid);
        if (segments[3] === "events") {
          let q = db
            .collection(`playthroughs/${saveId}/events`)
            .orderBy(FieldPath.documentId())
            .limit(limit);
          if (cursor) q = q.startAfter(cursor);
          const e = await q.get();
          return json({
            items: e.docs.map((x) => x.data()),
            nextCursor: e.size === limit ? e.docs.at(-1)!.id : null,
          });
        }
        if (segments.length === 3) {
          const story = await db.runTransaction((tx) =>
            version(tx, s.storyId, s.versionId),
          );
          const node = story.nodes[s.nodeId];
          let branches: unknown[] = [];
          let featuredId: string | null = null;
          if (node.branchLocation) {
            branches = (
              await db
                .collection("branches")
                .where("locationId", "==", node.branchLocation)
                .limit(20)
                .get()
            ).docs.map((d) => d.data());
            featuredId =
              (await db.doc(`placements/${node.branchLocation}`).get()).data()
                ?.nominatedBranchId ?? null;
          }
          return json({
            save: s,
            node,
            media: resolveFixtureMedia(node.video),
            branches,
            featuredId,
          });
        }
      }
    }
    if (request.method !== "POST")
      throw new GameError("NOT_FOUND", "Route not found.");
    const raw = await request.text();
    if (raw.length > 4096)
      throw new GameError("VALIDATION_FAILED", "Command too large.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
    }
    const kind =
      path === "/api/playthroughs"
        ? "start"
        : segments[1] === "playthroughs" &&
            segments.length === 4 &&
            segments[3] === "choices"
          ? "choice"
          : segments[1] === "playthroughs" &&
              segments.length === 4 &&
              segments[3] === "branches"
            ? "branch"
            : null;
    if (!kind) throw new GameError("NOT_FOUND", "Route not found.");
    const command =
      kind === "start"
        ? startSchema.parse(body)
        : kind === "choice"
          ? choiceCommandSchema.parse(body)
          : branchCommandSchema.parse(body);
    const requestHash = hash(canonical({ path, command }));
    const receipt = db.doc(
      `commandReceipts/${hash(`${uid}:${kind}:${command.idempotencyKey}`)}`,
    );
    const newId = randomUUID();
    const now = Date.now();
    const result = await db.runTransaction(async (tx) => {
      const previous = await tx.get(receipt);
      if (previous.exists) {
        if (previous.data()!.requestHash !== requestHash)
          throw new GameError(
            "IDEMPOTENCY_CONFLICT",
            "Command key was already used for a different request.",
          );
        return previous.data()!.result;
      }
      let save: Save;
      let event: Record<string, unknown>;
      if (kind === "start") {
        const c = startSchema.parse(command);
        if (c.payload.storyId !== "glass-harbor")
          throw new GameError(
            "FORBIDDEN",
            "Side quests must start from their branch location.",
          );
        const latest = await tx.get(db.doc(`stories/${c.payload.storyId}`));
        const v = c.payload.versionId ?? latest.data()?.publishedVersionId;
        if (!v) throw new GameError("NOT_FOUND", "Story not found.");
        const story = await version(tx, c.payload.storyId, v);
        save = start(story, newId, uid, profile.data()!.stats as Stats, now);
        event = {
          label: "Arrived in Glass Harbor",
          from: null,
          to: save.nodeId,
          revision: 0,
          at: now,
        };
      } else {
        const ref = db.doc(`playthroughs/${segments[2]}`);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists)
          throw new GameError("NOT_FOUND", "Adventure not found.");
        const current = snapshot.data() as Save;
        if (current.playerUid !== uid)
          throw new GameError(
            "FORBIDDEN",
            "This adventure belongs to another player.",
          );
        const story = await version(tx, current.storyId, current.versionId);
        if (kind === "choice") {
          const c = choiceCommandSchema.parse(command);
          const moved = transition(
            story,
            current,
            c.payload.choiceId,
            c.expectedRevision,
            now,
          );
          save = moved.save;
          event = moved.event;
        } else {
          const c = branchCommandSchema.parse(command);
          if (current.revision !== c.expectedRevision)
            throw new GameError(
              "STALE_REVISION",
              "Progress changed on another device. Reload current progress.",
            );
          if (current.parentPlaythroughId || current.status !== "active")
            throw new GameError(
              "FORBIDDEN",
              "Nested branches are unavailable.",
            );
          const b = (
            await tx.get(db.doc(`branches/${c.payload.branchId}`))
          ).data();
          if (
            !b ||
            b.locationId !== story.nodes[current.nodeId].branchLocation ||
            b.sourceVersionId !== current.versionId
          )
            throw new GameError(
              "VALIDATION_FAILED",
              "Branch unavailable at this location.",
            );
          const childStory = await version(tx, b.storyId, b.versionId);
          save = start(childStory, newId, uid, current.stats, now, current);
          event = {
            label: "Entered community side quest",
            from: null,
            to: save.nodeId,
            revision: 0,
            at: now,
          };
        }
      }
      const result = { save };
      tx.set(db.doc(`playthroughs/${save.id}`), save);
      tx.create(
        db.doc(
          `playthroughs/${save.id}/events/${String(save.revision).padStart(8, "0")}`,
        ),
        { ...event, commandId: command.idempotencyKey },
      );
      tx.create(receipt, { actor: uid, requestHash, result, at: now });
      return result;
    });
    return json(result);
  } catch (error) {
    const code =
      error instanceof GameError
        ? error.code
        : error instanceof ZodError
          ? "VALIDATION_FAILED"
          : "UNAVAILABLE";
    const status =
      code === "UNAUTHENTICATED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : code === "STALE_REVISION" || code === "IDEMPOTENCY_CONFLICT"
              ? 409
              : code === "VALIDATION_FAILED"
                ? 400
                : 503;
    return json(
      {
        error: {
          code,
          message:
            error instanceof GameError
              ? error.message
              : code === "VALIDATION_FAILED"
                ? "Invalid command."
                : "The local service is unavailable. Check the emulators and retry.",
          correlationId,
        },
      },
      status,
    );
  }
}
