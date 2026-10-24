import { createHash, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { GameError } from "../../packages/contracts/index";
import {
  emailContentSchema,
  emailTemplates,
  passwordResetCommandSchema,
  type EmailContent,
  type EmailTemplateId,
} from "../../packages/contracts/email";
import { renderEmail } from "../../packages/email/render";
import { auth, config, db } from "./firebase";
import * as paths from "./paths";

// System emails go through SendGrid. Locally (emulator mode) nothing is sent:
// each email is only logged, unless a test installs a sender.
export const emailFrom =
  process.env.EMAIL_FROM ?? "storybranch@dotbluelabs.com";
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  category: string;
};
export type EmailSender = (message: EmailMessage) => Promise<void>;

const sendgrid: EmailSender = async (message) => {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: emailFrom, name: "Storybranch" },
      reply_to: { email: emailFrom, name: "Storybranch" },
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html },
      ],
      categories: [message.category],
      // Tracking would rewrite the one-time account links through SendGrid.
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 202)
    throw new Error(`SendGrid returned ${response.status}.`);
};
let override: EmailSender | null = null;
export const setEmailSender = (sender: EmailSender | null) => {
  override = sender;
};
function sender(): EmailSender | null {
  if (override) return override;
  return config.mode === "firebase" && process.env.SENDGRID_API_KEY
    ? sendgrid
    : null;
}

export function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (config.mode === "emulator") return "http://localhost:5173";
  return process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://www.storybranch.com";
}

// The published content, or the built-in default (version 0).
export async function templateContent(
  id: EmailTemplateId,
): Promise<{ version: number; content: EmailContent }> {
  const published = (await db.doc(`emailTemplates/${id}`).get()).data()
    ?.published;
  const parsed = emailContentSchema.safeParse(published?.content);
  return parsed.success && typeof published.version === "number"
    ? { version: published.version, content: parsed.data }
    : { version: 0, content: emailTemplates[id].defaults };
}

const logDays = 90;
async function log(entry: {
  template: EmailTemplateId;
  version: number;
  to: string;
  uid: string | null;
  status: "sent" | "failed" | "skipped";
  detail: string | null;
  test: boolean;
}) {
  const at = Date.now();
  await db
    .collection("emailLog")
    .doc(randomUUID())
    .set({
      ...entry,
      at,
      expireAt: Timestamp.fromMillis(at + logDays * 86400000),
    });
}

export const senderConfigured = () => sender() !== null;

// Renders and sends one system email and records it. Never throws: the
// account action that triggered it has already happened. An admin test
// passes its own (possibly unsaved) content.
export async function sendSystemEmail({
  template,
  to,
  uid,
  name,
  link,
  test,
}: {
  template: EmailTemplateId;
  to: string;
  uid: string | null;
  name: string | null;
  link: string;
  test?: { content: EmailContent };
}): Promise<"sent" | "failed" | "skipped"> {
  let version = 0;
  const entry = { template, to, uid, test: !!test };
  try {
    const current = test
      ? { version: -1, content: test.content }
      : await templateContent(template);
    version = current.version;
    const email = renderEmail({
      content: current.content,
      name,
      link,
      siteUrl: siteUrl(),
    });
    if (test) email.subject = `[Test] ${email.subject}`;
    const send = sender();
    if (!send) {
      await log({
        ...entry,
        version,
        status: "skipped",
        detail:
          config.mode === "emulator"
            ? "Emails are not sent locally."
            : "SendGrid is not configured.",
      });
      return "skipped";
    }
    await send({ to, ...email, category: test ? "test" : template });
    await log({ ...entry, version, status: "sent", detail: null });
    return "sent";
  } catch (error) {
    console.error("System email failed", template, error);
    await log({
      ...entry,
      version,
      status: "failed",
      detail: error instanceof Error ? error.message.slice(0, 300) : "Failed.",
    }).catch(() => {});
    return "failed";
  }
}

// Firebase's action link, pointed at our own branded page instead.
function actionLink(firebaseLink: string) {
  const source = new URL(firebaseLink).searchParams;
  const target = new URL(`${siteUrl()}/account/action`);
  target.searchParams.set("mode", source.get("mode") ?? "");
  target.searchParams.set("oobCode", source.get("oobCode") ?? "");
  return target.toString();
}

// A new profile: email-and-password accounts confirm their address; Google
// accounts (already verified) get a welcome.
export async function sendAccountEmail(uid: string) {
  try {
    const user = await auth.getUser(uid);
    if (!user.email) return;
    const password = user.providerData.some((p) => p.providerId === "password");
    if (password && !user.emailVerified)
      await sendSystemEmail({
        template: "verify-email",
        to: user.email,
        uid,
        name: user.displayName ?? null,
        link: actionLink(await auth.generateEmailVerificationLink(user.email)),
      });
    else
      await sendSystemEmail({
        template: "welcome",
        to: user.email,
        uid,
        name: user.displayName ?? null,
        link: `${siteUrl()}/discover`,
      });
  } catch (error) {
    console.error("Account email failed", error);
  }
}

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
// Fixed-window limit per key per hour, so the form can't be used to flood an
// inbox or probe for accounts.
export async function limit(
  key: string,
  max: number,
  message = "Too many reset requests. Please try again in an hour.",
) {
  const hour = Math.floor(Date.now() / 3600000);
  const ref = db.doc(`emailLimits/${digest(key)}-${hour}`);
  await db.runTransaction(async (tx) => {
    const count = (await tx.get(ref)).data()?.count ?? 0;
    if (count >= max) throw new GameError("VALIDATION_FAILED", message);
    tx.set(ref, {
      count: count + 1,
      expireAt: Timestamp.fromMillis((hour + 2) * 3600000),
    });
  });
}

// POST /api/account/password-reset, signed out. The reply is the same
// whether or not the account exists.
export async function passwordReset(request: Request) {
  const raw = await request.text();
  if (raw.length > 1024)
    throw new GameError("VALIDATION_FAILED", "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const { email } = passwordResetCommandSchema.parse(body);
  const address = email.toLowerCase();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  await limit(`reset-ip:${ip}`, 10);
  await limit(`reset-email:${address}`, 3);
  let user;
  try {
    user = await auth.getUserByEmail(address);
  } catch {
    return { ok: true };
  }
  const profile = (await db.doc(paths.user(user.uid)).get()).data();
  if (profile && profile.status !== "active") return { ok: true };
  // A failure here must look like success too, or it would reveal the account.
  try {
    await sendSystemEmail({
      template: "password-reset",
      to: user.email ?? address,
      uid: user.uid,
      name: user.displayName ?? null,
      link: actionLink(await auth.generatePasswordResetLink(address)),
    });
  } catch (error) {
    console.error("Password reset link failed", error);
  }
  return { ok: true };
}
