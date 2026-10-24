# System emails

Storybranch sends a small set of account emails through SendGrid. They are transactional only: no newsletters or marketing, which would need consent and unsubscribe handling first.

## The emails

| Template | Sent when | The button opens |
|---|---|---|
| `verify-email` (Confirm email) | An account created with email and password makes its first request | Our `/account/action` page, which confirms the address |
| `welcome` (Welcome) | An account without a password, such as Google sign-in, makes its first request | Discover |
| `password-reset` (Password reset) | Someone uses "Forgot password?" in the sign-in dialog | Our `/account/action` page, where they choose a new password |

Each is sent once, when `ensurePlayerProfile` creates the profile (`services/api/handler.ts`); seeded and admin-created profiles get none. Definitions and default wording live in `packages/contracts/email.ts`.

## Branding and content

Every email uses one fixed layout (`packages/email/render.ts`): the logo (`apps/web/public/email/logo.png`, regenerated with `scripts/generate-email-logo.ts`), a white card on the light page colour, the brand primary button, a copy-the-link fallback and a footer. It is table-based HTML with inline styles so Gmail, Outlook and Apple Mail agree, and every email also has a plain-text version.

Content is structured plain text: subject, preview line, heading, one to six paragraphs, button label and small print. The only placeholder is `{{name}}` (the account's display name, or "wayfarer"); any other `{{…}}` is rejected. Everything is escaped, so content can't add HTML, and the button link always comes from the server. This is what lets admins and AI edit wording without being able to break the brand or the layout.

## Sending

`services/api/email.ts` sends from `storybranch@dotbluelabs.com` (override with `EMAIL_FROM`) with the same reply-to, as "Storybranch". It needs `SENDGRID_API_KEY` on the Vercel deployment, and the sending domain authenticated in SendGrid (Settings → Sender Authentication → Domain Authentication) so mail isn't marked as spam. Click and open tracking are off, because SendGrid would otherwise rewrite the one-time account links. Locally (emulator mode) nothing is sent; each email is logged with status `skipped`.

Sending never fails the action that triggered it: errors are logged to the runtime log and the email log.

## Account links

Firebase generates each verification and reset code (`generateEmailVerificationLink`, `generatePasswordResetLink`). The server keeps only the code and points the link at our own page, `/account/action?mode=…&oobCode=…` (`apps/web/src/AccountAction.tsx`), instead of Firebase's hosted page. The page reads the code once, removes it from the address bar, and confirms the email or sets the new password with the Firebase client SDK. An expired or used link says so and offers sign-in. Analytics never sees the code, because query strings are dropped before sending.

## Password reset requests

`POST /api/account/password-reset` with `{ email }` works signed out. It always answers `{ ok: true }`, whether or not the account exists, so it can't be used to discover accounts; disabled accounts get no email. It allows 3 requests per address and 10 per IP address per hour (`emailLimits`).

## Records

- `emailLog/{id}`: template, template version (0 = built-in default), recipient address and uid, status (`sent`, `failed`, `skipped`), a short failure reason and time. Never the link. Deleted 90 days later by a TTL policy on `expireAt`.
- `emailLimits/{hash}-{hour}`: request counts, deleted by TTL after the hour.
- `emailTemplates/{id}`: published content and version, written by the admin editor (next phase). Until then every email uses the built-in default.

The TTL policies are in `firebase/firestore.indexes.json`; deploy them with the Firestore rules (see `15-shared-firebase-setup.md`).

## Verification

Unit tests (`tests/email.test.ts`) cover the built-in content, the placeholder rule, escaping, the name fallback, the plain-text version and refusing non-web links. Integration tests on the emulator cover the reset reply for known and unknown accounts, the reset link pointing at our page, the per-address and per-IP limits, the log (without the link) and skipped local sends, plus the confirmation email for a new password account, the welcome for an account without a password, and that neither repeats. `scripts/email-check.ts`, run in CI, drives "Forgot password?" in the sign-in dialog and the account page: the code leaves the address bar, mismatched passwords are caught, the new password signs in, a used link explains itself, and the page fits a 390 px screen. No email is sent through SendGrid in tests.

## Next

The admin Emails tab: edit and preview each template, send a test, rewrite with AI, publish versions and read the email log.
