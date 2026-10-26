import { storyKeyHistory } from "./story-key-history";
import { sideStory } from "./side-story";
import { playerRun } from "../../packages/domain/player";
import { playerEventSchema } from "../../packages/contracts/player";
import {
  playerContractHeader,
  playerContractVersion,
} from "../../packages/contracts/player";
import { playerView, projectStoredPlayerData } from "./player-view";
import { createHash, randomUUID, randomInt } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { auth, db, config } from "./firebase";
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
import { start, transition } from "../../packages/domain/index";
import { ensurePlayerProfile } from "./player-profile";
import { passwordReset, resendVerification, sendAccountEmail } from "./email";
import { appSettings } from "./settings";
import { effectiveLimits } from "../../packages/contracts/settings";
import { accountFeatures } from "../../packages/contracts/profile";
import { newAccountFeatures } from "./access";
import { authoring } from "./authoring";
import { uploads } from "./uploads";
import { storyNodeLibrary, sharedStoryNode } from "./story-node-library";
import { generation } from "./generation";
import { copilot } from "./copilot";
import { assist } from "./assist";
import { admin } from "./admin";
import { profileRoutes } from "./profile";
import { achievementRoutes, prepareAchievement } from "./achievements";
import { prepareStoryProgress, storyProgressSnapshot } from "./story-progress";
import {
  resolveKeyImports,
  storyImportOffer,
  storySourceRuns,
  sideStoryImports,
} from "./key-imports";
import {
  assertStoryEntry,
  invitationRoutes,
  storyEntryKeyHistory,
} from "./invitations";
import { edition } from "./story-store";
import * as paths from "./paths";
import {
  legacyStoryData,
  readStoryData,
  storyApiPath,
  storyContractHeader,
  storyContractVersion,
} from "../../packages/contracts/legacy-story-format";
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
// Saves live under their player, so another player's save is simply not found.
async function owned(saveId: string, uid: string) {
  const d = await db.doc(paths.save(uid, saveId)).get();
  if (!d.exists) throw new GameError("NOT_FOUND", "Adventure not found.");
  return readStoryData<Save>(d.data());
}
// Unversioned requests keep their historical response shape. New clients opt
// into canonical names; the explicitly renamed endpoints do so inherently.
export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const canonicalClient =
    request.headers.get(playerContractHeader) === playerContractVersion ||
    request.headers.get(storyContractHeader) === storyContractVersion ||
    /^\/api\/(?:story-nodes|shared-story-nodes)(?:\/|$)/.test(url.pathname);
  url.pathname = storyApiPath(url.pathname);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
    if (new TextEncoder().encode(body).length > 250000)
      return json(
        { error: { code: "VALIDATION_FAILED", message: "Command too large." } },
        400,
      );
    if (!canonicalClient) {
      try {
        body = JSON.stringify(readStoryData(JSON.parse(body)));
      } catch (error) {
        if (error instanceof GameError)
          return json(
            { error: { code: error.code, message: error.message } },
            400,
          );
        // The existing command parser reports malformed JSON.
      }
    }
  }
  const response = await handleCanonical(
    new Request(url, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: request.signal,
    }),
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    return response;
  try {
    const data = readStoryData(await response.json());
    return json(
      canonicalClient ? data : legacyStoryData(data),
      response.status,
    );
  } catch (error) {
    // The command already ran; a stored record that cannot be translated is
    // a service incident, not the client's mistake.
    return failure(
      new Error(
        `Response translation failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
      request,
      randomUUID(),
    );
  }
}

async function handleCanonical(request: Request): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const segments = path.split("/").filter(Boolean);
    for (const segment of segments) id.parse(segment);
    const cursor = url.searchParams.get("cursor");
    if (cursor) id.parse(cursor);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new GameError("VALIDATION_FAILED", "Batch size must be 1–50.");
    if (request.method === "GET" && path === "/api/catalogue") {
      let q = db
        .collection("catalogue")
        .orderBy(FieldPath.documentId())
        .limit(limit);
      if (cursor) q = q.startAfter(cursor);
      const docs = await q.get();
      return json({
        // Stories an admin hid stay out of Discover.
        items: docs.docs.map((d) => d.data()).filter((s) => s.hidden !== true),
        nextCursor: docs.size === limit ? docs.docs.at(-1)!.id : null,
      });
    }
    if (
      request.method === "GET" &&
      segments[1] === "shared-story-nodes" &&
      segments.length === 4
    )
      return json(await sharedStoryNode(segments[2], segments[3]));
    if (request.method === "POST" && path === "/api/account/password-reset")
      return json(await passwordReset(request));
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
      throw new GameError("UNAUTHENTICATED", "Sign in to save your adventure.");
    let uid: string;
    let tokenName: string | undefined;
    try {
      const decoded = await auth.verifyIdToken(
        token,
        config.mode === "firebase",
      );
      uid = decoded.uid;
      tokenName = typeof decoded.name === "string" ? decoded.name : undefined;
    } catch {
      throw new GameError(
        "UNAUTHENTICATED",
        "Your session expired. Sign in again.",
      );
    }
    if (
      segments[1] === "playthroughs" &&
      request.headers.get(playerContractHeader) !== playerContractVersion
    )
      throw new GameError(
        "VALIDATION_FAILED",
        "This player version is no longer supported. Reload Storybranch to update before continuing.",
      );
    const profileRef = db.doc(paths.user(uid));
    if (
      await ensurePlayerProfile(
        db,
        uid,
        newAccountFeatures(config.mode, await appSettings()),
      )
    )
      await sendAccountEmail(uid);
    const profile = await profileRef.get();
    if (!profile.exists || profile.data()!.status !== "active")
      throw new GameError(
        "FORBIDDEN",
        config.mode === "emulator"
          ? "This account is not enabled for the local prototype. Use a seeded account."
          : "This account is not enabled for Storybranch.",
      );
    // Gated features read the account's flags from the profile just loaded.
    const features = accountFeatures(profile.data());
    if (
      request.method === "GET" &&
      segments[1] === "story-imports" &&
      segments.length === 5 &&
      segments[4] === "runs"
    ) {
      const keyId = url.searchParams.get("keyId") ?? "";
      if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(keyId) || keyId.length > 100)
        throw new GameError("VALIDATION_FAILED", "Invalid imported key alias.");
      return json(
        await storySourceRuns(uid, segments[2], segments[3], keyId, cursor),
      );
    }
    if (
      request.method === "GET" &&
      segments[1] === "story-imports" &&
      segments.length === 3
    )
      return json(await storyImportOffer(uid, segments[2]));
    if (
      request.method === "GET" &&
      segments[1] === "playthroughs" &&
      segments[3] === "branches" &&
      segments[5] === "imports" &&
      (segments.length === 6 ||
        (segments.length === 7 && segments[6] === "runs"))
    ) {
      const revisionText = url.searchParams.get("expectedRevision") ?? "";
      if (!/^\d{1,8}$/.test(revisionText))
        throw new GameError(
          "VALIDATION_FAILED",
          "Expected parent revision is required.",
        );
      const runs = segments.length === 7;
      const versionId = runs
        ? id.parse(url.searchParams.get("versionId"))
        : undefined;
      const storyId = runs
        ? id.parse(url.searchParams.get("storyId"))
        : undefined;
      const keyId = runs ? (url.searchParams.get("keyId") ?? "") : undefined;
      if (
        runs &&
        (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(keyId!) || keyId!.length > 100)
      )
        throw new GameError("VALIDATION_FAILED", "Invalid imported key alias.");
      return json(
        await sideStoryImports(
          uid,
          segments[2],
          segments[4],
          Number(revisionText),
          versionId,
          keyId,
          cursor,
          storyId,
        ),
      );
    }
    if (segments[1] === "story-progress")
      return json(await storyKeyHistory(request, uid, segments, cursor));
    if (segments[1] === "story-entry-keys")
      return json(await storyEntryKeyHistory(request, uid, segments, cursor));
    // Daily limits: the person's own, else the defaults in Settings.
    const limits = effectiveLimits(profile.data(), await appSettings());
    if (["story-invitations", "story-entry"].includes(segments[1]))
      return json(
        await invitationRoutes(request, uid, segments, features, cursor),
      );
    if (
      ["achievements", "achievement-submissions"].includes(segments[1]) ||
      (segments[1] === "admin" && segments[2] === "achievements")
    )
      return json(
        await achievementRoutes(request, uid, segments, features, cursor),
      );
    if (segments[1] === "studio")
      return json(
        await authoring(request, uid, segments, cursor, limit, features),
      );
    if (segments[1] === "uploads")
      return json(await uploads(request, uid, segments, features));
    if (segments[1] === "generation")
      return json(await generation(request, uid, segments, features, limits));
    if (segments[1] === "assist")
      return json(await assist(request, uid, segments, features, limits));
    if (segments[1] === "admin")
      return json(await admin(request, uid, segments, features));
    if (request.method === "POST" && path === "/api/account/verify-email")
      return json(await resendVerification(uid));
    // Streams its reply, so it builds its own response.
    if (segments[1] === "copilot")
      return await copilot(request, uid, segments, features, limits);
    if (segments[1] === "story-nodes")
      return json(
        await storyNodeLibrary(request, uid, segments, cursor, limit, features),
      );
    if (segments[1] === "profile" || segments[1] === "dashboard")
      return json(
        await profileRoutes(request, uid, segments, profile.data()!, tokenName),
      );
    if (request.method === "GET") {
      if (path === "/api/playthroughs") {
        let q = db
          .collection(paths.saves(uid))
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
          items: d.docs.map((x) =>
            projectStoredPlayerData(() =>
              playerRun(readStoryData<Save>(x.data())),
            ),
          ),
          nextCursor:
            d.size === limit
              ? `${d.docs.at(-1)!.data().updatedAt}_${d.docs.at(-1)!.id}`
              : null,
        });
      }
      const saveId = segments[2];
      if (segments[1] === "playthroughs" && saveId) {
        const s = await owned(saveId, uid);
        if (segments[3] === "events") {
          let q = db
            .collection(paths.events(uid, saveId))
            .orderBy(FieldPath.documentId())
            .limit(limit);
          if (cursor) q = q.startAfter(cursor);
          const e = await q.get();
          return json({
            items: e.docs.map((x) =>
              projectStoredPlayerData(() =>
                playerEventSchema.parse(readStoryData(x.data())),
              ),
            ),
            nextCursor: e.size === limit ? e.docs.at(-1)!.id : null,
          });
        }
        if (segments.length === 3) {
          return json(
            await playerView(
              s,
              uid,
              profile.data() as { stats: Stats; achievements?: string[] },
            ),
          );
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
    const receipt = db.doc(paths.receipt(uid, kind, command.idempotencyKey));
    const newId = randomUUID();
    const rolls = new Map<number, number>();
    const now = Date.now();
    const result = await db.runTransaction(async (tx) => {
      const previous = await tx.get(receipt);
      if (previous.exists) {
        if (previous.data()!.requestHash !== requestHash)
          throw new GameError(
            "IDEMPOTENCY_CONFLICT",
            "Command key was already used for a different request.",
          );
        return readStoryData<{ save: Save }>(previous.data()!.result);
      }
      let save: Save;
      let progressStory: Story;
      let event: Record<string, unknown>;
      if (kind === "start") {
        const c = startSchema.parse(command);
        const listing = await tx.get(db.doc(`catalogue/${c.payload.storyId}`));
        if (!listing.exists)
          throw new GameError(
            "FORBIDDEN",
            "Side quests must start from their branch location.",
          );
        // A hidden story takes no new players; existing saves keep playing.
        if (listing.data()!.hidden === true)
          throw new GameError(
            "FORBIDDEN",
            "This story isn't available right now.",
          );
        const latest = await tx.get(db.doc(`stories/${c.payload.storyId}`));
        const v = c.payload.versionId ?? latest.data()?.publishedVersionId;
        if (!v) throw new GameError("NOT_FOUND", "Story not found.");
        const { story } = await edition(tx, c.payload.storyId, v);
        await assertStoryEntry(tx, uid, story.id);
        progressStory = story;
        save = start(
          story,
          newId,
          uid,
          profile.data()!.stats as Stats,
          now,
          undefined,
          await storyProgressSnapshot(tx, uid, story),
          await resolveKeyImports(
            tx,
            uid,
            story,
            c.payload.importConsent === true,
            now,
            c.payload.sourceRuns,
          ),
        );
        event = {
          label: `Started ${story.title}`,
          from: null,
          to: save.storyNodeId,
          revision: 0,
          at: now,
        };
      } else {
        const ref = db.doc(paths.save(uid, segments[2]));
        const snapshot = await tx.get(ref);
        if (!snapshot.exists)
          throw new GameError("NOT_FOUND", "Adventure not found.");
        const current = readStoryData<Save>(snapshot.data());
        const { story } = await edition(tx, current.storyId, current.versionId);
        progressStory = story;
        if (kind === "choice") {
          const c = choiceCommandSchema.parse(command);
          const moved = transition(
            story,
            current,
            c.payload.choiceId,
            c.expectedRevision,
            now,
            (sides) => {
              if (!rolls.has(sides)) rolls.set(sides, randomInt(1, sides + 1));
              return rolls.get(sides)!;
            },
            c.payload.action,
          );
          save = moved.save;
          event = moved.event;
        } else {
          const c = branchCommandSchema.parse(command);
          const childStory = await sideStory(
            tx,
            uid,
            current,
            story,
            c.payload.branchId,
            c.expectedRevision,
            c.payload.versionId,
            c.payload.storyId,
          );
          if (
            childStory.keyImports?.keys.length &&
            (!c.payload.versionId || !c.payload.storyId)
          )
            throw new GameError(
              "VALIDATION_FAILED",
              "Review this side Story's imports before entering.",
            );
          const imports = await resolveKeyImports(
            tx,
            uid,
            childStory,
            c.payload.importConsent === true,
            now,
            c.payload.sourceRuns,
          );
          progressStory = childStory;
          save = start(
            childStory,
            newId,
            uid,
            current.stats,
            now,
            current,
            await storyProgressSnapshot(tx, uid, childStory),
            imports,
          );
          event = {
            label: "Entered community side quest",
            from: null,
            to: save.storyNodeId,
            revision: 0,
            at: now,
          };
        }
      }
      const achievement = await prepareAchievement(tx, uid, save);
      const writeProgress = await prepareStoryProgress(
        tx,
        uid,
        progressStory,
        save,
        achievement.approved,
      );
      achievement.write();
      writeProgress();
      if (save.completion?.revision === save.revision)
        event.completion = save.completion;
      const result = { save };
      tx.set(db.doc(paths.save(uid, save.id)), save);
      tx.create(
        db.doc(
          `${paths.events(uid, save.id)}/${String(save.revision).padStart(8, "0")}`,
        ),
        { ...event, commandId: command.idempotencyKey },
      );
      tx.create(receipt, {
        actor: uid,
        requestHash,
        result,
        at: now,
        ...paths.receiptExpiry(now),
      });
      return result;
    });
    return json({
      player: await playerView(
        result.save,
        uid,
        profile.data() as { stats: Stats; achievements?: string[] },
      ),
    });
  } catch (error) {
    return failure(error, request, correlationId);
  }
}

function failure(error: unknown, request: Request, correlationId: string) {
  const code =
    error instanceof GameError
      ? error.code
      : error instanceof ZodError
        ? "VALIDATION_FAILED"
        : "UNAVAILABLE";
  // Expected failures (validation, auth, conflicts) are answers, not
  // incidents; anything else goes to the runtime log with the ID the
  // user sees, so it can be found in Vercel's logs.
  if (code === "UNAVAILABLE")
    console.error(
      JSON.stringify({
        correlationId,
        method: request.method,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
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
              : config.mode === "emulator"
                ? "The local service is unavailable. Check the emulators and retry."
                : "The story service is unavailable. Please try again shortly.",
        correlationId,
      },
    },
    status,
  );
}
