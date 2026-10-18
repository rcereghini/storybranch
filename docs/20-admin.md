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
| Overview | Users, admins, disabled accounts, published and hidden stories, drafts, playthroughs | Nothing |
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

## Verification

Unit tests cover admin implying every feature and hidden stories on the dashboard. An emulator integration test covers member refusal on every route, feature changes, retries and key conflicts, the self-lockout rules, disabling and re-enabling, hiding (Discover, new starts refused, existing saves still play, dashboard kept but not recommended) and the audit log. `scripts/admin-check.ts`, run in CI, drives the page as the local admin: navigation, overview, a feature toggle, locked self controls, hide and show, activity, no horizontal overflow at 1024 and 390 px, and a member seeing neither the nav item nor the page.

## Next

This is the first slice, to grow as needs come up: candidate additions are viewing a user's stories and saves, Copilot and generation usage and spend, story moderation beyond hiding, and paid-plan entitlements.
