# Story and Page model

## Required contract for every page type

This is a requirement for all current and future types, including RPG turn-based battles. A page type is a child renderer of `Page`, never a parallel player architecture. It must declare **Input → Page type → Completion event → Output(s)**. A page must lead onward or deliberately close its branch; an unexplained dead end is invalid.

| Authoring contract | Completion event | Logical outputs |
| --- | --- | --- |
| `nextPage, text → Text` | Next button click | One: Next page |
| `nextPage, videoUrl → Video` | Video finished OR Next button click | One: Next page; both triggers use the same command |
| `text/videoUrl, options[A,B,C] → Text/Video with Options` | Available option chosen | Multiple authored outputs; only the chosen A/B/C is followed |
| `range, passPage, failPage → Dice Roll` | Roll persists a result; a separate Next button click confirms it | Two: Pass or Fail, selected from the stored result |
| Future battle configuration → RPG turn-based battle | Server-validated battle completion, then the type's documented confirmation event | Declared outcomes such as Win/Loss, using the same routing lifecycle |

Concrete storage mapping: `text` is `transcript`, `videoUrl` is `video`, and `nextPage` is the one direct choice's `route.targetPageId`. Options are `choices` with conditions and routes. Dice range is 1–`sides`; `target` defines passing values, and `success.targetPageId`/`failure.targetPageId` are Pass/Fail. These aliases describe authoring intent, not duplicate persisted fields.

All types receive their authored configuration plus `PageInput` (page, story save context, user projection). `PageOutput` is an intent (`choiceId`, optionally `roll`/`continue`), not permission for the browser to set a result or destination. `Page` owns common output controls and dispatch; the pure domain engine and API select/persist the resulting route. Available options may depend on stats, keys/items or the latest persisted roll. Future battle outcomes must join these same authoritative condition/effect contracts.

## Completion and branch closure

Roll feedback occupies reserved space in the center of its dice page, replacing the die display without resizing the page. It remains visible after reload while awaiting Next, and disappears on leaving that page; the persisted result remains available to conditions and the story log. Transient player notifications overlay the layout rather than pushing the main content down.

App loading uses a fixed, centered overlay for catalogue/start/initial player requests. It does not occupy document space or intercept navigation. An already loaded player keeps its existing frame during transitions, with screen-reader loading status only. Future loading indicators must overlay content or occupy reserved space where that content belongs, never insert a banner above it.

A normal output moves to a page in the current pinned edition. An ending marks the current save completed and closes that branch. The common completion UI offers replay, return to the parent when present, or other catalogue stories. Selecting another story starts a separate save/context; rewards and local keys do not silently transfer. Recommendations currently use the other catalogue entries, not a personalization service. Authored direct cross-story routes are not implemented; the completion shell currently owns cross-story handoff.

Terminal pages have no *in-story* choices, but still have the common completion outputs. A future type must document all possible exits (including failure/cancel where relevant), use the shared wrapper, reject invalid output shapes and prove reload/retry behavior. This rule is also recorded in root `AGENTS.md` for future implementation work.

Stories own a versioned graph of `pages`, with an `entryPageId`. Every page has a required `pageType`, narrative content, entry effects and declared outputs (`choices`). Routes reference `targetPageId`; saves persist `pageId`. These contracts and all routing/condition rules live in platform-independent TypeScript.

The React `Story` provider receives the story identity, authoritative save context, and a `StoryUser` projection: identity, account stats, achievements and save spots. The current API includes the active save spot; the catalogue separately loads the player's other journeys. These are explicit application fields, not a raw Firebase user or credentials. Account stats are snapshotted at story start; local keys, items, health, milestones and roll results belong to that story instance. Account achievement progression is still a later feature; an absent list is empty rather than invented.

Every renderer is wrapped by `Page`. It reads the Story context and emits a typed `PageOutput` containing a choice ID. The server resolves the authored output, validates conditions/costs and persists the destination. Clients never send a trusted destination, dice value or user stats. `PageInput` documents the portable page/context/user input shape.

| Page type | Input and presentation | Outputs |
| --- | --- | --- |
| `text` | Narrative text and story context | One unconditional Next; zero at an ending |
| `text-options` | Text and conditional choices | One selected available output |
| `video` | Local video, captions and transcript | One unconditional Next; zero at an ending |
| `video-options` | Video and conditional choices | One selected available output |
| `dice` | Sides, target, context | Roll stores/displays value; Next follows Pass/Fail |

All five types use the same Page parent, output controls, offline/busy handling, Story context and server command path. Linear video pages advance on completion or Next; option videos wait for a choice. The player pauses and hides the retained video element during text/dice pages, preserving playback authorization for a later video. Add a future battle renderer and validated battle outcome to this contract when implementing combat, not a simulated client-authoritative win button.

Prototype dice default: uniform integer 1–N, pass on value >= target. The API injects Node crypto randomness into the pure transition function. A draw is reused during Firestore transaction retries; the existing idempotency receipt preserves the committed result for network retries. Roll increments the save revision and records `lastRoll` with `pending: true` while staying on the dice page. Rerolling that pending result is rejected. Next consumes the persisted outcome and clears pending while moving onward. Both steps are idempotent commands; reload between them preserves the result. `lastRoll` and the story event persist the result. Authored routes may award story-specific keys; later conditions can inspect those keys or the most recent roll from a named page (`kind: roll`). Older roll history remains in the log; only the most recent roll is available directly in conditions.

## Mock stories

- **The Clockwork Door:** linear text → key/stat-gated text options → linear video → text ending. Includes an alternate early ending.
- **The Storm Signal:** video options → d20 check → pass/fail destinations; a saved success key unlocks the rescue route.
- **The Glass Harbor:** explicit video page types, including its separate side-quest stories.

Media is still animated placeholder footage with synthesized audio. New stories reuse the existing distinct clips.

## Prototype format change

The node-only model and implicit video fallback were removed. Fixtures publish `pages-v1`; the seeder promotes only known `v1` sample catalogue/branch/published pointers. It never mutates an existing immutable version or deletes accounts/saves. Pre-page saves are unsupported and show a start-new-journey message; no compatibility renderer is retained. Later page editions remain version pinned. Reseeding identical versions is safe.

Run `pnpm seed` with emulators, then `pnpm dev:emulator`. For the shared project use `pnpm seed:firebase` with the configured server credential. Run `pnpm check`, `pnpm test:integration`, `pnpm test:pages` and `pnpm test:browser` against emulators. The page browser check covers desktop/mobile, mixed-media navigation and dice persistence after reload. Domain tests force both roll outcomes; API tests reject forged values and replay the same receipt.

Verification: TypeScript/build and 23 unit/domain/fixture tests passed; 10 emulator integration tests passed (including roll idempotency, injected-value rejection, reroll rejection, saved-result continuation). Chrome exercised all five types at 1440px/390px, natural video completion and explicit Next, recommendation handoff, dice-result reload before Next, and the existing seven-width Glass Harbor flow including side quests, retry/stale/offline and both endings. Physical Safari/iPhone and real hosted authenticated flows remain unverified. Combat and achievement progression remain deferred.
