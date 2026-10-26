import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    const view = async (name: "Map" | "Panel") => {
      const nav = tab.locator(".studio-views");
      if (await nav.isVisible())
        await nav
          .getByRole("button", {
            name: name === "Map" ? "Map" : /^(StoryTrunk|Edit StoryNode)$/,
          })
          .click();
    };
    const pane = async (name: "StoryTrunk" | "StoryNode") => {
      await view("Panel");
      await tab
        .locator(".studio-panel .studio-tabs")
        .getByRole("button", { name, exact: true })
        .click();
    };
    const save = async () => {
      await tab
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await tab
        .locator(".studio-status")
        .getByText("All changes saved", { exact: true })
        .waitFor();
    };
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: "Sign in to create" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    await tab.getByRole("button", { name: "New story", exact: true }).click();
    await tab.getByText("Your Story is blank.", { exact: false }).waitFor();
    const title = `Trunk ${width} ${Date.now()}`;
    await tab.getByLabel("Story title", { exact: true }).fill(title);
    await tab
      .getByLabel("Starting keys", { exact: true })
      .fill("invitation, brass-key");
    await tab.getByLabel("Description", { exact: true }).click();
    await tab
      .getByRole("button", { name: "Add persistent key", exact: true })
      .click();
    await tab
      .getByLabel("Persistent key 1 name", { exact: true })
      .fill("returning");
    await tab
      .getByLabel("Persistent key 1 label", { exact: true })
      .fill("Returning explorer");
    await tab
      .getByLabel("Persistent key 1 completions", { exact: true })
      .fill("1");
    await save();
    await tab
      .getByRole("button", { name: "Require invitation to start", exact: true })
      .click();
    await tab
      .getByText("New journeys: Invitation required", { exact: true })
      .waitFor();
    await tab.reload();
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    await tab.getByText("Your Story is blank.", { exact: false }).waitFor();
    assert.equal(
      await tab.getByLabel("Starting keys", { exact: true }).inputValue(),
      "invitation, brass-key",
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    assert.equal(await tab.locator(".studio-preview").count(), 0);
    await view("Map");
    const graph = tab.getByRole("region", { name: "Branching story timeline" });
    await graph
      .getByLabel("New timeline StoryNode type")
      .selectOption("text-options");
    await graph
      .getByRole("button", { name: "+ Add StoryNode", exact: true })
      .click();
    await pane("StoryNode");
    const opening = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("Choose a path");
    await view("Map");
    await graph
      .getByLabel("New timeline StoryNode type")
      .selectOption("ending");
    await graph
      .getByRole("button", { name: "+ Add StoryNode", exact: true })
      .click();
    await pane("StoryNode");
    const ending = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("Safe ending");
    await tab
      .getByLabel("Completion summary", { exact: true })
      .fill("You brought the harbor home.");
    await tab
      .getByRole("button", { name: "Add reward key", exact: true })
      .click();
    await tab.getByLabel("Reward 1 key", { exact: true }).fill("rescuer");
    await tab
      .getByLabel("Reward 1 label", { exact: true })
      .fill("Harbor rescuer");
    await tab
      .getByRole("button", { name: "Add reward key", exact: true })
      .click();
    await tab.getByLabel("Reward 2 key", { exact: true }).fill("invitation");
    await tab
      .getByLabel("Reward 2 label", { exact: true })
      .fill("Old invitation");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption(opening);
    await tab
      .getByText("Advanced conditions and effects (JSON)", { exact: true })
      .click();
    const outputs = [
      {
        id: "bonus",
        label: "Returning explorer route",
        costs: [],
        unavailableDisplay: "hidden",
        outcome: {
          kind: "direct",
          route: { targetStoryNodeId: ending, effects: [] },
        },
      },
      {
        id: "safe",
        label: "Finish",
        costs: [],
        unavailableDisplay: "locked",
        outcome: {
          kind: "direct",
          route: { targetStoryNodeId: ending, effects: [] },
        },
      },
      {
        id: "unfinished",
        label: "Secret unfinished route",
        costs: [],
        unavailableDisplay: "locked",
        outcome: {
          kind: "direct",
          route: { targetStoryNodeId: "missing", effects: [] },
        },
      },
    ];
    await tab.getByLabel("Outputs JSON").fill(JSON.stringify(outputs));
    await tab.getByLabel("StoryNode title", { exact: true }).click();
    await tab
      .getByLabel("Option 1 persistent key", { exact: true })
      .selectOption({ label: "Returning explorer" });
    await pane("StoryTrunk");
    await tab
      .getByRole("region", { name: "Publication review" })
      .getByText(/Secret unfinished route/)
      .waitFor();
    await tab
      .getByLabel("Persistent key 1 trigger", { exact: true })
      .selectOption("achievement");
    await tab
      .getByLabel("Persistent key 1 achievement ending", { exact: true })
      .selectOption(ending);
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/trunk-${width}-${theme}.png`,
      });
      await tab
        .getByLabel("Persistent key 1 name", { exact: true })
        .scrollIntoViewIfNeeded();
      await tab.screenshot({
        path: `test-results/persistent-keys-${width}-${theme}.png`,
      });
    }
    await save();
    await tab.reload();
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    assert.equal(
      await tab
        .getByLabel("Persistent key 1 trigger", { exact: true })
        .inputValue(),
      "achievement",
    );
    assert.equal(
      await tab
        .getByLabel("Persistent key 1 achievement ending", { exact: true })
        .inputValue(),
      ending,
    );
    await pane("StoryNode");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption(ending);
    assert.equal(
      await tab.getByLabel("Completion summary", { exact: true }).inputValue(),
      "You brought the harbor home.",
    );
    assert.equal(
      await tab.getByLabel("Reward 1 key", { exact: true }).inputValue(),
      "rescuer",
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.locator(".studio-preview");
    await preview.getByRole("heading", { name: "Choose a path" }).waitFor();
    assert.equal(
      await preview
        .getByRole("button", { name: /Returning explorer route/ })
        .count(),
      0,
    );
    assert.equal(
      await preview
        .getByRole("button", { name: /Secret unfinished route/ })
        .count(),
      0,
    );
    await preview.getByRole("button", { name: /Finish/ }).click();
    await preview.getByRole("heading", { name: "Safe ending" }).waitFor();
    await preview
      .getByText("Harbor rescuer — Earned", { exact: true })
      .waitFor();
    await preview
      .getByText("Old invitation — Already held", { exact: true })
      .waitFor();
    await tab.getByRole("button", { name: "Close preview" }).click();
    await tab
      .getByRole("button", { name: "Publish edition", exact: true })
      .click();
    await tab
      .getByText(/Published edition-\d+\. Your story is now in Discover\./)
      .waitFor();
    const achievementTitle = `Verified rescuer ${width} ${Date.now()}`;
    await tab.getByText("Status: Not submitted", { exact: true }).waitFor();
    await tab
      .getByLabel("Achievement title", { exact: true })
      .fill(achievementTitle);
    await tab
      .getByLabel("Achievement description", { exact: true })
      .fill("Reached the approved ending.");
    const submitted = tab.waitForResponse(
      (r) =>
        r.url().endsWith("/api/achievement-submissions") &&
        r.request().method() === "POST",
    );
    await tab
      .getByRole("button", { name: "Submit for approval", exact: true })
      .click();
    const submission = await (await submitted).json();
    await tab.getByText("Status: pending", { exact: true }).waitFor();
    await tab.goto("http://127.0.0.1:5173/admin/achievements");
    const review = tab.locator("article").filter({
      has: tab.getByRole("heading", { name: achievementTitle, exact: true }),
    });
    await review
      .getByRole("region", { name: "Achievement key rewards" })
      .getByText(/Returning explorer/)
      .waitFor();
    await review
      .getByLabel(`Review reason for ${achievementTitle}`)
      .fill("Verified the published StoryLeaf and its eligibility.");
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await review.getByText("Status: approved", { exact: true }).waitFor();
    await review
      .getByText("Published ending: Safe ending", { exact: true })
      .click();
    await review.getByText("What happens here?", { exact: true }).waitFor();
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.screenshot({
      path: `test-results/achievement-review-${width}.png`,
    });
    await tab.goto(`http://127.0.0.1:5173/s/${submission.storyId}`);
    await tab
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await tab.getByRole("heading", { name: "Choose a path" }).waitFor();
    assert.equal(
      await tab
        .getByRole("button", { name: /Returning explorer route/ })
        .count(),
      0,
    );
    assert.equal(
      await tab
        .getByRole("button", { name: /Secret unfinished route/ })
        .count(),
      0,
    );
    await tab.getByRole("button", { name: /Finish/ }).click();
    await tab.getByRole("heading", { name: "Safe ending" }).waitFor();
    await tab.reload();
    await tab.getByRole("heading", { name: "Safe ending" }).waitFor();
    await tab
      .getByText("You brought the harbor home.", { exact: true })
      .waitFor();
    await tab.getByText("Harbor rescuer — Earned", { exact: true }).waitFor();
    await tab
      .getByRole("region", { name: "Persistent keys earned" })
      .getByText("Returning explorer", { exact: true })
      .waitFor();
    await tab
      .getByText("Old invitation — Already held", { exact: true })
      .waitFor();
    await tab
      .getByText(`Account achievement: ${achievementTitle}`, { exact: true })
      .waitFor();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await tab
        .getByRole("region", { name: "StoryLeaf completion" })
        .scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/story-leaf-${width}-${theme}.png`,
      });
    }
    await tab.getByRole("button", { name: /Begin another journey/ }).click();
    await tab.getByRole("heading", { name: "Choose a path" }).waitFor();
    await tab.getByRole("button", { name: /Returning explorer route/ }).click();
    await tab
      .getByRole("region", { name: "StoryLeaf completion" })
      .getByText(/Already earned/)
      .waitFor();
    await tab.goto("http://127.0.0.1:5173/adventures");
    await tab
      .getByRole("region", { name: "My account achievements" })
      .getByText(achievementTitle, { exact: true })
      .waitFor();
    await tab
      .getByRole("region", { name: "My account achievements" })
      .scrollIntoViewIfNeeded();
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.screenshot({
      path: `test-results/achievement-account-${width}.png`,
    });
    await tab.goto("http://127.0.0.1:5173/admin/achievements");
    await review
      .getByLabel(`Review reason for ${achievementTitle}`)
      .fill("Revocation flow verification.");
    await review.getByRole("button", { name: "Revoke", exact: true }).click();
    await review.getByText("Status: revoked", { exact: true }).waitFor();
    await tab.goto("http://127.0.0.1:5173/adventures");
    await tab
      .getByRole("region", { name: "My account achievements" })
      .getByRole("listitem")
      .filter({ hasText: achievementTitle })
      .getByText(/Revoked/)
      .waitFor();
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    await pane("StoryTrunk");
    await tab
      .getByRole("button", { name: "Create invitation code", exact: true })
      .click();
    const invitationCode = tab.getByLabel("New invitation code", {
      exact: true,
    });
    await invitationCode.waitFor();
    await tab
      .getByText("Saving invitations…", { exact: true })
      .waitFor({ state: "hidden" });
    const code = await invitationCode.inputValue();
    assert.match(code, /^[a-f0-9]{48}$/);
    await invitationCode.scrollIntoViewIfNeeded();
    await tab.screenshot({
      path: `test-results/invitation-creator-${width}.png`,
    });
    const guest = await browser.newPage({ viewport: { width, height: 950 } });
    guest.on("pageerror", (e) => errors.push(e.message));
    await guest.goto(`http://127.0.0.1:5173/s/${submission.storyId}`);
    await guest
      .getByRole("button", { name: "Sign in to redeem", exact: true })
      .click();
    await guest
      .getByRole("dialog")
      .getByLabel("Email", { exact: true })
      .fill("progressed@storybranch.test");
    await guest
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗", exact: true })
      .click();
    await guest.getByRole("dialog").waitFor({ state: "hidden" });
    await guest
      .getByText("An invitation is required to start a new journey.", {
        exact: true,
      })
      .waitFor();
    await guest
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await guest.getByText(/This Story needs an invitation/).waitFor();
    await guest.getByLabel("Invitation code", { exact: true }).fill(code);
    await guest
      .getByRole("button", { name: "Redeem invitation", exact: true })
      .click();
    await guest
      .getByText(
        "Your permanent entry key is saved. You can start this Story.",
        { exact: true },
      )
      .waitFor();
    for (const theme of ["light", "dark"]) {
      await guest.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await guest
        .getByRole("region", { name: "Story entry key" })
        .scrollIntoViewIfNeeded();
      assert(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await guest.screenshot({
        path: `test-results/invitation-player-${width}-${theme}.png`,
      });
    }
    await guest.reload();
    await guest
      .getByText(
        "Your permanent entry key is saved. You can start this Story.",
        { exact: true },
      )
      .waitFor();
    await guest
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await guest.getByRole("heading", { name: "Choose a path" }).waitFor();
    await guest.getByRole("button", { name: /Finish/ }).click();
    await guest.getByRole("heading", { name: "Safe ending" }).waitFor();
    await guest.close();
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: StoryTrunk, persistent keys, achievements, pre-publication invitation policy, code issuance, recipient redemption/reload and safe player completion at desktop/mobile in both themes.",
  );
} finally {
  await browser.close();
}
