import "./emulator-env";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { bucket, db } from "../services/api/firebase";
import { handle } from "../services/api/handler";
import { ensurePlayerProfile } from "../services/api/player-profile";
import type { Save } from "../packages/contracts/index";
import { pageStories } from "../fixtures/page-stories";
import { migrateLayout, OLD_ROOT } from "../scripts/migrate-layout";
import { contentOf, placePage } from "../packages/contracts/page-library";
let tokens: Record<string, string> = {};
let rules: RulesTestEnvironment;
it("gates paid generation, preserves request receipts, and protects job ownership", async () => {
  const originalKey = process.env.FAL_KEY,
    originalAllow = process.env.STORYBRANCH_GENERATOR_UIDS;
  const realFetch = globalThis.fetch;
  let submissions = 0;
  let succeed = false;
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://test.fal.media/result.png")
        return new Response(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYx8AAAAASUVORK5CYII=",
            "base64",
          ),
        );
      if (!url.startsWith("https://queue.fal.run/"))
        return realFetch(input, init);
      if (init?.method === "POST") {
        submissions++;
        return Response.json({
          request_id: "test-job",
          status_url: "https://queue.fal.run/test/status",
          response_url: "https://queue.fal.run/test/result",
        });
      }
      if (succeed && url.endsWith("/result"))
        return Response.json({
          images: [{ url: "https://test.fal.media/result.png" }],
        });
      return Response.json({
        status: "COMPLETED",
        ...(succeed ? {} : { error: "Test provider rejected prompt" }),
      });
    });
  try {
    delete process.env.FAL_KEY;
    expect((await call("/generation")).data.enabled).toBe(false);
    const command = {
      idempotencyKey: randomUUID(),
      kind: "image",
      prompt: "A quiet harbor",
    };
    expect((await call("/generation", command)).status).toBe(403);
    process.env.FAL_KEY = "test-key-not-real";
    process.env.STORYBRANCH_GENERATOR_UIDS = "player";
    expect((await call("/generation", command, "progressed")).status).toBe(403);
    expect(
      (await call("/generation", { ...command, referenceId: "not-owned" }))
        .status,
    ).toBe(400);
    const first = await call("/generation", command);
    expect(first.status).toBe(200);
    expect(first.data.status).toBe("queued");
    expect((await call("/generation", command)).data.id).toBe(first.data.id);
    expect(submissions).toBe(1);
    expect(
      (await call("/generation", { ...command, prompt: "Different" })).status,
    ).toBe(409);
    expect(
      (await call(`/generation/${first.data.id}`, {}, "progressed")).status,
    ).toBe(404);
    expect((await call(`/generation/${first.data.id}`, {})).data.status).toBe(
      "failed",
    );
    expect((await call("/generation", command)).data.status).toBe("failed");
    expect(submissions).toBe(1);
    succeed = true;
    const success = await call("/generation", {
      ...command,
      idempotencyKey: randomUUID(),
    });
    const completed = await call(`/generation/${success.data.id}`, {});
    expect(completed.data.status).toBe("ready");
    expect(completed.data.asset.contentType).toBe("image/png");
    expect(
      (await call(`/generation/${success.data.id}`, {})).data.asset.id,
    ).toBe(completed.data.asset.id);
    const stored = (
      await db.doc(`users/player/clips/${completed.data.asset.id}`).get()
    ).data()!;
    expect(stored.path).toBe(`users/player/clips/${completed.data.asset.id}`);
    expect(stored.published).toBe(false);
    expect((await bucket.file(stored.path).exists())[0]).toBe(true);
    expect(submissions).toBe(2);
  } finally {
    spy.mockRestore();
    if (originalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalKey;
    if (originalAllow === undefined)
      delete process.env.STORYBRANCH_GENERATOR_UIDS;
    else process.env.STORYBRANCH_GENERATOR_UIDS = originalAllow;
  }
});
it("pins reusable page revisions, protects sharing, and rejects forged library content", async () => {
  const pageId = randomUUID();
  const source = Object.values(pageStories[0].pages).find(
    (p) => p.pageType === "video",
  )!;
  const content = { ...contentOf(source), videoAdvance: "continue" as const };
  const command = {
    idempotencyKey: randomUUID(),
    expectedRevision: 0,
    content,
  };
  const created = await call(`/pages/${pageId}`, command);
  expect(created.status).toBe(200);
  expect((await call(`/pages/${pageId}`, command)).data).toEqual(created.data);
  expect(
    (
      await call(`/pages/${pageId}`, {
        ...command,
        content: { ...content, title: "changed" },
      })
    ).status,
  ).toBe(409);
  expect((await call(`/pages/${pageId}`, command, "progressed")).status).toBe(
    403,
  );
  expect(
    (await call(`/shared-pages/${pageId}/1`, undefined, "none")).status,
  ).toBe(404);
  const sharing = { idempotencyKey: randomUUID(), revision: 1 };
  expect(
    (await call(`/pages/${pageId}/share`, sharing, "progressed")).status,
  ).toBe(403);
  expect((await call(`/pages/${pageId}/share`, sharing)).status).toBe(200);
  expect(
    (await call(`/shared-pages/${pageId}/1`, undefined, "none")).data.content,
  ).toEqual(content);
  const newer = await call(`/pages/${pageId}`, {
    ...command,
    idempotencyKey: randomUUID(),
    expectedRevision: 1,
    content: { ...content, title: "New revision" },
  });
  expect(newer.data.revision).toBe(2);
  expect(
    (await call(`/shared-pages/${pageId}/1`, undefined, "none")).data.content
      .title,
  ).toBe(content.title);
  expect(
    (await call(`/shared-pages/${pageId}/2`, undefined, "none")).status,
  ).toBe(404);
  const storyId = `library-${randomUUID()}`;
  const story = {
    id: storyId,
    versionId: "draft",
    rulesetVersion: "prototype-1",
    title: "Shared content",
    entryPageId: "opening",
    pages: {
      opening: placePage(created.data, "opening", "end"),
      end: {
        id: "end",
        title: "End",
        transcript: "",
        pageType: "text",
        kind: "ending",
        choices: [],
        entryEffects: [],
      },
    },
  };
  expect(
    (
      await call(`/studio/${storyId}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 0,
        draft: { story, description: "" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(`/studio/${storyId}/publish`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 1,
        policyVersion: "creator-alpha-1",
      })
    ).status,
  ).toBe(200);
  story.pages.opening.title = "Forged library content";
  expect(
    (
      await call(`/studio/${storyId}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 1,
        draft: { story, description: "" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(`/studio/${storyId}/publish`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 2,
        policyVersion: "creator-alpha-1",
      })
    ).status,
  ).toBe(400);
});
it("protects drafts and atomically publishes immutable editions with retry and stale checks", async () => {
  const storyId = `author-${randomUUID()}`;
  const story = JSON.parse(
    JSON.stringify(pageStories[0]).replaceAll("clockwork-door", storyId),
  );
  const path = `/studio/${storyId}`;
  const saveDraft = {
    idempotencyKey: randomUUID(),
    expectedRevision: 0,
    draft: {
      story,
      description: "Creator test",
      pagePositions: { [story.entryPageId]: { x: 120, y: 240 } },
    },
  };
  expect((await call(path, saveDraft, "none")).status).toBe(401);
  const created = await call(path, saveDraft);
  expect(created.status).toBe(200);
  expect(created.data.pagePositions).toEqual(saveDraft.draft.pagePositions);
  expect((await call(path, saveDraft)).data).toEqual(created.data);
  expect(
    (
      await call(path, {
        ...saveDraft,
        draft: { ...saveDraft.draft, description: "Changed payload" },
      })
    ).status,
  ).toBe(409);
  expect((await call(path, undefined, "progressed")).status).toBe(404);
  expect((await call(path, saveDraft, "progressed")).status).toBe(403);
  expect((await db.doc(`catalogue/${storyId}`).get()).exists).toBe(false);
  const publish = {
    idempotencyKey: randomUUID(),
    expectedRevision: 1,
    policyVersion: "creator-alpha-1",
  };
  expect((await call(`${path}/publish`, publish, "progressed")).status).toBe(
    403,
  );
  const published = await call(`${path}/publish`, publish);
  expect(published.status).toBe(200);
  expect((await call(`${path}/publish`, publish)).data).toEqual(published.data);
  const started = await call(
    "/playthroughs",
    { idempotencyKey: randomUUID(), payload: { storyId } },
    "progressed",
  );
  expect(started.status).toBe(200);
  expect(started.data.save.versionId).toBe("edition-1");
  const oldVersion = (
    await db.doc(`stories/${storyId}/versions/edition-1`).get()
  ).data();
  expect(oldVersion).not.toHaveProperty("pagePositions");
  const edit = {
    ...saveDraft,
    idempotencyKey: randomUUID(),
    expectedRevision: 1,
    draft: {
      ...saveDraft.draft,
      story: { ...story, title: "Revised edition" },
    },
  };
  expect((await call(path, edit)).status).toBe(200);
  expect(
    (await call(path, { ...edit, idempotencyKey: randomUUID() })).status,
  ).toBe(409);
  expect(
    (
      await call(`${path}/publish`, {
        ...publish,
        idempotencyKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(`${path}/publish`, {
        ...publish,
        idempotencyKey: randomUUID(),
        expectedRevision: 2,
      })
    ).status,
  ).toBe(200);
  expect(
    (await db.doc(`stories/${storyId}/versions/edition-1`).get()).data(),
  ).toEqual(oldVersion);
  expect(
    (
      await call(
        `/playthroughs/${started.data.save.id}`,
        undefined,
        "progressed",
      )
    ).data.save.versionId,
  ).toBe("edition-1");
  const latest = await call("/playthroughs", {
    idempotencyKey: randomUUID(),
    payload: { storyId },
  });
  expect(latest.data.save.versionId).toBe("edition-2");
  const invalid = {
    ...edit,
    idempotencyKey: randomUUID(),
    expectedRevision: 2,
    draft: { ...edit.draft, story: { ...story, entryPageId: "missing" } },
  };
  expect((await call(path, invalid)).status).toBe(200);
  expect(
    (
      await call(`${path}/publish`, {
        ...publish,
        idempotencyKey: randomUUID(),
        expectedRevision: 3,
      })
    ).status,
  ).toBe(400);
  expect(
    (await db.doc(`stories/${storyId}/versions/edition-3`).get()).exists,
  ).toBe(false);
  expect(
    (await db.doc(`stories/${storyId}`).get()).data()?.publishedVersionId,
  ).toBe("edition-2");
});
it("creates a live-style profile once without resetting stats or reactivating disabled users", async () => {
  const uid = `profile-${randomUUID()}`;
  const ref = db.doc(`users/${uid}`);
  try {
    await Promise.all([
      ensurePlayerProfile(db, uid),
      ensurePlayerProfile(db, uid),
    ]);
    expect((await ref.get()).data()?.stats.agility).toBe(5);
    await ref.update({ "stats.agility": 9, status: "disabled" });
    await ensurePlayerProfile(db, uid);
    expect((await ref.get()).data()).toMatchObject({
      stats: { agility: 9 },
      status: "disabled",
    });
  } finally {
    await ref.delete();
  }
});
it("edits only presentation fields and summarizes the player's own progress", async () => {
  expect((await call("/profile", undefined, "none")).status).toBe(401);
  const before = await call("/profile", undefined, "progressed");
  expect(before.status).toBe(200);
  expect(before.data).toMatchObject({ stats: { agility: 8 } });
  expect(typeof before.data.displayName).toBe("string");

  const saved = await call(
    "/profile",
    { displayName: "  Tess  ", avatarId: "gear" },
    "progressed",
  );
  expect(saved.status).toBe(200);
  expect(saved.data).toMatchObject({ displayName: "Tess", avatarId: "gear" });
  const customized = await call(
    "/profile",
    {
      displayName: "Tess",
      avatarId: "gear",
      tagline: "Tinkerer",
      bio: "Gears\nand doors",
      bannerId: "clockwork",
      accent: "amber",
      avatarTint: "sky",
      avatarFrame: "rounded",
      favoriteGenres: ["mystery"],
    },
    "progressed",
  );
  expect(customized.status).toBe(200);
  // Omitted optional fields keep their stored values.
  expect(
    (
      await call(
        "/profile",
        { displayName: "Tess", avatarId: "gear" },
        "progressed",
      )
    ).data,
  ).toMatchObject({
    tagline: "Tinkerer",
    bannerId: "clockwork",
    favoriteGenres: ["mystery"],
  });
  for (const bad of [
    { displayName: "", avatarId: "gear" },
    { displayName: "Tess", avatarId: "dragon" },
    { displayName: "Tess", avatarId: "gear", stats: { agility: 99 } },
    { displayName: "Tess", avatarId: "gear", accent: "#ff00ff" },
    { displayName: "Tess", avatarId: "gear", bio: "x".repeat(501) },
  ])
    expect((await call("/profile", bad, "progressed")).status).toBe(400);
  const after = await call("/profile", undefined, "progressed");
  expect(after.data).toMatchObject({
    displayName: "Tess",
    avatarId: "gear",
    accent: "amber",
    avatarFrame: "rounded",
    stats: { agility: 8 },
  });
  // The other player's profile is untouched.
  expect((await call("/profile")).data.displayName).not.toBe("Tess");
  expect((await call("/profile/other", undefined, "progressed")).status).toBe(
    404,
  );

  const started = await call(
    "/playthroughs",
    { idempotencyKey: randomUUID(), payload: { storyId: "glass-harbor" } },
    "progressed",
  );
  const dashboard = await call("/dashboard", undefined, "progressed");
  expect(dashboard.status).toBe(200);
  expect(dashboard.data.profile.displayName).toBe("Tess");
  expect(dashboard.data.summary.continue[0]).toMatchObject({
    saveId: started.data.save.id,
    title: "The Glass Harbor",
    sideQuest: false,
  });
  const harbor = dashboard.data.summary.stories.find(
    (s: { storyId: string }) => s.storyId === "glass-harbor",
  );
  expect(harbor).toMatchObject({
    status: "in-progress",
    activeSaveId: started.data.save.id,
  });
  expect(harbor.endingsTotal).toBeGreaterThan(0);
  // The new save's opening event appears in recent activity.
  expect(dashboard.data.summary.activity[0]).toMatchObject({
    saveId: started.data.save.id,
    title: "The Glass Harbor",
  });
  await call(
    "/profile",
    { displayName: before.data.displayName, avatarId: before.data.avatarId },
    "progressed",
  );
});
async function call(path: string, body?: unknown, who = "player") {
  const r = await handle(
    new Request(`http://localhost/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  return { status: r.status, data: await r.json() };
}
const begin = async () => {
  const r = await call("/playthroughs", {
    idempotencyKey: randomUUID(),
    payload: { storyId: "glass-harbor" },
  });
  expect(r.status).toBe(200);
  return r.data.save as Save;
};
// Saves started by the default "player" account.
const saveOf = (saveId: string) => `users/player/playthroughs/${saveId}`;
const eventsOf = (saveId: string) => `${saveOf(saveId)}/events`;
const choice = (s: Save, choiceId: string, key = randomUUID()) => ({
  idempotencyKey: key,
  expectedRevision: s.revision,
  payload: { choiceId },
});
beforeAll(async () => {
  for (const uid of ["player", "progressed"]) {
    const r = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-demo-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${uid}@storybranch.test`,
          password: "HarborDemo123!",
          returnSecureToken: true,
        }),
      },
    );
    tokens[uid] = (await r.json()).idToken;
    expect(tokens[uid]).toBeTruthy();
  }
  rules = await initializeTestEnvironment({
    projectId: "demo-storybranch",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firebase/firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9299,
      rules: readFileSync("firebase/storage.rules", "utf8"),
    },
  });
});
afterAll(async () => {
  await rules?.cleanup();
});
it("rejects unauthenticated, forged, disabled-account and cross-user access", async () => {
  expect((await call("/playthroughs", undefined, "none")).status).toBe(401);
  tokens.forged = "not-a-token";
  expect((await call("/playthroughs", undefined, "forged")).status).toBe(401);
  const s = await begin();
  // Another player's save is not under their account, so it is not found.
  expect(
    (await call(`/playthroughs/${s.id}`, undefined, "progressed")).status,
  ).toBe(404);
  expect(
    (
      await call(
        `/playthroughs/${s.id}/choices`,
        choice(s, "market"),
        "progressed",
      )
    ).status,
  ).toBe(404);
  await db.doc("users/progressed").update({ status: "disabled" });
  try {
    expect((await call("/playthroughs", undefined, "progressed")).status).toBe(
      403,
    );
  } finally {
    await db.doc("users/progressed").update({ status: "active" });
  }
});
it("persists one transition and event on retries, conflicts on changed payload", async () => {
  const s = await begin();
  const body = choice(s, "courier");
  const a = await call(`/playthroughs/${s.id}/choices`, body);
  const b = await call(`/playthroughs/${s.id}/choices`, body);
  expect(a.status).toBe(200);
  expect(b.data).toEqual(a.data);
  expect(
    (
      await call(`/playthroughs/${s.id}/choices`, {
        ...body,
        payload: { choiceId: "market" },
      })
    ).status,
  ).toBe(409);
  expect((await db.collection(eventsOf(s.id)).get()).size).toBe(2);
  const resumed = await call(`/playthroughs/${s.id}`);
  expect(resumed.data.save.items["glass-harbor:token"]).toBe(1);
  expect(resumed.data.save.pageId).toBe("courier");
});
it("commits only one competing choice at the same revision", async () => {
  const s = await begin();
  const results = await Promise.all([
    call(`/playthroughs/${s.id}/choices`, choice(s, "courier")),
    call(`/playthroughs/${s.id}/choices`, choice(s, "market")),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await db.collection(eventsOf(s.id)).get()).size).toBe(2);
});
it("pins old saves when the published pointer changes", async () => {
  const s = await begin();
  await db
    .doc("stories/glass-harbor")
    .update({ publishedVersionId: "v2-not-ready" });
  try {
    const r = await call(`/playthroughs/${s.id}/choices`, choice(s, "market"));
    expect(r.status).toBe(200);
    expect(r.data.save.versionId).toBe("pages-v1");
    expect(
      (
        await call("/playthroughs", {
          idempotencyKey: randomUUID(),
          payload: { storyId: "glass-harbor" },
        })
      ).status,
    ).toBe(404);
  } finally {
    await db
      .doc("stories/glass-harbor")
      .update({ publishedVersionId: "pages-v1" });
  }
});
it("allows both branches, isolates child changes and returns current parent", async () => {
  let parent = await begin();
  parent = (
    await call(`/playthroughs/${parent.id}/choices`, choice(parent, "market"))
  ).data.save;
  const before = (await db.doc(saveOf(parent.id)).get()).data();
  for (const branchId of ["bell-diver", "paper-moon"]) {
    const r = await call(`/playthroughs/${parent.id}/branches`, {
      idempotencyKey: randomUUID(),
      expectedRevision: parent.revision,
      payload: { branchId },
    });
    expect(r.status).toBe(200);
    expect(r.data.save.parentPlaythroughId).toBe(parent.id);
    expect(
      (
        await call(
          `/playthroughs/${r.data.save.id}/choices`,
          choice(r.data.save, "help"),
        )
      ).status,
    ).toBe(200);
  }
  expect((await db.doc(saveOf(parent.id)).get()).data()).toEqual(before);
  await call(`/playthroughs/${parent.id}/choices`, choice(parent, "dock"));
  expect((await call(`/playthroughs/${parent.id}`)).data.save.pageId).toBe(
    "dock",
  );
});
it("rejects injected authoritative fields and locked choices", async () => {
  const s = await begin();
  expect(
    (
      await call(`/playthroughs/${s.id}/choices`, {
        ...choice(s, "market"),
        success: true,
      })
    ).status,
  ).toBe(400);
  expect(
    (await call(`/playthroughs/${s.id}/choices`, choice(s, "pass"))).status,
  ).toBe(400);
  expect(
    (
      await call("/playthroughs", {
        idempotencyKey: randomUUID(),
        payload: { storyId: "bell-diver" },
      })
    ).status,
  ).toBe(403);
});
it("bounds lists and supports event cursor pagination", async () => {
  const s = await begin();
  await call(`/playthroughs/${s.id}/choices`, choice(s, "market"));
  const first = await call(`/playthroughs/${s.id}/events?limit=1`);
  const second = await call(
    `/playthroughs/${s.id}/events?limit=1&cursor=${first.data.nextCursor}`,
  );
  expect(first.data.items[0].revision).toBe(0);
  expect(second.data.items[0].revision).toBe(1);
  expect((await call("/playthroughs?limit=999")).status).toBe(400);
  const savesFirst = await call("/playthroughs?limit=1");
  const savesSecond = await call(
    `/playthroughs?limit=1&cursor=${savesFirst.data.nextCursor}`,
  );
  expect(savesFirst.status).toBe(200);
  expect(savesSecond.status).toBe(200);
  expect(savesSecond.data.items[0].id).not.toBe(savesFirst.data.items[0].id);
});
it("Firestore rules deny all authoritative writes and private cross-user reads", async () => {
  const s = await begin();
  const own = rules.authenticatedContext("player").firestore();
  const other = rules.authenticatedContext("progressed").firestore();
  const anon = rules.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(own, saveOf(s.id))));
  await assertSucceeds(getDoc(doc(own, "users/player")));
  await assertFails(getDoc(doc(other, saveOf(s.id))));
  await assertFails(getDoc(doc(other, "users/player")));
  await assertFails(getDoc(doc(anon, saveOf(s.id))));
  for (const path of [
    saveOf(s.id),
    "users/player",
    "users/player/receipts/forged",
    "users/player/drafts/forged",
    "users/player/clips/forged",
    "stories/glass-harbor/versions/pages-v1",
    "placements/harbor-market",
    "wallets/player",
  ])
    await assertFails(setDoc(doc(own, path), { forged: true }));
  await assertSucceeds(getDoc(doc(anon, "catalogue/glass-harbor")));
  await assertFails(
    getDoc(doc(own, "stories/glass-harbor/draftNodes/private")),
  );
});
it("persists one server dice result across retries and rejects injected results", async () => {
  const started = await call("/playthroughs", {
    idempotencyKey: randomUUID(),
    payload: { storyId: "storm-signal" },
  });
  expect(started.status).toBe(200);
  const s = started.data.save as Save;
  const entered = await call(
    `/playthroughs/${s.id}/choices`,
    choice(s, "roll"),
  );
  expect(entered.status).toBe(200);
  const atRoll = entered.data.save as Save;
  const command = {
    ...choice(atRoll, "roll"),
    payload: { choiceId: "roll", action: "roll" },
  };
  const path = `/playthroughs/${s.id}/choices`;
  expect(
    (
      await call(path, {
        ...command,
        payload: { choiceId: "roll", result: 20 },
      })
    ).status,
  ).toBe(400);
  const first = await call(path, command);
  const retry = await call(path, command);
  expect(first.status).toBe(200);
  expect(retry.data).toEqual(first.data);
  const resumed = await call(`/playthroughs/${s.id}`);
  expect(resumed.data.save.lastRoll).toEqual(first.data.save.lastRoll);
  expect(resumed.data.user.id).toBe("player");
  expect(resumed.data.story.id).toBe("storm-signal");
  expect(resumed.data.save.pageId).toBe("roll");
  expect(
    (
      await call(path, {
        ...choice(resumed.data.save, "roll"),
        payload: { choiceId: "roll", action: "roll" },
      })
    ).status,
  ).toBe(400);
  const continued = await call(path, choice(resumed.data.save, "roll"));
  expect(continued.data.save.pageId).toBe(
    first.data.save.lastRoll.passed ? "signal" : "shelter",
  );
});
const clipBucket = "gs://demo-storybranch.appspot.com";
const clipStory = (storyId: string, video: string) => ({
  id: storyId,
  versionId: "draft",
  rulesetVersion: "prototype-1",
  title: "Clip test",
  entryPageId: "opening",
  pages: {
    opening: {
      id: "opening",
      title: "Opening",
      transcript: "",
      kind: "scene",
      pageType: "video",
      video,
      entryEffects: [],
      choices: [
        {
          id: "next",
          label: "Continue",
          unavailableDisplay: "locked",
          costs: [],
          outcome: {
            kind: "direct",
            route: { targetPageId: "ending", effects: [] },
          },
        },
      ],
    },
    ending: {
      id: "ending",
      title: "The end",
      transcript: "Done.",
      kind: "ending",
      pageType: "text",
      entryEffects: [],
      choices: [],
    },
  },
});
const draftAndPublish = async (storyId: string, video: string, who: string) => {
  const saved = await call(
    `/studio/${storyId}`,
    {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story: clipStory(storyId, video), description: "Clip test" },
    },
    who,
  );
  expect(saved.status).toBe(200);
  return call(
    `/studio/${storyId}/publish`,
    {
      idempotencyKey: randomUUID(),
      expectedRevision: 1,
      policyVersion: "creator-alpha-1",
    },
    who,
  );
};
it("uploads a clip through Storage rules, verifies it and plays it once published", async () => {
  const bytes = readFileSync(
    "apps/web/public/media/harbor-landscape-audio-v1.mp4",
  );
  const command = {
    idempotencyKey: randomUUID(),
    fileName: "harbor.mp4",
    contentType: "video/mp4",
    bytes: bytes.length,
    durationSeconds: 6,
  };
  expect((await call("/uploads", command, "none")).status).toBe(401);
  const created = await call("/uploads", command);
  expect(created.status).toBe(200);
  expect((await call("/uploads", command)).data).toEqual(created.data);
  expect((await call("/uploads", { ...command, bytes: 5 })).status).toBe(409);
  const { asset, path } = created.data;
  expect(path).toBe(`users/player/clips/${asset.id}`);
  expect(asset.status).toBe("pending");
  expect(asset.media).toBeUndefined();
  expect((await call(`/uploads/${asset.id}/complete`, {})).status).toBe(400);

  const own = rules.authenticatedContext("player").storage(clipBucket);
  const other = rules.authenticatedContext("progressed").storage(clipBucket);
  const meta = { contentType: "video/mp4" };
  await assertFails(uploadBytes(ref(other, path), bytes, meta));
  await assertFails(
    uploadBytes(ref(own, `users/player/clips/${randomUUID()}`), bytes, meta),
  );
  await assertFails(uploadBytes(ref(own, path), bytes.subarray(0, 100), meta));
  await assertFails(
    uploadBytes(ref(own, path), bytes, { contentType: "video/webm" }),
  );
  await assertSucceeds(uploadBytes(ref(own, path), bytes, meta));
  await assertFails(uploadBytes(ref(own, path), bytes, meta));
  await assertFails(getBytes(ref(own, path)));

  expect(
    (await call(`/uploads/${asset.id}/complete`, {}, "progressed")).status,
  ).toBe(404);
  const done = await call(`/uploads/${asset.id}/complete`, {});
  expect(done.status).toBe(200);
  expect(done.data.asset.status).toBe("ready");
  expect((await call(`/uploads/${asset.id}/complete`, {})).data).toEqual(
    done.data,
  );
  const src = done.data.asset.media.landscape.src;
  const served = await fetch(src);
  expect(served.status).toBe(200);
  expect(Buffer.from(await served.arrayBuffer()).equals(bytes)).toBe(true);
  expect(
    (await fetch(src.replace(/token=.*/, `token=${randomUUID()}`))).status,
  ).not.toBe(200);

  const mine = await call("/uploads");
  expect(mine.data.enabled).toBe(true);
  expect(mine.data.items.map((c: { id: string }) => c.id)).toContain(asset.id);
  const theirs = await call("/uploads", undefined, "progressed");
  expect(theirs.data.items.map((c: { id: string }) => c.id)).not.toContain(
    asset.id,
  );

  const video = `asset:${asset.id}`;
  const borrowed = await draftAndPublish(
    `clip-${randomUUID()}`,
    video,
    "progressed",
  );
  expect(borrowed.status).toBe(400);
  const storyId = `clip-${randomUUID()}`;
  const published = await draftAndPublish(storyId, video, "player");
  expect(published.status).toBe(200);
  expect(
    (await db.doc(`users/player/clips/${asset.id}`).get()).data()!.published,
  ).toBe(true);
  // The edition records the clip's file, so playback never reads the
  // creator's private clip record.
  expect(
    (await db.doc(`stories/${storyId}/versions/edition-1`).get()).data()!.clips[
      asset.id
    ],
  ).toMatchObject({ path, contentType: "video/mp4" });
  const started = await call(
    "/playthroughs",
    { idempotencyKey: randomUUID(), payload: { storyId } },
    "progressed",
  );
  const played = await call(
    `/playthroughs/${started.data.save.id}`,
    undefined,
    "progressed",
  );
  expect(played.data.page.video).toBe(video);
  expect(played.data.media).toEqual({
    landscape: { src, type: "video/mp4" },
  });
});
it("reuses a photo across pages while protecting ownership and media kind", async () => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYx8AAAAASUVORK5CYII=",
    "base64",
  );
  const created = await call("/uploads", {
    idempotencyKey: randomUUID(),
    fileName: "photo.png",
    contentType: "image/png",
    bytes: bytes.length,
    durationSeconds: 0,
  });
  expect(created.status).toBe(200);
  const { asset, path } = created.data;
  expect(path).toBe(`users/player/clips/${asset.id}`);
  await assertFails(
    uploadBytes(
      ref(rules.authenticatedContext("progressed").storage(clipBucket), path),
      bytes,
      { contentType: "image/png" },
    ),
  );
  await assertSucceeds(
    uploadBytes(
      ref(rules.authenticatedContext("player").storage(clipBucket), path),
      bytes,
      { contentType: "image/png" },
    ),
  );
  const done = await call(`/uploads/${asset.id}/complete`, {});
  expect(done.status).toBe(200);
  expect(done.data.asset.media).toBeUndefined();
  expect((await fetch(done.data.asset.url)).status).toBe(200);
  const content = {
    title: "Photo page",
    transcript: "A photograph",
    pageType: "text",
    image: `asset:${asset.id}`,
    outputs: [{ id: "next", label: "Continue" }],
  };
  for (let i = 0; i < 2; i++) {
    const pageId = randomUUID();
    expect(
      (
        await call(`/pages/${pageId}`, {
          idempotencyKey: randomUUID(),
          expectedRevision: 0,
          content,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`/pages/${pageId}/share`, {
          idempotencyKey: randomUUID(),
          revision: 1,
        })
      ).status,
    ).toBe(200);
    const shared = await call(`/shared-pages/${pageId}/1`, undefined, "none");
    expect(shared.data.image).toBe(done.data.asset.url);
  }
  expect(
    (
      await call(
        `/pages/${randomUUID()}`,
        { idempotencyKey: randomUUID(), expectedRevision: 0, content },
        "progressed",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(`/pages/${randomUUID()}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 0,
        content: { ...content, pageType: "video", video: `asset:${asset.id}` },
      })
    ).status,
  ).toBe(400);
});
it("rejects and removes an upload that is not really a video", async () => {
  const fake = Buffer.from("<html>this is not a video</html>");
  const created = await call("/uploads", {
    idempotencyKey: randomUUID(),
    fileName: "clip.mp4",
    contentType: "video/mp4",
    bytes: fake.length,
    durationSeconds: 5,
  });
  const { asset, path } = created.data;
  await assertSucceeds(
    uploadBytes(
      ref(rules.authenticatedContext("player").storage(clipBucket), path),
      fake,
      { contentType: "video/mp4" },
    ),
  );
  expect((await call(`/uploads/${asset.id}/complete`, {})).status).toBe(400);
  expect((await db.doc(`users/player/clips/${asset.id}`).get()).exists).toBe(
    false,
  );
  expect((await bucket.file(path).exists())[0]).toBe(false);
  expect(
    (
      await draftAndPublish(
        `clip-${randomUUID()}`,
        `asset:${asset.id}`,
        "player",
      )
    ).status,
  ).toBe(400);
});
it("reveals a quiz result from server-held scores, not the client", async () => {
  const started = await call("/playthroughs", {
    idempotencyKey: randomUUID(),
    payload: { storyId: "explorer-quiz" },
  });
  expect(started.status).toBe(200);
  let s = started.data.save as Save;
  for (const id of [
    "map",
    "storm-spark",
    "stranger-tinkerer",
    "treasure-spark",
    "reveal-keeper",
  ]) {
    const r = await call(`/playthroughs/${s.id}/choices`, choice(s, id));
    expect(r.status).toBe(200);
    s = r.data.save;
  }
  expect(s.pageId).toBe("reveal");
  expect(
    (
      await call(`/playthroughs/${s.id}/choices`, {
        ...choice(s, "reveal"),
        payload: { choiceId: "reveal", targetPageId: "keeper" },
      })
    ).status,
  ).toBe(400);
  const revealed = await call(
    `/playthroughs/${s.id}/choices`,
    choice(s, "reveal"),
  );
  expect(revealed.data.save.pageId).toBe("spark");
  expect(revealed.data.save.scores).toMatchObject({
    "explorer-quiz:spark": 2,
    "explorer-quiz:keeper": 1,
  });
  const resumed = await call(`/playthroughs/${s.id}`);
  expect(resumed.data).toMatchObject({ result: true, page: { id: "spark" } });
});
it("copies the old prefixed layout into per-user records without overwriting newer ones", async () => {
  const old = (path: string) => db.doc(`${OLD_ROOT}/${path}`);
  const uid = `mig-${randomUUID()}`;
  const saveId = randomUUID();
  const storyId = `mig-${randomUUID()}`;
  const save = `users/${uid}/playthroughs/${saveId}`;
  await old(`playerProfiles/${uid}`).set({ status: "active", stats: {} });
  await old(`playthroughs/${saveId}`).set({
    id: saveId,
    playerUid: uid,
    revision: 1,
  });
  await old(`playthroughs/${saveId}/events/00000001`).set({ at: 1 });
  await old("commandReceipts/receipt-1").set({ actor: uid, at: 1000 });
  await old(`creatorDrafts/${uid}/stories/${storyId}`).set({ revision: 1 });
  await old(`stories/${storyId}`).set({ creatorUid: uid });
  await old(`stories/${storyId}/versions/edition-1`).set({ ready: true });
  await old(`catalogue/${storyId}`).set({ id: storyId });
  try {
    const dry = await migrateLayout(db, { apply: false });
    expect(dry.unmapped).toEqual([]);
    expect(dry.counts.playthroughs).toEqual({ create: 1 });
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);

    await migrateLayout(db, { apply: true });
    for (const path of [
      `users/${uid}`,
      save,
      `${save}/events/00000001`,
      `users/${uid}/drafts/${storyId}`,
      `stories/${storyId}/versions/edition-1`,
      `catalogue/${storyId}`,
    ])
      expect((await db.doc(path).get()).exists, path).toBe(true);
    const receipt = (
      await db.doc(`users/${uid}/receipts/receipt-1`).get()
    ).data()!;
    expect(receipt.expireAt.toMillis()).toBe(1000 + 30 * 24 * 60 * 60 * 1000);

    const again = await migrateLayout(db, { apply: true });
    expect(again.counts.playthroughs).toEqual({ same: 1 });
    // The new code moved the save on: the copy keeps it.
    await db.doc(save).update({ revision: 5 });
    expect(
      (await migrateLayout(db, { apply: true })).counts.playthroughs,
    ).toEqual({ kept: 1 });
    expect((await db.doc(save).get()).data()!.revision).toBe(5);
    // The old layout moved further: the copy brings it forward.
    await old(`playthroughs/${saveId}`).update({ revision: 9 });
    await migrateLayout(db, { apply: true });
    expect((await db.doc(save).get()).data()!.revision).toBe(9);
    // Anything it cannot place blocks every write.
    await old(`assets/${randomUUID()}`).set({ ownerUid: uid });
    await old(`playthroughs/${saveId}`).update({ revision: 12 });
    const blocked = await migrateLayout(db, { apply: true });
    expect(blocked.unmapped).toHaveLength(1);
    expect((await db.doc(save).get()).data()!.revision).toBe(9);
  } finally {
    for (const path of [OLD_ROOT, `users/${uid}`, `stories/${storyId}`])
      await db.recursiveDelete(db.doc(path));
    await db.doc(`catalogue/${storyId}`).delete();
  }
});
