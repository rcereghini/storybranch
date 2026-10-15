import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
const signIn = async (page: import("playwright").Page) => {
  await page.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗" })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
};
try {
  // Play the sample quiz to a server-revealed result and its share card.
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173");
    await page
      .getByRole("button", { name: /Sign in/ })
      .first()
      .click();
    await signIn(page);
    await page
      .getByRole("button", { name: /Play What Kind of Explorer Are You\?/ })
      .click();
    await page.getByRole("heading", { name: "Before the voyage" }).waitFor();
    await page.getByRole("button", { name: /Start the quiz/ }).click();
    for (const answer of [
      "Show it to the whole crew",
      "Below deck, patching the pump",
      "Ask if there's room for your friends",
      "The one thing nobody can explain",
    ])
      await page.getByRole("button", { name: answer }).click();
    await page
      .getByRole("heading", { name: "Your compass is spinning" })
      .waitFor();
    assert.equal(await page.locator("video:visible").count(), 0);
    await page.getByRole("button", { name: /Reveal my result/ }).click();
    await page.getByRole("heading", { name: "The Keeper" }).waitFor();
    await page.getByText("YOUR RESULT", { exact: true }).waitFor();
    await page.getByText("Share your result").click();
    const card = page.getByLabel("Ending share card");
    await card.getByText("MY RESULT").waitFor();
    await card.getByText("What will you get?", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Copy result link" }).waitFor();
    await page.getByRole("button", { name: /Take the quiz again/ }).waitFor();
    await page.screenshot({ path: `test-results/quiz-result-${width}.png` });
    await page.reload();
    await page.getByRole("heading", { name: "The Keeper" }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Build a quiz from the Studio template and preview it to a result.
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/studio");
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await signIn(page);
  await page.getByRole("button", { name: "New quiz", exact: true }).click();
  await page
    .getByLabel("Edit page", { exact: true })
    .selectOption("question-2");
  assert.match(
    await page.getByLabel("Option 3 counts toward").inputValue(),
    /:result-c$/,
  );
  // Point the second question's first answer at The Dreamer instead.
  await page
    .getByLabel("Option 1 counts toward")
    .selectOption({ label: "The Dreamer" });
  await page.getByLabel("Edit page", { exact: true }).selectOption("reveal");
  await page.getByRole("button", { name: "Add result", exact: true }).click();
  await page.getByRole("button", { name: "Remove result 4" }).waitFor();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved privately.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.locator(".studio-preview");
  await preview.getByRole("button", { name: /Start the quiz/ }).click();
  await preview.getByRole("button", { name: /Daydream/ }).click();
  await preview.getByRole("button", { name: /A map/ }).click();
  await preview.getByRole("button", { name: /Reveal my result/ }).click();
  await preview.getByRole("heading", { name: "The Dreamer" }).waitFor();
  await preview.getByText("YOUR RESULT", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  console.log(
    "PASS: sample quiz to a server-revealed result with its share card at desktop/mobile widths, reload; Studio quiz template, answer scoring, added result and preview.",
  );
} finally {
  await browser.close();
}
