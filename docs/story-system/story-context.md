# StoryContext

Status: target logical ownership model. Decision S04. Read [architecture](architecture.md), [PlayerContext](player-context.md) and [UserContext](user-context.md) together.

StoryContext describes **which story edition is being played and what it permits**. It is shared definition data, read-only during a run. Run-local values belong to PlayerContext even when the current React provider exposes both through `useStory()`.

## Owned data

| Data | Meaning |
| --- | --- |
| Story identity and edition ID | Stable work and exact immutable publication |
| Schema/rules/type versions | Versions that define validation and gameplay meaning |
| Title/configuration root | Exactly one StoryTrunk; title/cover/synopsis, Story settings and context definitions, configured outside the playthrough |
| Entry and graph | StoryTrunk start connection, StoryNodes, content revision references, typed inputs, StoryBranch data/conditions and StoryLeaf completion/reward definitions |
| Variable/key/item/score definitions | Declared IDs, types, bounds, initial values and permitted effects |
| Import/export declarations | Which external facts may be read and which verified local facts may be exported |
| Child Story entry/return policy | Allowed child context and parent reference semantics; ordinary StoryBranch traversal stays in the current run |
| Asset manifest | Pinned, validated media used by the edition |
| Completion and display metadata | Ending definitions, safe titles and presentation policy |

Definition defaults are not mutable global state. For example, a story may define `harbor:brass-key`; whether a player has it is run data. A creator can define a battle's `preemptive` input, but the resolved value for a visit comes from the run and validated bindings.

For S17 permanent narrative keys, optional version-1 `progression` declares Story-owned IDs, labels and completion thresholds. Actual grants and completion counts belong to a particular account's Story progress. A run snapshots only its edition's declared grants; changing StoryTrunk or earning a key in another run does not mutate the active context. See [key scopes and progression](keys.md#shared-key-model-s17).

## Lifecycle

S20 adds edition-pinned `runKeyExports` and optional `selection: completed-run` to import definitions. These declare local boolean facts and explicit destination permissions; they do not hold player values or choose a source run. See [selected-run imports](keys.md#selected-completed-run-imports-s20).

S19 editions may declare persistent-key exports on progression definitions and `keyImports` with pinned source edition/key IDs and local aliases. Definitions stay in StoryContext; resolved values/provenance belong only to the new run's PlayerContext. Permission and consent rules are owned by [keys](keys.md#persistent-key-imports-s19).

Load an authorized edition, verify its supported schema/rules/type versions, and construct a read-only projection. A run retains this identity until completion. New publication creates a new edition; resuming an old save reads its old edition. If an edition becomes unavailable, show recovery/support/replay options without replacing its content behind the player's back.

The current web provider composes `{story, user, save}`. StoryTrunk settings project root metadata and optional version-1 starting-key definitions. Initial keys are copied into each new run before entry effects, never imported from another run or applied when resuming an existing save. The target composition adds structured definitions/resolved input as needed, while retaining the shared provider. Components should select only the fields needed for their work. The entire graph, including hidden outcomes, need not be delivered to the browser; server-only data may remain in the authoritative edition store.

## Authoring and reusable content

DraftContext is an authoring view with revision, unsaved edits, layout and generation references; it is not a mutable StoryContext attached to active players. Preview captures a draft snapshot and constructs a disposable StoryContext plus test PlayerContext. Subsequent edits do not mutate an in-progress preview or a published save.

Reusable content has no story/run/user identity. Placement applies story-specific input and output bindings and pins a content revision. Changing those bindings changes the draft and eventually a new edition, not the shared content revision. Changing reusable content requires a new content revision and explicit placement adoption.

## Exclusions and checks

Do not store auth tokens, SDK instances, live subscription flags, a shared inventory or per-player rolls in StoryContext. Validate all named state references and import declarations at publication. Verify that simultaneous players cannot mutate one another's state and that editing a draft leaves existing editions and previews intact.
