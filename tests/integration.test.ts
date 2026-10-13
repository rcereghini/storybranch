import "./emulator-env";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../services/api/firebase";
import { handle } from "../services/api/handler";
import { ensurePlayerProfile } from "../services/api/player-profile";
import type { Save } from "../packages/contracts/index";
let tokens: Record<string, string> = {};
let rules: RulesTestEnvironment;
it("creates a live-style profile once without resetting stats or reactivating disabled users", async () => {
  const uid = `profile-${randomUUID()}`;
  const ref = db.doc(`playerProfiles/${uid}`);
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
  expect(
    (await call(`/playthroughs/${s.id}`, undefined, "progressed")).status,
  ).toBe(403);
  expect(
    (
      await call(
        `/playthroughs/${s.id}/choices`,
        choice(s, "market"),
        "progressed",
      )
    ).status,
  ).toBe(403);
  await db.doc("playerProfiles/progressed").update({ status: "disabled" });
  try {
    expect((await call("/playthroughs", undefined, "progressed")).status).toBe(
      403,
    );
  } finally {
    await db.doc("playerProfiles/progressed").update({ status: "active" });
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
  expect((await db.collection(`playthroughs/${s.id}/events`).get()).size).toBe(
    2,
  );
  const resumed = await call(`/playthroughs/${s.id}`);
  expect(resumed.data.save.items["glass-harbor:token"]).toBe(1);
  expect(resumed.data.save.nodeId).toBe("courier");
});
it("commits only one competing choice at the same revision", async () => {
  const s = await begin();
  const results = await Promise.all([
    call(`/playthroughs/${s.id}/choices`, choice(s, "courier")),
    call(`/playthroughs/${s.id}/choices`, choice(s, "market")),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await db.collection(`playthroughs/${s.id}/events`).get()).size).toBe(
    2,
  );
});
it("pins old saves when the published pointer changes", async () => {
  const s = await begin();
  await db
    .doc("stories/glass-harbor")
    .update({ publishedVersionId: "v2-not-ready" });
  try {
    const r = await call(`/playthroughs/${s.id}/choices`, choice(s, "market"));
    expect(r.status).toBe(200);
    expect(r.data.save.versionId).toBe("v1");
    expect(
      (
        await call("/playthroughs", {
          idempotencyKey: randomUUID(),
          payload: { storyId: "glass-harbor" },
        })
      ).status,
    ).toBe(404);
  } finally {
    await db.doc("stories/glass-harbor").update({ publishedVersionId: "v1" });
  }
});
it("allows both branches, isolates child changes and returns current parent", async () => {
  let parent = await begin();
  parent = (
    await call(`/playthroughs/${parent.id}/choices`, choice(parent, "market"))
  ).data.save;
  const before = (await db.doc(`playthroughs/${parent.id}`).get()).data();
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
  expect((await db.doc(`playthroughs/${parent.id}`).get()).data()).toEqual(
    before,
  );
  await call(`/playthroughs/${parent.id}/choices`, choice(parent, "dock"));
  expect((await call(`/playthroughs/${parent.id}`)).data.save.nodeId).toBe(
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
  await assertSucceeds(getDoc(doc(own, `playthroughs/${s.id}`)));
  await assertFails(getDoc(doc(other, `playthroughs/${s.id}`)));
  await assertFails(getDoc(doc(anon, `playthroughs/${s.id}`)));
  for (const path of [
    `playthroughs/${s.id}`,
    "playerProfiles/player",
    "stories/glass-harbor/versions/v1",
    "placements/harbor-market",
    "wallets/player",
    "commandReceipts/forged",
  ])
    await assertFails(setDoc(doc(own, path), { forged: true }));
  await assertSucceeds(getDoc(doc(anon, "catalogue/glass-harbor")));
  await assertFails(
    getDoc(doc(own, "stories/glass-harbor/draftNodes/private")),
  );
});
