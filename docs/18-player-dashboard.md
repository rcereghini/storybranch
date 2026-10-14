# Player dashboard and profile

Signed-in players land on their dashboard at `/`. Signed-out visitors still see the landing page there, and everyone can browse the catalogue at `/discover` (the **Discover** nav item). Story detail routes (`/s/...`) are unchanged.

## What it shows

| Section | Source |
| --- | --- |
| Profile card: display name, avatar, shared stats | `playerProfiles/{uid}` |
| At a glance: stories started/finished, endings found, side quests, keys | Derived from the player's saves |
| Where you left off: up to four most recent active saves | Saves, with page titles from each save's pinned edition |
| What you're working toward: each catalogue story's status and endings found | Saves plus each story's published edition |
| Recent endings | Completed saves on ending pages |

Progress is derived from existing saves by the pure `summarizeDashboard` (`packages/domain/dashboard.ts`). It grants nothing: account XP, levels and validated achievements remain M5 (see `02-game-and-community-rules.md`). The summary covers the 100 most recent saves.

## Profile

`playerProfiles/{uid}` gains two presentation fields, `displayName` (1–32 characters, no control characters) and `avatarId` (one of the built-in presets in `packages/contracts/profile.ts`). Profiles created earlier have neither; the API falls back to the sign-in name (or "Player") and the Lantern avatar without writing them. Stats, status and achievements remain server-owned: the update schema is strict and rejects any other field.

Avatars are illustrated presets rendered from inline SVG (`apps/web/src/avatars.tsx`). There are no uploads, storage or image moderation. This profile is private to its player; public creator profiles (`creatorProfiles/{uid}` in `05-data-and-api-contracts.md`) are separate and not implemented.

## API

| Route | Result |
| --- | --- |
| `GET /api/profile` | The caller's `PlayerProfile` |
| `POST /api/profile` | Body `{ displayName, avatarId }`; returns the updated profile. Setting the same values again is harmless, so no idempotency key is needed. |
| `GET /api/dashboard` | `{ profile, summary: DashboardSummary }` |

All routes require sign-in and only ever read or write the caller's own records. Unknown sub-paths return `NOT_FOUND`.

## Verification

Unit tests (`tests/dashboard.test.ts`) cover summary derivation and profile validation; the emulator integration suite covers authentication, field allowlisting, cross-player isolation and the dashboard reflecting a new save. The existing browser checks pass with the new home page.
