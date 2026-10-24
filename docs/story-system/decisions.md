# Story system decisions

Established October 23, 2026 for documentation and future implementation. This register owns Story-specific architecture decisions; [the product register](../10-decisions-and-open-questions.md) continues to own broader product/commercial choices. No entry here claims code was refactored.

**Requirement** comes from the user's requested direction or existing project invariants. **Design default** is the concrete architectural choice made to support that direction, changeable through a documented decision. **Deferred** needs a feature-specific contract or product decision before implementation/release.

| ID | Status | Decision and rationale | Owning contract |
| --- | --- | --- | --- |
| S01 | Requirement + naming default | Story consists of graph placements called StoryNodes; StoryPage presents a node within shared Story/Page. Preserve existing `pages` wire names until deliberately versioned. Avoid two engines and obsolete compatibility. | [architecture](architecture.md), [nodes](story-nodes.md) |
| S02 | Requirement | Creator starts with a blank Story; incomplete drafts can save. Templates are explicit opt-in; publication requires a complete valid graph. Current starter pages are an implementation gap. | [nodes](story-nodes.md) |
| S03 | Requirement + design default | Every authored branch reaches a StoryLeaf; leaf has no in-story routes and uses shared completion exits. Structural reachability plus state/loop safety is required; voluntary loops may have guaranteed exits. | [nodes](story-nodes.md), [StoryPage](story-page.md) |
| S04 | Requirement + ownership default | StoryContext owns definitions; PlayerContext owns one run; UserContext owns account facts. Story provider composes projections without changing ownership. Logical contexts do not mandate a React library or three providers. | [architecture](architecture.md), context documents |
| S05 | Existing requirement + battle design default | Server validates conditions, outcomes and routing. Dice Roll persists/displays; separate Next routes. Future battle persists turns/result and uses explicit Continue. | [StoryPage](story-page.md), [types](page-types.md) |
| S06 | Requirement + design default | Sequel keys use explicit versioned export/import contracts and provenance. Narrative snapshots differ from live subscription/access rights. Source runs are explicitly selected when continuity is ambiguous. | [keys](keys.md) |
| S07 | Existing requirement | Immutable editions, version-pinned runs, idempotent/revisioned commands and isolated child branches. No destructive migration shortcut. | [data/storage](data-storage.md), [PlayerContext](player-context.md) |
| S08 | Design default | Versioned registered types with typed config/input/intent/state/result and stable named outputs; branch numbers are display ordinals. Registries remain platform-separated, not creator executable plugins. | [nodes](story-nodes.md), [types](page-types.md) |
| S09 | Existing requirement + design default | Account rewards/entitlements have approved issuers and unique durable claim scopes. Creator-local keys cannot mint global rights; command receipt TTL does not reset reward eligibility. | [keys](keys.md), [UserContext](user-context.md) |
| S10 | Design default | AI produces reviewable drafts/assets through normal validation. Background jobs need durable recovery for production; generated output cannot directly publish or award progress. | [AI authoring](ai-authoring.md) |
| S11 | Requirement + deferred contracts | Support future GraphicNovel, Form, TurnBasedBattle and Advertisement within the same architecture. Their rows define initial boundaries; release-specific details remain below. | [types](page-types.md) |
| S12 | Working agreement | Root instructions route to scoped guides and canonical docs before planning; document impact before commit. PR template is present; executable CI/hook/protection gates are future work. | [workflow](../development-workflow.md), [CONTRIBUTING](../../CONTRIBUTING.md) |

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
