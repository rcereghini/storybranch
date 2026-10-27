# StoryNode types and StoryLeaf presentation

Status: current mappings plus target contracts. Read [StoryNodes](story-nodes.md) and [StoryNode rendering](node-rendering.md). Every row below uses the same `Story`/`StoryNode` lifecycle, server routing and edition-pinned config. Future names are reserved design vocabulary, not enum values accepted by today's API. Decisions: S02, S03, S05, S08, S11.

## Type contract table

`Config` means authored data; `Input` means validated runtime values. Results below are logical shapes, not current request bodies. Named outputs are stable semantic slots; conditions/effects bind through the graph contract. An output destination is a StoryNode or StoryLeaf unless a row specifically restricts it to a StoryLeaf.

| Type and status | Typed config and input | Completion trigger and durable result | Outputs and destinations |
| --- | --- | --- | --- |
| Text — current `text` | Config: title, body, optional header image; Input: safe StoryNode/run context | Next; no computed result | `next` → one destination; ending Text may present a StoryLeaf with no in-story output |
| Text with Options — current `text-options` | Config: Text plus bounded option IDs/labels, conditions/costs; Input: declared state used by conditions | Chosen available option; committed option ID | One output per option → bound destination; all-locked states require a usable fallback in the target design |
| Video — current `video` | Config: pinned video/caption/poster refs, `advance: auto or continue`; Input: StoryNode/run context | Auto: ended OR Next; continue: explicit Continue; no trusted watch-time reward | `next` → one destination; eligible ending video may present a leaf |
| Video with Options — current `video-options` | Config: video plus option definitions; Input: declared state | Explicit option click, including an overlay option; committed option ID | Chosen option → bound destination; ended cannot select an option |
| ComicStrip — current `comic`, `scroll` layout | Config: ordered panels with image/caption/alt; Input: StoryNode/run context | Next after presenting panels; scroll position is not proof of completion | `next` → one destination, or leaf presentation |
| Comic grid — current `comic`, `grid` layout | Config: 4 or 9 panels; Input: StoryNode/run context | Next; no computed result | `next` → one destination, or leaf presentation |
| GraphicNovel — deferred distinct type | Config: bounded ordered spreads/panels, reading direction, captions/alt and optional explicit choice slots; Input: bookmark and declared choice state | Reading between spreads stays in the node; explicit Finish or chosen ending option commits `lastSpreadId`/option ID | Linear `next` OR declared option outputs → destinations; not implicit completion from scrolling |
| Form — deferred | Config: versioned allowlisted fields, validation, output mappings and required cancel policy; Input: typed defaults and optional persisted response draft | Explicit Submit after server validation; bounded typed response or private response reference; Cancel if enabled | `submitted` and enabled `cancelled` → destinations; conditional result routing is server-derived; invalid entries stay on the form |
| DiceRoll — current `dice` | Config: integer sides and threshold; Input: permitted run state; modifiers deferred until versioned | Roll persists `{value, sides, threshold, passed}`; separate Next consumes result | `fail` (display 0), `pass` (display 1) → destinations |
| TurnBasedBattle — S35 contract, implementation deferred | Config: battle-1, one enemy, 1–30 rounds; Input: run health/stats, optional preemptive and 0–10 attack/defense bonuses | Attack/Guard persist a round; guaranteed Escape; terminal outcome/reason/turns/HP; explicit Continue routes | Required unconditional `win`, `loss`, `escape` → safe destinations; turn limit resolves to loss |
| Advertisement — deferred | Config: labeled placement, mode, provider capability and fallback policy; Input: verified eligibility/consent and access projection | Provider-verified completion if rewarded, or explicit continue/skip for non-rewarded; persisted receipt/status | `completed`, `skipped`, `unavailable` → destinations; optional verified reward only on `completed` |
| Reveal — current `reveal` | Config: ordered score/result mappings; Input: run scores | Reveal; server selects highest score, first listed on tie | One output per result → StoryLeaf/result ending |
| StoryLeaf — endpoint role, current semantic mapping `kind: ending` | Config: ending presentation, completion scope, end-of-path rewards and optional summary/export rules; Input: validated ending summary | Committed entry completes the run once and applies authorized rewards under their claim scope; generalized rewards are target work | No in-story StoryBranch; shared replay, parent-return and discovery actions |

Current comics allow 4–12 strip panels or exactly 4/9 grid panels at publication; incomplete panels can be saved in drafts. Generic GraphicNovel pagination, Form, Battle and Advertisement are **not implemented**. A visual layout variation should reuse Comic when its inputs and completion semantics are identical; a new type is justified by a distinct interaction/state contract. Options remain explicit contracts, whether implemented as variants or capabilities later.

The [StoryTrunk](terminology.md) is the unique title/configuration root outside the playthrough; it has a separate authoring contract and no playable renderer. A StoryBranch is a connection with optional typed data mappings and conditions. StoryLeaf is an endpoint role whose presentation can reuse an eligible renderer. None requires a second player hierarchy. In the target playable graph, unfinished branches are disabled and their options hidden, with creator diagnostics; a type with a required unsafe outcome is unavailable upstream until repaired.

## Common registration requirements

Each type must provide bounded config/input/intent/state/result schemas, a pinned type version, stable output slots, lifecycle transitions, ownership and authority rules, reload/retry behavior, failure/cancel policy, editor validation, preview fixtures and accessibility behavior. Types with no durable interaction state still declare that fact. Public library support requires a separate reusable-config and slot-binding contract; registration alone does not make every type reusable.

Current library support is Text/Text with Options/Video/Video with Options. Dice, Reveal and Comic remain placements; extending library support must pin content revisions and validate inputs without leaking story/run identity.

StoryLeaf local completion is implemented separately from a new renderer type: eligible ending placements accept versioned summary/labeled-key configuration, and committed entry records the durable run receipt. The shared StoryNode presents it in both preview and playback. Account rewards and exports remain deferred. See [local completion contract](story-nodes.md#local-completion-contract) for bounds, claim scope and old-save behavior.

## DiceRoll details

Initial rule remains uniform integer 1–N, pass on `value >= threshold`; target must be within 1–N. The service supplies randomness and persists it before the UI shows a result. Transaction retries reuse the draw; command retries replay the receipt. Repeated Roll on the pending visit is rejected. Next routes from the stored result and consumes it exactly once. A future modifier must name its source, bounds and ruleset version; the browser cannot supply a total.

The raw roll and selected output are distinct. A following node can explicitly bind to the saved raw result or `passed` flag using [S32](branch-data.md). A numeric branch label 0 or 1 is not a general-purpose context object. Current downstream conditions can inspect `lastRoll` for a named StoryNode; conditions consuming the new input snapshot remain deferred.

## Battle inputs and turn state

[S35](battle.md) now defines the concrete first-version contract: one opponent, deterministic rounds, guaranteed Escape and a loss at the turn limit. The table below remains the broader extension boundary; party combat, general status effects and additional rewards are deferred. S35 takes precedence for initial implementation.

| Field | Source and rule |
| --- | --- |
| Encounter and ruleset references | Immutable published configuration; cannot change during a run |
| Party, stats, HP and items | Allowlisted snapshot of PlayerContext; server checks availability |
| Initiative/pre-emptive mode | Enum such as `normal`, `player-first`, `enemy-first`; bound from authored constants or a validated predecessor result |
| Buffs/debuffs | Registered effect IDs, source, magnitude bounds, stacking and expiry/turn duration; no arbitrary script or client-created buff |
| Allowed actions and targets | Encounter rules plus current turn/state; validate ownership and turn order each command |
| Rewards and consumption | Authored local effects plus approved account reward references; costs committed once at the defined action boundary |

Persist battle identity, node visit, current turn, participants/resources, status effects, RNG evidence as required by the ruleset, revision and terminal result. A timeout/reload restores the exact battle; it does not reroll initiative or reset enemies. Use a finite configured turn limit and deterministic terminal disposition, or a guaranteed escape action. Define win/loss/escape behavior before release, including zero-health and simultaneous-defeat rules. Stale actions must not execute against a different turn. Terminal results remain visible until Continue.

The StoryNode uses shared StoryNode controls for pending/error/exit behavior. Battle-specific action controls may live in the child renderer but dispatch through the same authoritative service. No client "I won" command is sufficient evidence.

## Forms and advertisements

Form field types and response limits must be allowlisted; scripts and arbitrary HTML are excluded. State which responses are story-local narrative variables and which are private submissions. Collect only the fields the published purpose requires. Define visibility, retention/deletion, confirmation, resume and explicit cross-node mappings before enabling the type. Creators do not automatically gain access to users' other answers, identity records or account context. Forms requiring credentials or payments need a separate trusted integration, not text fields that mint access keys.

Advertisements must be labeled, have bounded waiting and a usable skip/unavailable path, and return to the story without a dead end. A provider callback is untrusted until authenticated, bound to user/run/visit, deduplicated and validated. No-fill, blocked media, missing consent or verification timeout cannot award the reward. Ad provider selection, audience/consent policy, targeting data, commercial terms and any payment-like access effects remain release decisions. Runtime ad delivery may select approved media without changing an edition's routing/reward policy; this exception requires its own audited asset/delivery contract before implementation.

## Verification required for a type

Prove configuration rejection, all output destinations, input compatibility, conditions/costs and closure in portable checks. Prove forged-result denial, concurrent commands, retry receipts, save/reload and permitted effects in service checks. Exercise the real renderer under Story/StoryNode at desktop/mobile sizes, keyboard operation, offline/retry and completion UI. Preview must clearly identify any mocked provider. Record untested devices, hosted services and provider behavior.

S32 now supports bounded constant/current-Dice input snapshots on existing placements. Earlier generic-binding deferrals still apply to variables, imports, other result types and renderer consumers. The type table's completion and routing contracts are unchanged; see [StoryBranch data](branch-data.md).
