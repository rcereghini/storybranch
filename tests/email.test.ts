import { describe, expect, it } from "vitest";
import {
  emailContentSchema,
  emailTemplates,
  unknownPlaceholders,
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
