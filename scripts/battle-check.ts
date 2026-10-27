import "../tests/emulator-env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, config } from "../services/api/firebase";
import { starterStory } from "../apps/web/src/studio-model";
import { stagedBattleStorySchema } from "../packages/contracts/battle-graph";
import { startBattleStory } from "../packages/domain/battle-player";
import { battleContractVersion } from "../packages/contracts/battle-player";
import { launchBrowser } from "./browser";
if (config.mode !== "emulator" || config.projectId !== "demo-storybranch")
  throw Error("Demo emulators required");
async function seed(outcome: string, child = false) {
  const base = starterStory("000-battle-ui-" + randomUUID());
  base.storyNodes.opening.title = "Before the battle";
  base.storyNodes.opening.storyNodeType = "text";
  base.storyNodes.opening.choices = [
    {
      id: "enter",
      label: "Enter battle",
      costs: [],
      unavailableDisplay: "hidden",
      outcome: {
        kind: "direct",
        route: { targetStoryNodeId: "fight", effects: [] },
      },
    },
  ];
  const story = stagedBattleStorySchema.parse({
    ...base,
    storyNodes: {
      ...base.storyNodes,
      fight: {
        id: "fight",
        title: "The gatekeeper",
        transcript: "A guard blocks your path.",
        kind: "scene",
        storyNodeType: "battle",
        entryEffects: [],
        battle: {
          version: 1,
          rules: "battle-1",
          enemy: {
            name: "Gatekeeper",
            maxHealth: 1,
            attack: 5,
            defense: 0,
            agility: 1,
          },
          maxTurns: outcome === "loss" ? 1 : 10,
        },
        outputs: Object.fromEntries(
          ["win", "loss", "escape"].map((x) => [
            x,
            { targetStoryNodeId: "ending", effects: [] },
          ]),
        ),
      },
    },
  });
  if (child) story.entryStoryNodeId = "fight";
  const save = startBattleStory(
    story,
    randomUUID(),
    "player",
    { strength: 8, agility: 8, resolve: 8, intellect: 8, charisma: 8 },
    Date.now(),
  );
  const { storyNodes, ...manifest } = story;
  const ref = db.doc(`stories/${story.id}/versions/${story.versionId}`);
  const batch = db.batch();
  batch.set(ref, {
    ...manifest,
    ready: true,
    battleContract: battleContractVersion,
  });
  for (const n of Object.values(storyNodes))
    batch.set(ref.collection("storyNodes").doc(n.id), n);
  batch.set(db.doc(`stories/${story.id}`), {
    creatorUid: "player",
    publishedVersionId: story.versionId,
  });
  if (!child)
    batch.set(db.doc(`catalogue/${story.id}`), {
      id: story.id,
      title: story.title,
      versionId: story.versionId,
      hidden: false,
      genre: "Adventure",
      creator: "Test",
      duration: "1 min",
      description: "Battle entry check",
    });
  await batch.commit();
  return save;
}
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const tab = await context.newPage();
    tab.on("pageerror", (error) =>
      console.error("Browser error:", error.message),
    );
    await tab.addInitScript(
      (theme) => localStorage.setItem("storybranch-theme", theme),
      width === 390 ? "dark" : "light",
    );
    await tab.goto("http://127.0.0.1:5173");
    await tab
      .getByRole("button", { name: /Sign in/ })
      .first()
      .click();
    await tab.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    for (const outcome of ["win", "loss", "escape"]) {
      const save = await seed(outcome);
      await tab.goto(`http://127.0.0.1:5173/s/${save.storyId}`);
      await tab.getByRole("button", { name: "Start a new journey" }).click();
      await tab.waitForURL("**/play/*");
      save.id = new URL(tab.url()).pathname.split("/").at(-1)!;
      await tab.getByRole("button", { name: /Enter battle/ }).click();
      await tab.getByRole("button", { name: "Attack", exact: true }).waitFor();
      assert.equal(
        await tab
          .locator('[data-story-node-type="battle"] .battle-display')
          .count(),
        1,
      );
      const before = (await tab.locator(".reading-story-node").boundingBox())!;
      if (outcome === "win") {
        await context.setOffline(true);
        await tab.waitForFunction(() => navigator.onLine === false);
        assert.equal(
          await tab
            .getByRole("button", { name: "Attack", exact: true })
            .isDisabled(),
          true,
        );
        await context.setOffline(false);
        let failed = false;
        const commands: string[] = [];
        await tab.route(
          "**/api/playthroughs/*/battle-actions",
          async (route) => {
            commands.push(route.request().postData()!);
            if (!failed) {
              failed = true;
              await route.fetch();
              await route.abort("failed");
            } else await route.continue();
          },
        );
        await tab.getByRole("button", { name: "Guard", exact: true }).click();
        await tab.getByRole("button", { name: "Retry same request" }).click();
        await tab.getByText("Turn 1 / 10", { exact: false }).waitFor();
        assert.equal(commands[0], commands[1]);
        await tab.unroute("**/api/playthroughs/*/battle-actions");
        const other = await context.newPage();
        await other.goto(`http://127.0.0.1:5173/play/${save.id}`);
        await other.getByRole("button", { name: "Guard", exact: true }).click();
        await other.getByText("Turn 2 / 10", { exact: false }).waitFor();
        await other.close();
        await tab.getByRole("button", { name: "Attack", exact: true }).click();
        await tab
          .getByRole("button", { name: "Reload current progress" })
          .click();
        await tab.getByText("Turn 2 / 10", { exact: false }).waitFor();
        await tab.waitForFunction(
          () =>
            !(
              document.querySelector(
                ".battle-actions button",
              ) as HTMLButtonElement
            )?.disabled,
        );
        await tab.getByRole("button", { name: "Attack", exact: true }).focus();
        await tab.keyboard.press("Enter");
      } else
        await tab
          .getByRole("button", {
            name: outcome === "loss" ? "Guard" : "Escape",
            exact: true,
          })
          .click();
      await tab
        .getByRole("button", { name: "Continue", exact: true })
        .waitFor();
      await tab.getByText(/Your result is saved\./).waitFor();
      const after = (await tab.locator(".reading-story-node").boundingBox())!;
      assert.equal(
        Math.round(before.height),
        Math.round(after.height),
        "battle result must retain layout height",
      );
      assert.equal(
        (await db.doc(`users/player/playthroughs/${save.id}`).get()).data()
          ?.storyNodeId,
        "fight",
      );
      await tab.screenshot({
        path: `test-results/battle-${outcome}-${width}.png`,
        fullPage: true,
      });
      await tab.reload();
      await tab.getByRole("button", { name: "Continue", exact: true }).click();
      await tab
        .getByRole("heading", {
          name: starterStory("tmp").storyNodes.ending.title,
          exact: true,
        })
        .waitFor();
      assert.equal(await tab.locator(".battle-display").count(), 0);
      assert.equal(
        (await db.doc(`users/player/playthroughs/${save.id}`).get()).data()
          ?.status,
        "completed",
      );
      const completed = (
        await db.doc(`users/player/playthroughs/${save.id}`).get()
      ).data();
      await tab.getByRole("button", { name: /Begin another journey/ }).click();
      await tab.getByRole("button", { name: /Enter battle/ }).waitFor();
      const replayId = new URL(tab.url()).pathname.split("/").at(-1)!;
      assert.notEqual(replayId, save.id);
      assert.deepEqual(
        (await db.doc(`users/player/playthroughs/${save.id}`).get()).data(),
        completed,
      );
      await tab.getByRole("button", { name: /Enter battle/ }).click();
      await tab.getByRole("button", { name: "Attack", exact: true }).waitFor();
      assert.equal(
        (await db.doc(`users/player/playthroughs/${replayId}`).get()).data()
          ?.battle.turns,
        0,
      );
    }
    const parent = await seed("win"),
      child = await seed("win", true);
    const branchId = "battle-child-" + randomUUID(),
      location = "battle-location-" + randomUUID();
    await db
      .doc(
        `stories/${parent.storyId}/versions/${parent.versionId}/storyNodes/opening`,
      )
      .update({ branchLocation: location });
    await db.doc(`branches/${branchId}`).set({
      id: branchId,
      title: "Visit the child battle",
      author: "Test",
      locationId: location,
      sourceVersionId: parent.versionId,
      storyId: child.storyId,
      versionId: child.versionId,
    });
    await db.doc(`placements/${location}`).set({ nominatedBranchId: branchId });
    await tab.goto(`http://127.0.0.1:5173/s/${parent.storyId}`);
    await tab.getByRole("button", { name: "Start a new journey" }).click();
    await tab.waitForURL("**/play/*");
    const parentUrl = tab.url(),
      parentId = new URL(parentUrl).pathname.split("/").at(-1)!;
    const beforeChild = (
      await db.doc(`users/player/playthroughs/${parentId}`).get()
    ).data();
    await tab.getByRole("button", { name: /Visit the child battle/ }).click();
    await tab.getByRole("button", { name: "Attack", exact: true }).click();
    await tab.getByRole("button", { name: "Continue", exact: true }).click();
    await tab
      .getByRole("heading", {
        name: starterStory("tmp").storyNodes.ending.title,
        exact: true,
      })
      .waitFor();
    await tab
      .getByRole("button", { name: /Return to main adventure/ })
      .waitFor();
    const childId = new URL(tab.url()).pathname.split("/").at(-1)!;
    assert.notEqual(childId, parentId);
    assert.equal(
      (await db.doc(`users/player/playthroughs/${childId}`).get()).data()
        ?.status,
      "completed",
    );
    assert.equal(
      (await db.doc(`users/player/playthroughs/${childId}`).get()).data()
        ?.parentPlaythroughId,
      parentId,
    );
    await tab.screenshot({
      path: `test-results/battle-child-${width}.png`,
      fullPage: true,
    });
    await tab.reload();
    await tab.getByRole("button", { name: /Return to main adventure/ }).click();
    await tab.getByRole("button", { name: /Enter battle/ }).waitFor();
    assert.equal(tab.url(), parentUrl);
    assert.deepEqual(
      (await db.doc(`users/player/playthroughs/${parentId}`).get()).data(),
      beforeChild,
    );
    await context.close();
  }
  console.log(
    "Battle shared-player browser flows passed: desktop/mobile, light/dark, reduced motion, keyboard, offline, lost-response retry, stale-tab reconciliation, root starts, isolated replay, child battle completion/return, reload and all three outcomes.",
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const tab of context.pages()) {
      console.log((await tab.locator("body").innerText()).slice(-5000));
      await tab.screenshot({
        path: "test-results/battle-failure.png",
        fullPage: true,
      });
    }
  throw error;
} finally {
  await browser.close();
}
