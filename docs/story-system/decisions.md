# Story system decisions

Established October 23, 2026 for documentation and future implementation. This register owns Story-specific architecture decisions; [the product register](../10-decisions-and-open-questions.md) continues to own broader product/commercial choices. Later sections record implemented slices. Use [the current roadmap](../roadmap.md) rather than historical deferral statements to assess remaining work.

**Requirement** comes from the user's requested direction or existing project invariants. **Design default** is the concrete architectural choice made to support that direction, changeable through a documented decision. **Deferred** needs a feature-specific contract or product decision before implementation/release.

| ID | Status | Decision and rationale | Owning contract |
| --- | --- | --- | --- |
| S01 | User-confirmed terminology + existing runtime requirement | Story contains one StoryTrunk, StoryNodes, StoryBranches and StoryLeaves. StoryTrunk is the title/configuration root outside the playthrough. StoryNodes are playable content/interactions. StoryBranches connect the graph and may carry typed data/conditions. StoryLeaves end paths and configure rewards. Use canonical names in code and new stored/API contracts, with compatibility at the boundary; render through shared Story/StoryNode. | [terminology](terminology.md), [architecture](architecture.md), [nodes](story-nodes.md) |
| S02 | Requirement, implemented by S14 | Creator starts with a blank Story containing its single StoryTrunk, with no playable nodes/leaves/connections. Incomplete drafts can save; templates are opt-in. A safe start and valid effective playable graph are required to play/publish. | [nodes](story-nodes.md) |
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
| Battle expansion | Beyond S35 battle-1 | [S35](battle.md) fixes initial formulas, inputs, persistence, guaranteed escape and turn-limit loss. Party combat, skills, timed effects, randomness and additional rewards require new rules. Client capability negotiation is a release gate for the API slice. |
| Typed state limits and versions | Further schema expansion | S32 fixes limits/version 1 for constant and current-Dice scalar inputs; enums, additional sources/consumers and migration adapters still need implementation design |
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

## S16 — Approved account achievements

Design default: creators submit achievement metadata for an exact published StoryLeaf/edition; admins approve, reject or revoke with a reason and audit entry. Pending/rejected metadata may be resubmitted; approved/revoked definitions cannot be edited. Admins, including creator accounts with the admin capability, can review. Approval is external live grant policy and never rewrites the narrative edition or backfills earlier completions. Each approved completion atomically claims once per user/Story/StoryLeaf across editions. Renamed/replaced leaf IDs are different achievement identities and require explicit admin review; semantic identity migration is deferred. Revoked source definitions mark retained claims revoked in private account listings. No XP, paid rights, public sharing, automatic imports or unapproved provider grants. See [approval and claims](keys.md#approved-account-achievements).

## S17 — Keys, scopes and persistent Story progress

Use one key-definition/grant model with explicit run, Player + Story, and account scopes. Story definitions never hold shared player ownership. Narrative keys need no platform achievement approval; issuer boundaries still prohibit arbitrary commercial or foreign grants. Branch checks are server-authoritative at display and selection. Stable narrative facts are snapshotted; expiring access remains live. Begin with durable per-player Story completion counts, edition-declared threshold keys, and run-pinned condition snapshots. Retries cannot count again, replay is a new qualifying completion, and old completions are not backfilled. Account invitations, imports and commerce remain separate follow-on work under the [key contract](keys.md#shared-key-model-s17).

## S18 — Creator invitations grant permanent Story entry

Implement beta invitations as creator-issued account keys scoped exclusively to starting one Story. A live root entry policy applies to all editions and root/child starts; the creator may play their own Story. Existing journeys continue and retained grants remain valid after an invitation expires or is disabled. Expiry and redemption limits apply to the invitation, not the earned key. Each account redeems at most one entry grant per Story, atomically consuming one invitation slot with a durable grant. This is not subscription access, private media hosting or retroactive content secrecy: public share previews, previously delivered download-token URLs and existing journeys remain accessible. Do not advertise it as paid-content protection. Delivery is manual copy/share; the service sends no follower messages. See [invitation entry contract](keys.md#invitation-entry-contract).

## S19 — Consented permanent key imports within one creator's Stories

Start with explicit ever-earned persistent Story keys, pinned export permission and local destination aliases. Both Stories must have the same creator. The player approves checks before a root run; the server snapshots verified values/provenance in that run, isolated from local effects and hidden from player projections. Optional missing/declined keys default false; required keys block start. Permission errors never become defaults. Immutable exports are permanent narrative permissions, not revocable access rights. At S19, selected-run continuity and child consent were deferred; S20 and S21 below add them. Cross-creator imports and live integrity revocation remain deferred. See [the implementation contract](keys.md#persistent-key-imports-s19).

## S20 — Explicit completed-run continuity

Allow edition-declared run-local boolean exports through the S19 permission boundary. Players explicitly select one completed run per source Story/edition; never choose latest implicitly or combine contradictory runs from one edition. Required continuity requires a source run, while false remains a valid imported fact. A bounded private picker exposes completion labels, not inventory. Start revalidates and freezes facts/provenance transactionally; source selection is part of command identity. Older saves and editions are untouched. See [selected-run imports](keys.md#selected-completed-run-imports-s20).

## S21 — Explicit community child import consent

Adopt S19/S20 consent for community side Stories. Authorize offer, source listing and entry against the owned active parent's revision/location and exact child edition; recheck live entry policy at each boundary. Freeze only declared facts in the new child, never inherit consent or merge local state. Legacy no-import child commands remain valid. See [keys](keys.md#community-side-story-imports-s21).

## S22 — Approved achievement bindings grant permanent Story keys

Bind a persistent narrative key to a published StoryLeaf achievement as an alternative to a completion threshold. The server derives bindings for admin review, then commits approved grants with completion and durable deduplication receipts. Preserve earned keys on approval revocation; no historical backfill or account/paid rights. See [achievement keys](keys.md#achievement-bound-persistent-keys-s22).

## S23 — Private earned Story key history

Expose bounded allowlisted projections of the actor's existing progress and grants in Adventures. Show earned provenance and link to the owned source journey without exposing unearned definitions or import permissions. Preserve historical keys independently of current definitions and review status. See [key history](keys.md#earned-story-key-history-s23).

## S24 — Private invitation entry key history

List the actor's permanent redeemed entry keys separately from narrative rewards, with bounded display-only projections and links to Story details. Snapshot the published title on new redemption; retain legacy grants without backfill. History is not a current availability check and never exposes invitation secrets or introduces commercial rights. See [invitation history](keys.md#private-invitation-key-history-s24).

## S25 — Key-aware Studio previews

Allow bounded declared persistent/imported key simulations only in disposable preview state. Scenario edits restart the run; shared rules explain effective option availability. Real authority, publication checks and immutable data are unchanged. See [preview contract](keys.md#key-aware-disposable-previews-s25).

## S26 — Live creator promotional keys for options

Introduce issuer-controlled expiring promotional rights for explicit same-creator Story consumers. Resolve declared account aliases live at projection/choice, never snapshot them into saves. Preserve committed outcomes and safe exits on revocation. Codes have bounded redemption windows/capacity and durable per-account uniqueness. No payments, protected media, foreign issuers or per-recipient revocation. See [S26](keys.md#live-promotional-account-keys-s26).

## S27 — Achievement-backed account key conditions

Approved achievement definitions explicitly permit same-creator consumer Stories through a reviewed immutable list. Consumer editions bind typed achievement-source account aliases. Live evaluation requires a durable claim and current approval of both the bound and originally earned definitions, matched by stable achievement identity and issuer. Existing promotional aliases retain their default source. See [the key contract](keys.md#achievement-backed-account-keys-s27). No billing, claim migration or retroactive awards.

## S28 — Edition-pinned Story item catalogue

An optional version-1 catalogue adds names/descriptions to stable Story-local item IDs without granting inventory or requiring existing references to be catalogued. Save and publish validate bounded unique local definitions; published editions retain their own metadata. Shared authoring pickers preserve raw IDs, and Studio blocks metadata removal while draft references exist. Player projections omit the catalogue. No save migration, retroactive renaming, cross-Story inventory or account entitlement is introduced. See [Studio catalogue](../17-creator-studio.md#story-item-catalogue) and [StoryContext](story-context.md).

## S29 — Owned inventory and net item history

Expose only owned positive item quantities and pinned display metadata, with raw-ID fallback. New events atomically snapshot net inventory changes and their pinned labels; retries and old history retain existing semantics. A read-only modal drawer and Story log consume these projections without exposing the catalogue. No item transfer, use command, migration or account entitlement is added. See [player runtime](player-runtime.md#owned-inventory-and-item-history-s29).

## S30 — Visible StoryBranch cost disclosure

Show aggregated costs and current quantities on visible options using server-selected, edition-pinned item names. Visible requirements may disclose unowned item names, but hidden options, descriptions, conditions, destinations and future rewards remain private. The server still decides eligibility and commits spending; Studio preview shares the presentation. See [visible option costs](player-runtime.md#visible-option-costs-s30).

## S31 — Private saved playtest setups

Persist bounded named starting scenarios only in creator drafts, using existing revisioned saving and undo. Preserve stale references with diagnostics and reject loading them; loading a valid setup restarts disposable preview without touching real runs. Exclude scenarios from editions and player commands. See [Studio scenarios](../17-creator-studio.md#stat-and-inventory-preview-scenarios).

## S32 — Bounded StoryBranch input snapshots

Optional version-1 declarations and constant/current-Dice mappings resolve on authoritative entry into a bounded server-only snapshot. Validate every incoming edge and suppress unsafe choices before publication. Preserve separate Roll/Next, pinned editions, existing saves and player allowlists. Initial authoring uses Inputs/Outputs JSON; inputs have no rendering or condition consumer yet. See [the exact contract](branch-data.md).

## S33 — Visual input authoring and authoritative conditions

Expose S32 declarations/bindings through explicit Apply/Reset controls and private preview inspection. Add bounded typed comparisons against the current entry snapshot, validated recursively against the source declaration and evaluated server-side. Preserve unconditional safe exits, private values, immutable editions and separate Dice Roll/Next. See [the contract](branch-data.md#s33--visual-bindings-and-current-entry-input-conditions).

## S34 — Recorded private playtest assertions

Extend existing draft-only saved setups with bounded Dice controls and recorded command paths containing exact draws and expected destinations/statuses. A pure runner starts from the setup against the current effective draft graph and reports the first mismatch without mutating active preview or real state. History is bounded, recording is explicit, and passing a partial path is not full-Story verification. See [Studio S34](../17-creator-studio.md#s34--recorded-and-repeatable-private-playtests).

## S35 — Bounded authoritative TurnBasedBattle contract

Design default, implementation deferred: start with one player and one enemy, deterministic Attack/Guard rounds, guaranteed Escape and a finite turn limit resolving to loss. Use run health/stats plus declared entry bonuses, persist every round under revision/visit guards, and route only on explicit Continue. Three unconditional safe outcome routes are mandatory. No automatic loot or account grants. [Battle](battle.md) owns formulas, typed boundaries, disclosure and acceptance gates. This is a documentation-only decision; no current API or edition gains battle support.

### S35a — Portable battle foundation

Implement the strict standalone battle schemas and pure deterministic engine before registering a playable type. Input range validation is explicit per incoming edge; helpers return state proposals only. Publication wiring, server authorization/receipts, graph routing, client negotiation and rendering remain gated follow-up work. See [S35a](battle.md#s35a-implementation-boundary). No existing save/edition or real-player contract changes.

### S35b — Terminal battle route proposals

Require all three unconditional battle output routes and validate their destinations against the current effective safe Story graph before returning a proposal. Continue must pass the battle engine guards and derive the selected outcome and scalar bindings from its pending result. Include Story identity alongside edition/run/entry identity. Keep the binding union separate from ordinary live routes until mixed graph compilation and authoritative runtime integration are ready. See [S35b](battle.md#s35b-terminal-routing-boundary).
