# Player dashboard and profile

Signed-in players land on their dashboard at `/`. Signed-out visitors still see the landing view there, and everyone can browse the catalogue at `/discover` (the **Discover** nav item). Every story has a details view at `/s/<storyId>` with **Start a new journey**; the Endings collection links to `/s/<storyId>/ending/<storyNodeId>` (see [sharing](13-responsive-video-and-sharing.md)).

## Dashboard sections

| Section | Source |
| --- | --- |
| Profile header: banner, avatar, name, tagline, bio, favorite genres | `users/{uid}` |
| Continue your story: the latest active save as a spotlight, then up to three more | Saves, with StoryNode titles from each save's pinned edition |
| Your progress: totals and shared stats | Saves; profile stats |
| What you're working toward: each catalogue story's status and endings found | Saves plus each story's published edition |
| Recent activity | The last story-log events of the four most recently played saves |
| Creator corner: draft and published counts, latest drafts | The existing `GET /api/studio` listing |
| Recommended for you | Unplayed stories (favorite genres first), then finished stories with endings left |
| Endings collection | Distinct endings reached, most recent first |

Progress is derived from saves by the pure `summarizeDashboard` (`packages/domain/dashboard.ts`). It grants nothing: account XP, levels and validated achievements remain M5 (see `02-game-and-community-rules.md`). The summary covers the 100 most recent saves. Catalogue genres are free text, so `genreOf` matches them loosely to the fixed genre list; a story with an unmatched genre ("Mixed-StoryNode prototype") is still recommended as "New to you".

## Profile customization

`users/{uid}` holds these presentation fields, all edited through **Customize profile** (Identity, Look and Interests tabs) with a live preview in the dashboard header:

| Field | Values |
| --- | --- |
| `displayName` | 1–32 characters, no control characters |
| `tagline` | Up to 80 characters |
| `bio` | Up to 500 characters; line breaks allowed |
| `avatarId` | One of 8 built-in presets |
| `avatarTint` | `preset` (the avatar's own color) or an accent |
| `avatarFrame` | `circle`, `rounded`, `hexagon`, `diamond` |
| `bannerId` | `harbor`, `clockwork`, `storm`, `aurora`, `ember`, `grove` (CSS scenes, no image assets) |
| `accent` | `teal`, `violet`, `amber`, `rose`, `sky`, `lime`; themes the dashboard and app shell |
| `favoriteGenres` | Up to five distinct genres from `genreIds` |

Palettes are fixed rather than free-form colors so every combination stays readable on the dark theme. Profiles created earlier, or holding an invalid value, fall back to defaults without being rewritten. Stats, status and achievements remain server-owned: the update schema is strict and rejects any other field.

Profiles are private to their player. Public profile views would need reporting and moderation (`07-safety-and-operations.md`) and are not implemented; public creator profiles (`creatorProfiles/{uid}` in `05-data-and-api-contracts.md`) are separate.

## API

| Route | Result |
| --- | --- |
| `GET /api/profile` | The caller's `PlayerProfile` |
| `POST /api/profile` | Body `{ displayName, avatarId, ...optional customizations }`; omitted optional fields keep their stored values. Returns the updated profile. Setting the same values again is harmless, so no idempotency key is needed. |
| `GET /api/dashboard` | `{ profile, summary: DashboardSummary }` |

All routes require sign-in and only ever read or write the caller's own records. Unknown sub-paths return `NOT_FOUND`.

## Interface

The app shell (sticky header, pill navigation, account chip with a separate **Sign out**), dashboard, Discover (search, genre filters, story covers, status badges) and My adventures (grouped into In progress, Side quests and Finished) use `apps/web/src/hub.css`. Its rules are scoped to those areas, so the story player and Studio keep `style.css` and `scene-player.css` unchanged; the accent variable themes the shell only. Stories without shipped art get a generated cover (`StoryCover.tsx`). Loading uses reserved placeholders, never inserted banners.

## Verification

Unit tests (`tests/dashboard.test.ts`) cover summary derivation, recommendations, activity, distinct endings and profile validation. The emulator integration suite covers authentication, field allowlisting, partial updates, cross-player isolation and the dashboard reflecting a new save and its activity. All six browser checks (browser, StoryNodes, auth, studio, transitions, save-list) pass on freshly seeded data.
