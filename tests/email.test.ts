import { describe, expect, it } from "vitest";
import {
  emailContentSchema,
  emailTemplates,
  unknownPlaceholders,
  adminEmailCommandSchema,
  sampleEmailLink,
} from "../packages/contracts/email";
import { renderEmail } from "../packages/email/render";

const site = "https://www.storybranch.com";
const link =
  "https://www.storybranch.com/account/action?mode=resetPassword&oobCode=abc";

describe("System email content", () => {
  it("accepts every built-in template and only the name placeholder", () => {
    for (const template of Object.values(emailTemplates))
      expect(emailContentSchema.parse(template.defaults)).toEqual(
        template.defaults,
      );
    expect(unknownPlaceholders("Hi {{name}} and {{ link }}")).toEqual(["link"]);
    const content = emailTemplates.welcome.defaults;
    expect(
      emailContentSchema.safeParse({ ...content, heading: "Hi {{email}}" })
        .success,
    ).toBe(false);
    expect(
      emailContentSchema.safeParse({ ...content, paragraphs: [] }).success,
    ).toBe(false);
  });
});

describe("Email rendering", () => {
  it("fills the name, escapes everything an editor wrote, and keeps a text version", () => {
    const email = renderEmail({
      content: {
        ...emailTemplates["password-reset"].defaults,
        heading: "Hi {{ name }} <script>alert(1)</script>",
      },
      name: 'Ana "<b>"',
      link,
      siteUrl: site,
    });
    expect(email.subject).toBe("Reset your Storybranch password");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Hi Ana &quot;&lt;b&gt;&quot; &lt;script&gt;");
    expect(email.html).toContain(`href="${link.replace(/&/g, "&amp;")}"`);
    expect(email.html).toContain(`src="${site}/email/logo.png"`);
    expect(email.text).toContain(`Choose a new password: ${link}`);
    expect(email.text).toContain("storybranch.com");
    // Plain text is never parsed as HTML; only the layout markup must not leak.
    expect(email.text).not.toMatch(/<(p|table|a) /);
  });

  it("greets an unnamed reader and refuses links that aren't web addresses", () => {
    const content = emailTemplates.welcome.defaults;
    expect(
      renderEmail({ content, name: null, link, siteUrl: site }).html,
    ).toContain("Welcome, wayfarer");
    expect(() =>
      renderEmail({
        content,
        name: null,
        link: "javascript:alert(1)",
        siteUrl: site,
      }),
    ).toThrow();
  });
});

describe("Admin email commands", () => {
  it("accepts each action with its fields and rejects the rest", () => {
    const content = emailTemplates.welcome.defaults;
    const key = "key-12345678";
    for (const command of [
      { action: "save", expectedRevision: 0, content },
      { action: "publish", expectedRevision: 3 },
      { action: "restore", expectedRevision: 1, version: 0 },
      { action: "discard", expectedRevision: 1 },
      { action: "test", content },
      { action: "rewrite", content, instruction: "Warmer, please" },
    ])
      expect(
        adminEmailCommandSchema.safeParse({ idempotencyKey: key, ...command })
          .success,
      ).toBe(true);
    for (const command of [
      { action: "publish" },
      {
        action: "save",
        expectedRevision: 0,
        content: { ...content, extra: 1 },
      },
      { action: "rewrite", content, instruction: "no" },
      { action: "delete", expectedRevision: 0 },
    ])
      expect(
        adminEmailCommandSchema.safeParse({ idempotencyKey: key, ...command })
          .success,
      ).toBe(false);
  });

  it("points previews and tests at links that never work", () => {
    expect(sampleEmailLink("https://x.test", "password-reset")).toBe(
      "https://x.test/account/action?mode=resetPassword&oobCode=example",
    );
    expect(sampleEmailLink("https://x.test", "welcome")).toBe(
      "https://x.test/discover",
    );
  });
});
