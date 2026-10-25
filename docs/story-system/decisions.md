# Story system decisions

Established October 23, 2026 for documentation and future implementation. This register owns Story-specific architecture decisions; [the product register](../10-decisions-and-open-questions.md) continues to own broader product/commercial choices. The later naming-only implementation and legacy compatibility are recorded in S13; other target capabilities remain unimplemented.

**Requirement** comes from the user's requested direction or existing project invariants. **Design default** is the concrete architectural choice made to support that direction, changeable through a documented decision. **Deferred** needs a feature-specific contract or product decision before implementation/release.

| ID | Status | Decision and rationale | Owning contract |
| --- | --- | --- | --- |
| S01 | User-confirmed terminology + existing runtime requirement | Story contains one StoryTrunk, StoryNodes, StoryBranches and StoryLeaves. StoryTrunk is the title/configuration root outside the playthrough. StoryNodes are playable content/interactions. StoryBranches connect the graph and may carry typed data/conditions. StoryLeaves end paths and configure rewards. Use canonical names in code and new stored/API contracts, with compatibility at the boundary; render through shared Story/StoryNode. | [terminology](terminology.md), [architecture](architecture.md), [nodes](story-nodes.md) |
| S02 | Requirement | Creator starts with a blank Story containing its single StoryTrunk, with no playable nodes/leaves/connections. Incomplete drafts can save; templates are opt-in. A safe start and valid effective playable graph are required to play/publish. Current starter StoryNodes are an implementation gap. | [nodes](story-nodes.md) |
| S03 | User requirement + validation design default | Every enabled StoryBranch reaches a StoryLeaf. Notify the creator when it cannot; disable the branch and hide its option from players. Server rejects attempts to invoke it. Propagate unsafe required outcomes upstream and block play/publication if no safe start survives. Leaf completion applies authorized end-of-path rewards and shared exits. Structural reachability plus state/loop safety is required; voluntary loops may have guaranteed exits. | [nodes](story-nodes.md), [StoryNode rendering](node-rendering.md) |
| S04 | Requirement + ownership default | StoryContext owns definitions; PlayerContext owns one run; UserContext owns account facts. Story provider composes projections without changing ownership. Logical contexts do not mandate a React library or three providers. | [architecture](architecture.md), context documents |
| S05 | Existing requirement + battle design default | Server validates conditions, outcomes and routing. Dice Roll persists/displays; separate Next routes. Future battle persists turns/result and uses explicit Continue. | [StoryNode rendering](node-rendering.md), [types](node-types.md) |
| S06 | Requirement + design default | Sequel keys use explicit versioned export/import contracts and provenance. Narrative snapshots differ from live subscription/access rights. Source runs are explicitly selected when continuity is ambiguous. | [keys](keys.md) |
| S07 | Existing requirement | Immutable editions, version-pinned runs, idempotent/revisioned commands and isolated child Stories. Ordinary StoryBranches stay in the same run. No destructive migration shortcut. | [data/storage](data-storage.md), [PlayerContext](player-context.md) |
| S08 | Design default | Versioned registered types with typed config/input/intent/state/result and stable named outputs; branch numbers are display ordinals. Registries remain platform-separated, not creator executable plugins. | [nodes](story-nodes.md), [types](node-types.md) |
| S09 | Existing requirement + design default | Account rewards/entitlements have approved issuers and unique durable claim scopes. Creator-local keys cannot mint global rights; command receipt TTL does not reset reward eligibility. | [keys](keys.md), [UserContext](user-context.md) |
| S10 | Design default | AI produces reviewable drafts/assets through normal validation. Background jobs need durable recovery for production; generated output cannot directly publish or award progress. | [AI authoring](ai-authoring.md) |
| S11 | Requirement + deferred contracts | Support future GraphicNovel, Form, TurnBasedBattle and Advertisement within the same architecture. Their rows define initial boundaries; release-specific details remain below. | [types](node-types.md) |
| S12 | Working agreement | Root instructions route to scoped guides and canonical docs before planning; document impact before commit. PR template is present; executable CI/hook/protection gates are future work. | [workflow](../development-workflow.md), [CONTRIBUTING](../../CONTRIBUTING.md) |

S13 — User-authorized naming and compatibility: use canonical StoryNode names in types, components, UI, files, stored fields and API routes. Preserve gameplay behavior and immutable editions. Isolate legacy decoding, API format negotiation, collection fallback and stable receipt identity at the [compatibility boundary](naming-compatibility.md). This supersedes the original documentation-only delivery scope; the new architecture features remain target work.

## Decisions still required

| Topic | Required before | Starting design and unresolved part |
| --- | --- | --- |
| Battle rules | Combat implementation | Turn/action persistence and typed inputs are fixed boundaries; concrete formulas, initiative, stacking, reward balance, escape and turn-limit disposition need versioned encounter rules |
| Typed state limits and versions | New schema implementation | Use bounded validated values and explicit versions; exact limits, enum IDs and migration adapters need implementation design |
| Conditional graph analysis | Publishing richer graphs | Guarantee usable continuations; choose bounded analyzer/abstract state strategy and require fallbacks where safety cannot be established |
| Cross-creator exports | Broader sequel/progression release | Need namespace governance, author/user permission, integrity revocation and handling of revoked source facts |
| Paid/subscriber/promotional rights | Billing/entitlement release | Need issuer/provider, redemption/refund, expiry-during-run and offline policies; no price or commercial promise is chosen here |
| Form responses | Form implementation | Need field allowlist, permitted audience/data, visibility, retention/deletion and response-to-state mappings |
| Advertisement | Ad implementation | Need provider, consent/audience, labeling, verification, bounded no-fill/timeout policy and permitted reward definitions |
| GraphicNovel | Distinct type implementation | Need bounded spread model, reading direction/bookmarks and optional choice behavior; reuse current Comic where sufficient |
| Checkpoints | Restore implementation | Define roll/visit replay and local-state restoration while preserving permanent claims |
| Durable generation | Production recovery work | Choose worker/queue, placement conflict policy and reconciliation coverage; browser queue is insufficient |
| Merge enforcement | Repository administration | Choose actual review owners, check implementation, protected-branch policy and documented exception process |

## Changing a decision

State the trigger, affected ID, new rule, impact on editions/saves/rights and verification. Update the owning contract, examples, current contract if behavior changes, and relevant reading links together. Preserve the previous rationale when it explains compatibility. Do not label a design default as user-confirmed or a target rule as implemented merely because it appears in a document.

## Player runtime implementation — October 25, 2026

S05/S07 implementation: authenticated playback negotiates `X-Story-Player: player-view-v1`. Commands return the committed render view; old command receipts still store their original save result and are projected on replay without executing again. Current state remains version pinned. A bounded process-local edition cache retains definitions only and checks the manifest on every access. See [player runtime](player-runtime.md) for ordering, disclosure limitations and verification. This does not implement trunk authoring, conditional path compilation, typed cross-node bindings or reward claims.

## Required player contract — October 25, 2026

User decision: require the new player contract and retire detailed old player responses. S07/S08 implementation: all playthrough routes reject missing/unsupported player versions before command execution; save lists and history use allowlists; raw run/event/receipt Firestore reads are server-only. Preserve immutable editions, legacy stored-name normalization and full internal receipts. Non-player authoring/library compatibility is unchanged. This replaces the initial optional player-projection negotiation, not the naming migration. See [player runtime](player-runtime.md#player-disclosure-boundary).

## S14 — StoryTrunk authoring and conservative effective graphs

Implement S01–S03 using a single trunk projection over existing root metadata plus optional versioned `trunkContext.initialKeys`. Blank drafts contain no placements. Preview and new publication compile a safe subset with creator diagnostics, retaining unfinished draft work. Require an unconditional cost-free strategy to a StoryLeaf, all required outcomes safe, and preserve optional voluntary loops only when that strategy exists. Inventory-dependent guarantees need later bounded analysis. Existing immutable editions retain their original graphs and semantics; no read-time recompilation or migration. See [implementation contract](story-nodes.md#storytrunk-and-safe-publication-implementation).

## S15 — StoryLeaf local rewards and durable run completion

Implement local completion before account progression. Optional version-1 leaf configuration declares a bounded summary and labeled Story-local keys. Committed ending entry writes `Save.completion` atomically with grants and the event; this embedded receipt has the run's lifetime and no command-receipt TTL. Existing revision/status guards prevent repeat completion; replay is a new run. Expose committed details through the player allowlist and shared renderer, including disposable Studio previews. Do not backfill old completed saves or rewrite editions. Account claims, entitlements and sequel imports remain deferred. See [local completion contract](story-nodes.md#local-completion-contract).
