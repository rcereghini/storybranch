# Admin dashboard

`/admin` is where Storybranch admins manage accounts and stories. It appears in the main navigation only for accounts with the `admin` feature, and every admin route checks that flag on the server (`services/api/admin.ts`); the UI hiding it is a convenience, not the protection.

## Who is an admin

`admin` is one of the account feature flags on `users/{uid}.features` (see Account access in `15-shared-firebase-setup.md`). It implies every other feature. The first admins are set with the server credential:

```sh
pnpm features grant cjhardon@gmail.com admin
pnpm features grant rcereghini@gmail.com admin
```

The account must have signed up; if it has never opened the app, the command creates its profile first. After that, admins grant admin to others from the Users tab. Locally, the seeded `player` account is the admin and the other seeded accounts are members.

## Sections

| Section | What it shows | What it changes |
|---|---|---|
| Overview | Users, admins, disabled accounts, published and hidden stories, drafts, playthroughs, AI requests and estimated AI spend over 30 days | Nothing |
| Usage & spend | For the last 7, 30 or 90 UTC days: estimated spend, AI requests, images and refusals; requests per day; totals per feature (Copilot, writing help, images); the 20 heaviest users | Nothing |
| Analytics | For the last 30 or 90 UTC days: accounts, new sign-ups (and per day), accounts active in the last day, week and month, players in the period, and per story: players, finishers, completion rate, recent players and last played; plus a link to Vercel for page views | Nothing |
| Users | Sign-ups, newest sign-in first, 50 at a time: search by email, name or ID and filter by status or access, all on the server. Each opens a detail page: email and whether it's confirmed, sign-in methods, joined and last sign-in, access, daily limits and today's usage, published stories, drafts, playthroughs, 30-day AI usage and spend, recent emails and the admin changes made to it | Turn features on or off; disable or re-enable; set the account's own daily limits; reset today's usage |
| Stories | Published stories with creator, current edition and Discover status | Hide a story from Discover or show it again |
| Emails | Each system email with what is being sent, a live preview, version history and the email log | Edit, rewrite with AI, send a test to yourself, save a draft, publish, restore an earlier version or the default (see `22-system-emails.md`) |
| Settings | App-wide settings and who last changed them | Daily limits, AI switches, new-account access and the prices behind spend estimates (below) |
| Activity | The latest 100 admin changes: who, what, to whom, when | Nothing |

## Rules

- **No self-lockout.** An admin cannot remove their own admin flag or disable their own account; another admin has to. So the API can never remove the last admin. (`pnpm features revoke` can, deliberately.)
- **Disabling** sets the profile `status` to `disabled`, revokes the account's sessions and blocks Firebase sign-in, so it is signed out everywhere at once (live tokens are checked for revocation) and can't sign in or request a password reset. Enabling unblocks sign-in; they then sign in again. Nothing is deleted.
- **Own limits** are stored on the profile (`limits`, `accountLimitsSchema` in `packages/contracts/settings.ts`); a blank value uses the default in Settings, and 0 stops new requests. **Reset today** deletes that day's count for AI requests or images.
- **Hiding a story** sets `hidden` on its `catalogue/{storyId}` entry: it leaves Discover, new playthroughs are refused, and dashboards stop recommending it. Players who already started keep their saves, which stay pinned to their edition, and still see it on their dashboard. Republishing keeps the flag. Immutable editions are never changed or deleted.
- **Every change** is idempotent by key (a retry returns the first result) and written to `adminAudit/{id}` with the actor's uid and email, in the same transaction as the change.

## API

All routes need the `admin` feature.

| Route | Purpose |
|---|---|
| `GET /api/admin/overview` | Counts for the Overview |
| `GET /api/admin/users?q=&status=&feature=&cursor=` | One page of 50 accounts matching the search and filters, with the total (`AdminUsersPage`). Firebase Auth can't search, so the server reads the first 10,000 sign-ups and their profiles, keeps them for 30 seconds, and searches those; a larger app needs the email copied onto profiles for indexed search |
| `GET /api/admin/users/{uid}` | One account's detail page (`AdminUserDetail`) |
| `POST /api/admin/users/{uid}` | `{ idempotencyKey, features?: { [feature]: boolean }, status?: "active" | "disabled", limits?: { aiRequestsPerDay, imagesPerDay }, resetToday?: ["ai" | "images"] }` |
| `GET /api/admin/stories` | Catalogue entries with creator and hidden flag |
| `POST /api/admin/stories/{storyId}` | `{ idempotencyKey, hidden }` |
| `GET /api/admin/audit` | Latest 100 audit entries |
| `GET /api/admin/usage?days=7\|30\|90` | AI usage report (`AiUsageReport` in `packages/contracts/usage.ts`) |
| `GET /api/admin/analytics?days=30|90` | Site analytics (`SiteAnalytics` in `packages/contracts/analytics.ts`) |
| `GET /api/admin/emails` | Every system email with its draft, published version and history |
| `POST /api/admin/emails/{id}` | `{ idempotencyKey, action: save \| publish \| restore \| discard \| test \| rewrite, … }` |
| `GET /api/admin/email-log` | Latest 100 sent, failed or skipped emails |
| `GET /api/admin/settings` | The stored settings (read fresh), the defaults, revision and last change |
| `POST /api/admin/settings/app` | `{ idempotencyKey, expectedRevision, settings }`, the whole settings object |

## Settings

App-wide settings live in `settings/app` (`appSettingsSchema` and `defaultAppSettings` in `packages/contracts/settings.ts`; server in `services/api/settings.ts`):

| Setting | Default | Effect |
|---|---|---|
| AI requests per person per day | 100 | Copilot messages and Studio writing help together; 0 stops new requests |
| Images per person per day | 100 | Image generation, including comic panels; shown in the image generator |
| Copilot, Studio writing help, Image generation | On | Off hides the feature in the app (the profile's `features.copilot`, `writingHelp` and `features.generate`) and refuses its requests, for everyone including admins; account flags still decide who gets it when on |
| New accounts | Nothing | Flags a new live account starts with: publish, generate, copilot. Never admin. Existing accounts are unchanged; local emulator accounts always get every member feature |
| Prices | Claude list prices; images unset | Only for Usage & spend estimates. Claude per million tokens per model; images per image, blank meaning counted but not priced |

The server reads settings through a one-minute cache, so other instances apply a change within a minute. A missing record means the defaults; an invalid stored record is logged and the defaults are used, so a bad write can't take the app down. Saving replaces the whole object, is revision-checked (a stale tab gets a reload message), refuses a save that changes nothing, and writes an audit entry listing each changed setting with its before and after values. The editor shows the same list before saving and can restore the defaults.

## AI usage records

Every paid AI call adds to two server-only records with Firestore increments (`services/api/ai-usage.ts`): `aiUsage/{YYYY-MM-DD}` for the UTC day and `aiUsageUsers/{YYYY-MM-DD}_{uid}` for that user. Claude calls store requests, input, cache-write, cache-read and output tokens and refusals per feature and per model, because a declined request retried on a fallback model bills each step at its own model. Images store returned, refused and uncertain counts per quality tier. A failed write is logged and never fails the user's request. Nothing is recorded from before this release.

Estimated spend (`packages/domain/usage.ts`) multiplies the totals by the prices in Settings, which start as `defaultAiPrices` (`packages/contracts/usage.ts`). Claude rates start at Anthropic's published prices; image prices start unset, so images are counted but not priced until an admin enters them, and the report says how many requests it could not price. Uncertain images are priced as billed. Estimates are not the bill: the Anthropic and OpenAI consoles are. The per-user report reads at most 5,000 user-day records; a much busier app needs monthly totals instead.

## Verification

Unit tests cover admin implying every feature and hidden stories on the dashboard. An emulator integration test covers member refusal on every route, feature changes, retries and key conflicts, the self-lockout rules, disabling and re-enabling, hiding (Discover, new starts refused, existing saves still play, dashboard kept but not recommended) and the audit log. Another records Claude usage (including a fallback step at its own model) and image outcomes for a new user and checks the report, the overview totals, the period validation and member refusal; unit tests cover the estimates and UTC day ranges. `scripts/admin-check.ts`, run in CI, drives the admin view as the local admin: navigation, overview, a feature toggle, locked self controls, hide and show, activity, the Usage tab (one bar per day, the period switch, a hover readout that leaves the chart in place), no horizontal overflow at 1024 and 390 px, and a member seeing neither the nav item nor the admin view. A users test covers server search, status and access filters, page size, the detail page, own limits (invalid values refused; 0 stops Copilot), resetting today's count, and disabling (sessions revoked, sign-in blocked, listed as disabled) and enabling; the browser check also searches, filters, opens a member's page, sets and clears an own limit, and checks a phone-width layout.

## Site analytics

The Analytics tab is built on request from data the app already keeps, so it has history from before it existed (`services/api/analytics.ts`, counting in `packages/domain/analytics.ts`), and is kept for five minutes:

- **Sign-ups** are account creation times. **Active** uses Firebase's last session refresh for each account, which reflects use better than last sign-in because people stay signed in. Both come from the same account read as Users (the first 10,000 sign-ups).
- **Stories** come from every saved playthrough (`playerUid`, `storyId`, `status`, `updatedAt` only; up to 20,000, after which the page says the numbers are partial). Players and finishers count each account once per story; completion is finishers over players; "played in the period" means the save changed then. Saves don't record when they started, so starts per day aren't available; past the cap, per-day totals like AI usage would be the next step. Catalogue stories are listed even with no players, and other stories with saves, such as side quests, are listed after.
- **Page views** stay in Vercel (below); the tab links there.

Page views go to Vercel Web Analytics (enabled on the Vercel project; the app loads it through `@vercel/analytics` in `apps/web/src/main.tsx`) and are viewed in Vercel's dashboard. It sets no cookies. Paths carrying private IDs are counted under one shared path before sending (`/play/[saveId]`, `/assets/edit/[assetId]`), and query strings and hashes are dropped (`apps/web/src/analytics.ts`). `vercel.json` keeps `/_vercel/*` out of the app's catch-all rewrite so the analytics script is served.

## Next

This is the first slice, to grow as needs come up: candidate additions are viewing a user's stories and saves, story moderation beyond hiding, and paid-plan entitlements.
