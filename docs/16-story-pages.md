# Story and Page model

## Required contract for every page type

This is a requirement for all current and future types, including RPG turn-based battles. A page type is a child renderer of `Page`, never a parallel player architecture. It must declare **Input → Page type → Completion event → Output(s)**. A page must lead onward or deliberately close its branch; an unexplained dead end is invalid.

| Authoring contract | Completion event | Logical outputs |
| --- | --- | --- |
| `nextPage, text → Text` | Next button click | One: Next page |
| `nextPage, videoUrl, videoAdvance → Video` | `auto` (default): video finished OR Next; `continue`: explicit Continue only | One: Next page; all triggers use the same server command |
| `text/videoUrl, options[A,B,C] → Text/Video with Options` | Available option chosen | Multiple authored outputs; only the chosen A/B/C is followed |
| `range, passPage, failPage → Dice Roll` | Roll persists a result; a separate Next button click confirms it | Two: Pass or Fail, selected from the stored result |
| `text, results[score → resultPage] → Reveal` | Reveal button click | Two to twelve results; the server follows the result with the highest score, a tie going to the first listed |
| Future battle configuration → RPG turn-based battle | Server-validated battle completion, then the type's documented confirmation event | Declared outcomes such as Win/Loss, using the same routing lifecycle |

Concrete storage mapping: `text` is `transcript`, `videoUrl` is `video` (a shipped `/media/...` clip or `asset:<assetId>` for an uploaded clip), and `nextPage` is the one direct choice's `route.targetPageId`. Options are `choices` with conditions and routes. Dice range is 1–`sides`; `target` defines passing values, and `success.targetPageId`/`failure.targetPageId` are Pass/Fail. A reveal's results are its one choice's `outcome.results`, each a namespaced `scoreId` and a route. These aliases describe authoring intent, not duplicate persisted fields.

All types receive their authored configuration plus `PageInput` (page, story save context, user projection). `PageOutput` is an intent (`choiceId`, optionally `roll`/`continue`), not permission for the browser to set a result or destination. `Page` owns common output controls and dispatch; the pure domain engine and API select/persist the resulting route. Available options may depend on stats, keys/items or the latest persisted roll. Future battle outcomes must join these same authoritative condition/effect contracts.

## Completion and branch closure

Roll feedback occupies reserved space in the center of its dice page, replacing the die display without resizing the page. It remains visible after reload while awaiting Next, and disappears on leaving that page; the persisted result remains available to conditions and the story log. Transient player notifications overlay the layout rather than pushing the main content down.

App loading uses a fixed, centered overlay for catalogue/start/initial player requests. It does not occupy document space or intercept navigation. An already loaded player keeps its existing frame during transitions, with screen-reader loading status only. Future loading indicators must overlay content or occupy reserved space where that content belongs, never insert a banner above it.

A normal output moves to a page in the current pinned edition. An ending marks the current save completed and closes that branch. The common completion UI offers replay, return to the parent when present, or other catalogue stories. Selecting another story starts a separate save/context; rewards and local keys do not silently transfer. Recommendations currently use the other catalogue entries, not a personalization service. Authored direct cross-story routes are not implemented; the completion shell currently owns cross-story handoff.

Terminal pages have no *in-story* choices, but still have the common completion outputs. A future type must document all possible exits (including failure/cancel where relevant), use the shared wrapper, reject invalid output shapes and prove reload/retry behavior. This rule is also recorded in root `AGENTS.md` for future implementation work.

Stories own a versioned graph of page **placements**, with an `entryPageId`. Reusable page content lives independently in the page library. Each placement pins a content snapshot using optional `sourcePage: {id, revision}` and adds its own entry effects, conditions, costs and output routing. Routes reference placement `targetPageId`; saves persist placement `pageId`. These contracts and all routing/condition rules live in platform-independent TypeScript.

## Independent pages and assets

Video generation (`/assets/generate`) and video editing (`/assets/edit/{assetId}`) are asset-authoring tools, not new story page types or alternative playback renderers. Their outputs are independent private library assets; creators explicitly select those assets in page placements. Both `video` and `video-options` continue to share the retained `ScenePlayer` child of `Page`, with completion callbacks and output children supplying their different behavior. Generated media never changes an edition, route, or save.

Creator Studio's branching timeline is an authoring view of page placements, not a player or a new page type. It edits the existing choice route fields, including individual dice/check Pass/Fail and reveal result routes, while preserving effects and conditions. Optional draft-only `pagePositions` maps placement IDs to bounded finite canvas coordinates (0–50,000; at most 80 entries). It is persisted with draft revisions and excluded from immutable published manifests and saves. Moving a card cannot change playback order; only output connections do. The existing domain/publication validation and shared Story/Page runtime remain authoritative.

`PageContent` declares title, transcript, text/video type, optional video/photo asset references, optional video advance mode, and named output slots (ID, label, hint). It has no story identity, destination, condition, effect or user state. The initial reusable library supports Text, Text with Options, Video and Video with Options; dice/reveal remain story placements until their reusable configuration and binding contracts are defined. `placePage` creates independent output bindings for each story. Editing one placement never changes another placement or a published edition. Content edits to a linked page must be saved as a new library revision before publication; routes can change independently. The server checks linked content against its owned immutable revision before publishing.

`POST /api/pages/{id}` saves a private immutable revision with optimistic concurrency and an idempotency receipt. `GET /api/pages` lists the current creator's latest revisions with cursor pagination. `POST /api/pages/{id}/share` explicitly publishes the specified revision and its referenced assets under the creator publishing policy. `GET /api/shared-pages/{id}/{revision}` is public only after sharing; no private draft, player or save state is returned. `/p/{id}/{revision}` is an isolated, disposable preview using the shared Story/Page lifecycle. Its output slots close the preview, with Replay and Discover exits; it does not claim to follow a particular story's routes or award progress. Real story play remains server-authoritative. Sharing is currently permanent for that revision; dynamic social preview metadata and revocation are not implemented.

Assets (uploaded or generated videos and photos) are stored per creator at `users/{uid}/clips/{assetId}`, with the file at the same path in Storage. Video and photo references may be reused across any owned pages. JPEG, PNG and WebP photos are capped at 10 MB, and use `image: "asset:<id>"`; videos retain the MP4/WebM 100 MB / 60-second limits. Photo signatures, declared MIME and byte lengths are checked by the server; image duration is zero. Photos render in reading pages and as video posters. Storage rules accept only owner-created pending uploads with matching size/type. Publishing and page sharing validate asset ownership, readiness and media kind, and record each used file in the edition or shared page revision so playback never reads the creator's private records. SVG and arbitrary external media URLs are not supported.

The React `Story` provider receives the story identity, authoritative save context, and a `StoryUser` projection: identity, account stats, achievements and save spots. The current API includes the active save spot; the catalogue separately loads the player's other journeys. These are explicit application fields, not a raw Firebase user or credentials. Account stats are snapshotted at story start; local keys, items, health, milestones and roll results belong to that story instance. Account achievement progression is still a later feature; an absent list is empty rather than invented.

Every renderer is wrapped by `Page`. It reads the Story context and emits a typed `PageOutput` containing a choice ID. The server resolves the authored output, validates conditions/costs and persists the destination. Clients never send a trusted destination, dice value or user stats. `PageInput` documents the portable page/context/user input shape.

| Page type | Input and presentation | Outputs |
| --- | --- | --- |
| `text` | Narrative text and story context | One unconditional Next; zero at an ending |
| `text-options` | Text and conditional choices | One selected available output |
| `video` | Local video, captions and transcript | One unconditional Next; zero at an ending |
| `video-options` | Video and conditional choices | One selected available output |
| `dice` | Sides, target, context | Roll stores/displays value; Next follows Pass/Fail |
| `reveal` | Text and a list of results, each a score and an ending page | Reveal follows the highest-scoring result |

All six types use the same Page parent, output controls, offline/busy handling, Story context and server command path. Linear videos default to automatic advancement on completion or Next. `videoAdvance: "continue"` waits at the final frame for Continue; this field is rejected on other types. Option videos always wait for an explicit choice. The player pauses and hides the retained video element during text/dice pages, preserving playback authorization for a later video. One deterministic next video may preload unless the browser requests data saving; preload never commits a destination. The current frame remains during API/media loading, and reading pages use a short entrance transition that respects reduced motion. The player fills the viewport; native fullscreen includes its controls. Shared Button/Panel components use Tailwind utilities with existing custom theme tokens; older app surfaces retain their CSS pending gradual migration. Add a future battle renderer and validated battle outcome to this contract when implementing combat, not a simulated client-authoritative win button.

Prototype dice default: uniform integer 1–N, pass on value >= target. The API injects Node crypto randomness into the pure transition function. A draw is reused during Firestore transaction retries; the existing idempotency receipt preserves the committed result for network retries. Roll increments the save revision and records `lastRoll` with `pending: true` while staying on the dice page. Rerolling that pending result is rejected. Next consumes the persisted outcome and clears pending while moving onward. Both steps are idempotent commands; reload between them preserves the result. `lastRoll` and the story event persist the result. Authored routes may award story-specific keys; later conditions can inspect those keys or the most recent roll from a named page (`kind: roll`). Older roll history remains in the log; only the most recent roll is available directly in conditions.

## Quizzes: scores and the reveal page

A personality quiz is ordinary pages. Each answer on a Text or Video with Options page carries a `score` effect (`{id, kind: "score", scoreId, delta}`) that adds points toward one result. Scores are namespaced to the story like keys and items, live in the save's `scores` map (0–999 each), and are never shown to the player. Saves made before quizzes existed have no `scores` map and count every score as zero.

The `reveal` page has exactly one choice whose outcome is `{kind: "reveal", results}`, with no condition or cost. Clicking it sends only the choice ID; the server reads the persisted scores and moves to the result with the most points, a tie going to the result listed first. Validation rejects a reveal outcome on any other page type, a repeated `scoreId`, fewer than two results, or a result that is not an ending, because a result closes the quiz and is what the player shares.

A result page is any ending a reveal can lead to (`isResultPage` in the domain). The player API returns `result: true` on those pages. The page then reads **YOUR RESULT**, the completion shell offers **Take the quiz again**, and the share panel becomes **Share your result** ("I got *The Keeper* in …"). Link previews for seeded quizzes use the same wording, and a shared result link tells the visitor a friend got that result.

## Mock stories

Creators can now author these same six types through [Creator Studio](17-creator-studio.md). Private preview uses the shared Story/Page renderers and a disposable engine state; published play remains server-authoritative. Publication freezes a new edition without changing the input/output contracts below.

- **The Clockwork Door:** linear text → key/stat-gated text options → linear video → text ending. Includes an alternate early ending.
- **The Storm Signal:** video options → d20 check → pass/fail destinations; a saved success key unlocks the rescue route.
- **The Glass Harbor:** explicit video page types, including its separate side-quest stories.
- **What Kind of Explorer Are You?:** a personality quiz. Four text-options questions score four results, a reveal page picks one, and the results are three text endings and one video ending.

Media is still animated placeholder footage with synthesized audio. New stories reuse the existing distinct clips.

## Prototype format change

The node-only model and implicit video fallback were removed. Fixtures publish `pages-v1`; the seeder promotes only known `v1` sample catalogue/branch/published pointers. It never mutates an existing immutable version or deletes accounts/saves. Pre-page saves are unsupported and show a start-new-journey message; no compatibility renderer is retained. Later page editions remain version pinned. Reseeding identical versions is safe.

Run `pnpm seed` with emulators, then `pnpm dev:emulator`. For the shared project use `pnpm seed:firebase` with the configured server credential. Run `pnpm check`, `pnpm test:integration`, `pnpm test:pages` and `pnpm test:browser` against emulators. The page browser check covers desktop/mobile, mixed-media navigation and dice persistence after reload. Domain tests force both roll outcomes; API tests reject forged values and replay the same receipt.

Verification: TypeScript/build and 23 unit/domain/fixture tests passed; 10 emulator integration tests passed (including roll idempotency, injected-value rejection, reroll rejection, saved-result continuation). Chrome exercised all five types at 1440px/390px, natural video completion and explicit Next, recommendation handoff, dice-result reload before Next, and the existing seven-width Glass Harbor flow including side quests, retry/stale/offline and both endings. Physical Safari/iPhone and real hosted authenticated flows remain unverified. Combat and achievement progression remain deferred.

Quiz verification (October 15, 2026): TypeScript, build and 40 unit tests passed, including tie-breaking, saves without scores, reveal validation and result link previews. 13 emulator integration tests passed; the new one plays the quiz through the API, rejects a client-supplied destination and checks the persisted scores and `result` flag. `pnpm test:quiz` passed at 1440px and 390px, and the browser, pages, Studio, transition and auth checks passed on freshly seeded data. Not yet checked: the quiz on the live site and real link unfurls of a result.

Video/page-library verification (October 15, 2026): `pnpm check` passed (49 unit tests, TypeScript and production build), and all 17 emulator integration tests passed. `test:video-pages` covers library save/share/placement, anonymous isolated playback, Continue mode at natural completion, video-to-options navigation, explicit option selection, and photo uploads through Assets at 1440px and 390px. `test:studio`, `test:pages`, `test:transitions` and the seven-width `test:browser` regression passed. Screenshots were inspected at desktop/mobile sizes. Existing published editions and user saves are not migrated. Real-device Safari, hosted uploads/sharing, social link unfurls, transcoding and seamless decoder-level playback remain unverified or unimplemented. Deploy the updated Storage rules before enabling hosted photo uploads. The production build retains its existing large-chunk warning.
