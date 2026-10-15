# M0 / M1 local delivery record

Implemented October 11, 2026. These are reversible prototype assumptions, not production policy. The original planning documents remain the product specification.

October 12 update: [responsive video and sharing](13-responsive-video-and-sharing.md) supersedes the original below-video choice layout and single-rendition presentation. It adds a responsive overlay, portrait delivery and a standalone downloadable teaser while retaining v1 story graphs and saved progress. The current suite includes one additional media-contract test.

## Delivered

M0: strict TypeScript, React/Vite, pure domain/contracts boundaries, runtime validation, lockfile, Firebase emulator environment, restrictive rules, hosted function/rewrite structure (originally Netlify, now Vercel), generated metadata for `/s/glass-harbor` (including optional slugs) and `/u/storybranch`, and a CI workflow. Foundation type, schema, boundary and build checks passed before M1 implementation began. Generated HTML contains title and Open Graph description without JavaScript. Netlify was never deployed; production later moved to Vercel.

M1: public catalogue, email/password emulator login, The Glass Harbor, deterministic stat and key checks, two endings, persisted server-authorized choices, save/resume, append-only paginated story log, loading/error/offline/stale states, local video, poster, captions, and complete scene transcripts. The guard encounter uses authored choices. Combat is still M5.

Two small market side quests demonstrate independent child saves and return navigation. Both remain selectable, with one featured record separate from the graphs. This is fixture coverage of the isolation invariant, not delivery of M3 publication, permissions management, claims, nominations or trades.

## Prototype assumptions

- `prototype-1` ruleset; new character values are 5. A seeded progressed character has agility 8. Shared stats are copied at start, effective stats copied into a child, and no narrative keys/items are imported or merged. All local health begins at 100.
- Only seeded, active player profiles can play. Seeded role names are test identities, not role authorization. There is no account creation, reset-password, entitlement, wallet or purchase UI.
- Edition `v1` is materialized as a manifest and separate node documents. Seeding uses create-only transactions and a manifest hash; it refuses a changed fixture at the same ID. Production publishing and migration tools remain M2.
- Catalogue content is a curated one-story presentation backed by a seeded public availability check. Search, filtering, general creator libraries and dynamic catalogue merchandising remain M2.
- Each scene currently uses the same original silent harbor animation, explicitly labeled placeholder. The transcript changes per scene. No generated/live cinematic assets, external audio, or provider integration is implied.
- The market has a checkpoint marker in its published graph. Checkpoint persistence/restoration, combat, account XP and validated achievements remain M5. The ending milestone is local to the save.
- One featured fixture is seeded at the market; two branches share that location. There is no exclusive branching right, trading or live placement management.
- No offline command queue or service worker. A loaded transcript remains readable, and choices are disabled offline. Network failures preserve the request key for an explicit same-request retry in the current screen. Refresh resumes committed server state.
- Logs and saves are paginated; branch discovery is bounded to the two seeded fixtures (API cap 20). General community pagination belongs to M3. Save cursors capture timestamp plus ID; refresh is needed to see changes newer than the current page.

## Implemented API

All private endpoints require `Authorization: Bearer <Firebase ID token>`. The actor is never accepted in a payload. The API validates the active server-owned profile and save ownership independently of Security Rules.

| Method / path | Payload / response |
| --- | --- |
| GET `/api/catalogue?limit=20&cursor=...` | Public `{items,nextCursor}` |
| GET `/api/playthroughs?limit=20&cursor=...` | Owner-only saves, newest first |
| GET `/api/playthroughs/{id}` | `{save,node,branches,featuredId}` using the pinned edition |
| GET `/api/playthroughs/{id}/events?limit=20&cursor=...` | Owner-only ordered log; default 20, maximum 50 |
| POST `/api/playthroughs` | `{idempotencyKey,payload:{storyId,versionId?}}` → `{save}` |
| POST `/api/playthroughs/{id}/choices` | `{idempotencyKey,expectedRevision,payload:{choiceId}}` → `{save}` |
| POST `/api/playthroughs/{id}/branches` | `{idempotencyKey,expectedRevision,payload:{branchId}}` → child `{save}` |

Start is restricted to the root sample story. Branch launch checks the source location, source edition, parent revision and nesting policy. The parent is read, never written. Returning loads the actual current parent, not its launch-time snapshot.

Receipt identity is SHA-256 of actor, command kind and key. Canonical payload hash includes the resource path. A changed payload with the same key returns `IDEMPOTENCY_CONFLICT`; a replay returns the original saved result even after further progress. Receipt, save and event commit in one transaction. Availability and outcomes use pre-transition state; costs and effects commit atomically. Entry-effect IDs prevent loop rewards from repeating.

Errors use `{error:{code,message,correlationId}}`. Invalid schemas return 400, missing identity 401, unauthorized entities 403, missing resources 404, stale or reused commands 409, service failures 503. Stack traces and tokens are not returned. Lists have bounded page sizes. The domain evaluator supports all/any/not, stat/key/item conditions, bounded health/stats/items, key removal and local milestones. No story scripting or randomness exists.

## Verification evidence

- TypeScript check and production build passed.
- 7 foundation/domain checks passed: platform import boundary, malformed/deep conditions, agility 7/8 routes, correct/foreign pass keys, once-only loop reward, independent child state, malformed graphs, composed checks and stale input (some grouped in one test).
- 8 real-emulator integration tests passed: token/account/ownership denial, durable replay and payload conflict, competing transitions (one commit), saved-edition pinning, both child branches and unchanged parent, injected/locked command rejection, cursor bounds, and client rule enforcement. Expected permission-denied logs are evidence from negative rules assertions.
- Headless installed Chrome completed sign-in, actual video playback, a locked pass, courier grant, reload/resume, both side quests, return, simultaneous-tab stale state, offline blocking, both endings, log and responsive screenshots. Added coverage loses a response after commit then retries the same key, exercises missing-video transcript fallback/retry, and activates a choice by keyboard. No page exceptions or horizontal overflow at 1440px and 390px.
- Emulator export and actual process restart/import passed: all 28 saved states compared byte-equivalent after canonical serialization, with 62 receipts and 7 authentication identities preserved. Reseeding also preserved existing editions and profiles. Browser reload and separate-tab persistence are verified. `scripts/persistence-check.ts capture` and then `scripts/persistence-check.ts` support repeating this check across a restart; do not mutate data between capture/export/compare.

No physical phone, Safari/Firefox, screen reader, hosted routing/function, staging/production Firebase, production backup restore, Storage emulator, live generation, payments or hosted CI run was verified. Storage has deny-all rules and no enabled upload surface. Emulator tests do not prove production IAM, index deployment, rate limits or operational readiness.

## Next boundaries

M2: creator editor, upload/readiness pipeline, immutable publication service, public projection/catalogue generalization and real sharing metadata/assets. M3: community authorization receipts, eligibility, placement management and atomic swaps. M4: generation sandbox. M5: checkpoint restore, combat and validated progression. M6: commercial policy, security/operations gates and production deployment. None is represented as implemented by a demo badge or seeded role.
