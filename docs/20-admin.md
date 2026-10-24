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
| Users | Every sign-up with email, display name, status, last sign-in and stored feature flags (search by email, name or ID) | Turn features on or off; disable or re-enable an account |
| Stories | Published stories with creator, current edition and Discover status | Hide a story from Discover or show it again |
| Activity | The latest 100 admin changes: who, what, to whom, when | Nothing |

## Rules

- **No self-lockout.** An admin cannot remove their own admin flag or disable their own account; another admin has to. So the API can never remove the last admin. (`pnpm features revoke` can, deliberately.)
- **Disabling** sets the profile `status` to `disabled`; the API refuses the account on its next request. Nothing is deleted, and enabling restores it.
- **Hiding a story** sets `hidden` on its `catalogue/{storyId}` entry: it leaves Discover, new playthroughs are refused, and dashboards stop recommending it. Players who already started keep their saves, which stay pinned to their edition, and still see it on their dashboard. Republishing keeps the flag. Immutable editions are never changed or deleted.
- **Every change** is idempotent by key (a retry returns the first result) and written to `adminAudit/{id}` with the actor's uid and email, in the same transaction as the change.

## API

All routes need the `admin` feature.

| Route | Purpose |
|---|---|
| `GET /api/admin/overview` | Counts for the Overview |
| `GET /api/admin/users` | Accounts (Firebase Auth joined with profiles) |
| `POST /api/admin/users/{uid}` | `{ idempotencyKey, features?: { [feature]: boolean }, status?: "active" \| "disabled" }` |
| `GET /api/admin/stories` | Catalogue entries with creator and hidden flag |
| `POST /api/admin/stories/{storyId}` | `{ idempotencyKey, hidden }` |
| `GET /api/admin/audit` | Latest 100 audit entries |
| `GET /api/admin/usage?days=7\|30\|90` | AI usage report (`AiUsageReport` in `packages/contracts/usage.ts`) |

## AI usage records

Every paid AI call adds to two server-only records with Firestore increments (`services/api/ai-usage.ts`): `aiUsage/{YYYY-MM-DD}` for the UTC day and `aiUsageUsers/{YYYY-MM-DD}_{uid}` for that user. Claude calls store requests, input, cache-write, cache-read and output tokens and refusals per feature and per model, because a declined request retried on a fallback model bills each step at its own model. Images store returned, refused and uncertain counts per quality tier. A failed write is logged and never fails the user's request. Nothing is recorded from before this release.

Estimated spend (`packages/domain/usage.ts`) multiplies the totals by list prices in `defaultAiPrices` (`packages/contracts/usage.ts`). Claude rates are Anthropic's published prices; image prices are unset, so images are counted but not priced, and the report says how many requests it could not price. Uncertain images are priced as billed. Estimates are not the bill: the Anthropic and OpenAI consoles are. The per-user report reads at most 5,000 user-day records; a much busier app needs monthly totals instead.

## Verification

Unit tests cover admin implying every feature and hidden stories on the dashboard. An emulator integration test covers member refusal on every route, feature changes, retries and key conflicts, the self-lockout rules, disabling and re-enabling, hiding (Discover, new starts refused, existing saves still play, dashboard kept but not recommended) and the audit log. Another records Claude usage (including a fallback step at its own model) and image outcomes for a new user and checks the report, the overview totals, the period validation and member refusal; unit tests cover the estimates and UTC day ranges. `scripts/admin-check.ts`, run in CI, drives the admin view as the local admin: navigation, overview, a feature toggle, locked self controls, hide and show, activity, the Usage tab (one bar per day, the period switch, a hover readout that leaves the chart in place), no horizontal overflow at 1024 and 390 px, and a member seeing neither the nav item nor the admin view.

## Site analytics

Page views go to Vercel Web Analytics (enabled on the Vercel project; the app loads it through `@vercel/analytics` in `apps/web/src/main.tsx`) and are viewed in Vercel's dashboard. It sets no cookies. Paths carrying private IDs are counted under one shared path before sending (`/play/[saveId]`, `/assets/edit/[assetId]`), and query strings and hashes are dropped (`apps/web/src/analytics.ts`). `vercel.json` keeps `/_vercel/*` out of the app's catch-all rewrite so the analytics script is served.

## Next

This is the first slice, to grow as needs come up: candidate additions are viewing a user's stories and saves, story moderation beyond hiding, and paid-plan entitlements.
