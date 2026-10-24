import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
const signIn = async (tab: import("playwright").Page) => {
  await tab.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await tab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗" })
    .click();
  await tab.getByRole("dialog").waitFor({ state: "hidden" });
};
try {
  // Play the sample quiz to a server-revealed result and its share card.
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.goto("http://127.0.0.1:5173");
    await tab
      .getByRole("button", { name: /Sign in/ })
      .first()
      .click();
    await signIn(tab);
    // Stories are played from Discover; Home shows recommendations.
    await tab.goto("http://127.0.0.1:5173/discover");
    await tab
      .getByRole("button", { name: /Play What Kind of Explorer Are You\?/ })
      .click();
    await tab.getByRole("heading", { name: "Before the voyage" }).waitFor();
    await tab.getByRole("button", { name: /Start the quiz/ }).click();
    for (const answer of [
      "Show it to the whole crew",
      "Below deck, patching the pump",
      "Ask if there's room for your friends",
      "The one thing nobody can explain",
    ])
      await tab.getByRole("button", { name: answer }).click();
    await tab
      .getByRole("heading", { name: "Your compass is spinning" })
      .waitFor();
    assert.equal(await tab.locator("video:visible").count(), 0);
    await tab.getByRole("button", { name: /Reveal my result/ }).click();
    await tab.getByRole("heading", { name: "The Keeper" }).waitFor();
    await tab.getByText("YOUR RESULT", { exact: true }).waitFor();
    await tab.getByText("Share your result").click();
    const card = tab.getByLabel("Ending share card");
    await card.getByText("MY RESULT").waitFor();
    await card.getByText("What will you get?", { exact: false }).waitFor();
    await tab.getByRole("button", { name: "Copy result link" }).waitFor();
    await tab.getByRole("button", { name: /Take the quiz again/ }).waitFor();
    await tab.screenshot({ path: `test-results/quiz-result-${width}.png` });
    await tab.reload();
    await tab.getByRole("heading", { name: "The Keeper" }).waitFor();
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await tab.close();
  }
  // Build a quiz from the Studio template and preview it to a result.
  const tab = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  const errors: string[] = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  await tab.goto("http://127.0.0.1:5173/studio");
  await tab.getByRole("button", { name: "Sign in to create" }).click();
  await signIn(tab);
  await tab.getByRole("button", { name: "New quiz", exact: true }).click();
  await tab
    .getByLabel("Edit StoryNode", { exact: true })
    .selectOption("question-2");
  assert.match(
    await tab.getByLabel("Option 3 counts toward").inputValue(),
    /:result-c$/,
  );
  // Point the second question's first answer at The Dreamer instead.
  await tab
    .getByLabel("Option 1 counts toward")
    .selectOption({ label: "The Dreamer" });
  await tab
    .getByLabel("Edit StoryNode", { exact: true })
    .selectOption("reveal");
  await tab.getByRole("button", { name: "Add result", exact: true }).click();
  await tab.getByRole("button", { name: "Remove result 4" }).waitFor();
  await tab.getByRole("button", { name: "Save draft", exact: true }).click();
  await tab
    .locator(".studio-status")
    .getByText("All changes saved", { exact: true })
    .waitFor();
  await tab.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = tab.locator(".studio-preview");
  await preview.getByRole("button", { name: /Start the quiz/ }).click();
  await preview.getByRole("button", { name: /Daydream/ }).click();
  await preview.getByRole("button", { name: /A map/ }).click();
  await preview.getByRole("button", { name: /Reveal my result/ }).click();
  await preview.getByRole("heading", { name: "The Dreamer" }).waitFor();
  await preview.getByText("YOUR RESULT", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await tab.close();
  console.log(
    "PASS: sample quiz to a server-revealed result with its share card at desktop/mobile widths, reload; Studio quiz template, answer scoring, added result and preview.",
  );
} finally {
  await browser.close();
}
