import type { EmailContent } from "../contracts/email";

// The one branded layout every system email uses: table-based HTML with
// inline styles, so Gmail, Outlook and Apple Mail render it the same way.
// Content is plain text, escaped here; nothing an editor writes becomes HTML.
// Colors are the light design tokens (packages/design-tokens/tokens.css).
const brand = {
  primary: "#4b44d6",
  text: "#17171f",
  body: "#45455a",
  muted: "#5c5c6e",
  page: "#f2f2f7",
  card: "#ffffff",
  border: "#e4e4ec",
  font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

export type EmailRender = { subject: string; html: string; text: string };

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// The name falls back to the word the sign-in form greets everyone with.
const fill = (text: string, name: string | null) =>
  text.replace(/\{\{\s*name\s*\}\}/g, name?.trim() || "wayfarer");

export function renderEmail({
  content,
  name,
  link,
  siteUrl,
}: {
  content: EmailContent;
  name: string | null;
  // Where the button goes; supplied by the server, never by an editor.
  link: string;
  siteUrl: string;
}): EmailRender {
  const url = new URL(link);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Email links must be web addresses.");
  const t = (text: string) => fill(text, name);
  const h = (text: string) => escape(t(text));
  const site = siteUrl.replace(/\/$/, "");
  const host = new URL(site).host.replace(/^www\./, "");
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font:16px/1.6 ${brand.font};color:${brand.body};">${h(p)}</p>`,
    )
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${h(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${h(content.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;">
<a href="${escape(site)}" style="text-decoration:none;"><img src="${escape(site)}/email/logo.png" width="208" height="42" alt="storybranch" style="display:block;border:0;font:700 24px/42px ${brand.font};color:${brand.text};text-decoration:none;"></a>
</td></tr>
<tr><td style="background:${brand.card};border:1px solid ${brand.border};border-radius:16px;padding:40px 32px;">
<h1 style="margin:0 0 24px;font:700 26px/1.25 ${brand.font};color:${brand.text};">${h(content.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
<tr><td style="border-radius:10px;background:${brand.primary};">
<a href="${escape(link)}" style="display:inline-block;padding:14px 24px;font:600 16px/1 ${brand.font};color:#ffffff;text-decoration:none;border-radius:10px;">${h(content.buttonLabel)}</a>
</td></tr>
</table>
<p style="margin:0 0 8px;font:13px/1.5 ${brand.font};color:${brand.muted};">If the button doesn't work, copy this link into your browser:<br><a href="${escape(link)}" style="color:${brand.primary};word-break:break-all;">${escape(link)}</a></p>
${content.footnote ? `<p style="margin:16px 0 0;font:13px/1.5 ${brand.font};color:${brand.muted};">${h(content.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:24px 8px 0;font:12px/1.5 ${brand.font};color:${brand.muted};">
Storybranch · Play and create branching stories · <a href="${escape(site)}" style="color:${brand.muted};">${escape(host)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    t(content.heading),
    "",
    ...content.paragraphs.flatMap((p) => [t(p), ""]),
    `${t(content.buttonLabel)}: ${link}`,
    ...(content.footnote ? ["", t(content.footnote)] : []),
    "",
    "--",
    `Storybranch · Play and create branching stories · ${host}`,
  ].join("\n");
  return { subject: t(content.subject), html, text };
}
