import { z } from "zod";

// System emails. Admins (and AI) edit only this structured content; the
// branded layout around it is fixed (packages/email), so no edit can break
// the brand or the HTML.
export const emailTemplateIds = [
  "verify-email",
  "welcome",
  "password-reset",
] as const;
export const emailTemplateId = z.enum(emailTemplateIds);
export type EmailTemplateId = z.infer<typeof emailTemplateId>;

// Text may use these; anything else in double braces is rejected.
export const emailPlaceholders = ["name"] as const;
const placeholder = /\{\{\s*([^}]*?)\s*\}\}/g;
export function unknownPlaceholders(text: string) {
  return [...text.matchAll(placeholder)]
    .map((m) => m[1])
    .filter((name) => !(emailPlaceholders as readonly string[]).includes(name));
}

const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((text) => !unknownPlaceholders(text).length, {
      message: `Only these placeholders are allowed: ${emailPlaceholders.map((p) => `{{${p}}}`).join(", ")}.`,
    });
export const emailContentSchema = z
  .object({
    subject: line(120).pipe(z.string().min(1)),
    // The preview line inboxes show after the subject.
    preheader: line(140),
    heading: line(120).pipe(z.string().min(1)),
    paragraphs: z
      .array(line(600).pipe(z.string().min(1)))
      .min(1)
      .max(6),
    // The button opens the link the system supplies for this email.
    buttonLabel: line(40).pipe(z.string().min(1)),
    // Small print under the button, such as what to do if this was not you.
    footnote: line(300),
  })
  .strict();
export type EmailContent = z.infer<typeof emailContentSchema>;

export type EmailTemplateDefinition = {
  id: EmailTemplateId;
  label: string;
  // When it is sent, for the admin list.
  sentWhen: string;
  // What the button opens.
  link: string;
  defaults: EmailContent;
};
export const emailTemplates: Record<EmailTemplateId, EmailTemplateDefinition> =
  {
    "verify-email": {
      id: "verify-email",
      label: "Confirm email",
      sentWhen: "Someone creates an account with an email and password.",
      link: "Confirms their email address, then opens Storybranch.",
      defaults: {
        subject: "Confirm your email for Storybranch",
        preheader: "One click and your account is ready.",
        heading: "Welcome to Storybranch, {{name}}",
        paragraphs: [
          "Thanks for joining. Storybranch is where you play branching stories, make choices that matter, and create stories of your own.",
          "Please confirm this is your email address so we can keep your account secure and help you get back in if you ever lose your password.",
        ],
        buttonLabel: "Confirm my email",
        footnote:
          "If you didn't create a Storybranch account, you can ignore this email.",
      },
    },
    welcome: {
      id: "welcome",
      label: "Welcome",
      sentWhen: "Someone creates an account with Google.",
      link: "Opens Discover.",
      defaults: {
        subject: "Welcome to Storybranch",
        preheader: "Your first story is waiting.",
        heading: "Welcome, {{name}}",
        paragraphs: [
          "Your account is ready. Storybranch is where you play branching stories, make choices that matter, and create stories of your own.",
          "Start with a story from Discover. Your progress saves as you go, so you can pick up right where you left off.",
        ],
        buttonLabel: "Find a story",
        footnote:
          "You're receiving this because you just created a Storybranch account.",
      },
    },
    "password-reset": {
      id: "password-reset",
      label: "Password reset",
      sentWhen: "Someone asks to reset their password from the sign-in form.",
      link: "Opens a page to choose a new password.",
      defaults: {
        subject: "Reset your Storybranch password",
        preheader: "Choose a new password in a few seconds.",
        heading: "Reset your password",
        paragraphs: [
          "Hi {{name}}, we received a request to reset the password for your Storybranch account.",
          "Use the button below to choose a new one. Your stories and progress stay exactly as they are.",
        ],
        buttonLabel: "Choose a new password",
        footnote:
          "This link expires in 1 hour. If you didn't ask to reset your password, you can ignore this email; your password won't change.",
      },
    },
  };

// Each email sent, for the admin log. Entries expire after 90 days.
export type EmailLogEntry = {
  id: string;
  template: EmailTemplateId | "test";
  // 0 is the built-in default content.
  version: number;
  to: string;
  uid: string | null;
  status: "sent" | "failed" | "skipped";
  // Why it failed or was skipped (never the link).
  detail: string | null;
  at: number;
};

export const passwordResetCommandSchema = z
  .object({ email: z.string().trim().email().max(254) })
  .strict();
