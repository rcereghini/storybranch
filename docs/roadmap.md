# Current delivery checklist

Reviewed October 27, 2026 against merged main `fee27ec` (through PR62), with S35h isolated child battle entry implemented in this change. This is the current planning checklist; dated verification records remain historical evidence. A checked item means the named deliverable is complete; a design-only item is explicitly labeled and does not imply runtime support or hosted/device acceptance. See [delivery acceptance](08-delivery-and-acceptance.md) for release gates and [Story decisions](story-system/decisions.md) for authority.

## Implemented foundation

- [x] Shared Story/StoryNode lifecycle, server-approved rendering, revisioned/idempotent transitions, pinned immutable editions and isolated child runs.
- [x] Blank StoryTrunk authoring, graph editing and conservative unfinished-path suppression for preview/publication.
- [x] Text, text options, video, video options, Dice with separate Roll/Next and animated d20, Reveal and Comic.
- [x] StoryLeaf completion receipts/local rewards, reviewed account achievements and persistent Story keys.
- [x] Invitation entry keys, promotional option keys, achievement-backed account conditions and consented same-creator sequel imports, including selected completed runs.
- [x] Visual key/stat/item conditions, item costs/rewards and edition-pinned item catalogue.
- [x] Owned inventory, net item history and visible option costs without exposing hidden routes/catalogues.
- [x] Disposable key/stat/inventory previews and private named saved playtest setups (PR51).
- [x] Upload/library and AI-assisted authoring foundations. These do not establish durable job recovery or commercial billing readiness.

Implementation details: [player runtime](story-system/player-runtime.md), [Studio](17-creator-studio.md), [keys](story-system/keys.md) and [AI authoring](story-system/ai-authoring.md).

## Next architecture slices

- [x] S32 typed input declarations, constant/Dice mappings, per-entry server snapshots and safe publication validation (merged PR52). Contract: [StoryBranch data](story-system/branch-data.md).
- [x] S33 visual input/binding editor, creator-only resolved-input diagnostics and typed input conditions with guaranteed exits (merged PR53).
- [x] S34 repeatable private playtests: saved Dice controls, bounded route history and editable destination/status assertions, merged PR54. See [Studio](17-creator-studio.md#s34--recorded-and-repeatable-private-playtests).
- [x] S35 concrete [TurnBasedBattle design](story-system/battle.md): deterministic one-on-one rules, input/output contracts, bounded turns, guaranteed escape and release gates. Documentation only.
- [x] S35a standalone portable battle schemas, input-range helpers and deterministic round engine. No playable type registration.
- [x] S35b strict win/loss/escape output plans, validation against the existing effective graph and terminal Continue input binding proposals. No playable type registration.
- [x] S35c staged mixed battle graph schema/compiler, all-required output safety, incoming edge/default validation and battle-to-battle result range checks. Live Story schemas still reject combat.
- [x] S35d staged authoritative battle action/reload endpoints, owned embedded state, atomic Continue/effects/completion, receipts and capability gating. No public battle start or renderer.
- [x] S35e staged mixed-Story start/choice helpers and capability-gated ordinary choice transactions, including Dice Next entry, revisits and live account-key checks. Public battle starts remain disabled.
- [x] S35f full staged player projection/media and shared battle rendering with existing session recovery. Public starts and side-Story offers remain gated.
- [x] S35g capability-aware root/replay starts with entry authorization, consented key imports and fresh isolated encounters.
- [x] S35h isolated battle child starts, separate import consent and parent-preserving completion/return.
- [ ] Integrate Studio and repeatable battle playtests. Publication remains disabled until the full acceptance path is verified.
- [ ] Checkpoint restore with explicit roll/visit semantics; broader item use and reward configuration without duplicating permanent claims.

## Remaining product work

| Area | Still needed | Dependency or release gate |
| --- | --- | --- |
| StoryNode types | Distinct GraphicNovel, Form and Advertisement | Type-specific inputs/completion/routes; Form privacy and Ad provider/consent policy |
| Keys and commerce | Paid key shop, subscriptions, purchase/expiry/refund reconciliation and protected-media delivery | Approved issuer/payment design; existing promotional keys are not billing or private media protection |
| Cross-creator continuity | Imports between different creators | Namespace, export permission and revocation policy; current imports are same-creator |
| Community authoring | Creator-authored side Stories, placement management, featured/gift/swap flows | Existing seeded child-run foundation does not complete community authoring; concurrency and ownership tests |
| Media and AI | Transcoding/thumbnails, durable workers, browser-close recovery, target-revision-safe placement | Reconciliation and conflict policy; current request/browser coordination is insufficient |
| Documentation enforcement | CI impact/link/contract checks and actual protected owner review | [Workflow acceptance](development-workflow.md#future-gate-acceptance-criteria); instructions cannot prove reading |
| Operations and quality | Hosted/device coverage, performance aggregation, staging/restore/recovery evidence | Physical Safari/mobile and provider/payment tests must be recorded, not inferred from local checks |
| Native client | Auth/deep-link/video/save prototype | Stable API and explicit platform billing requirements |

Maintain this checklist when a slice lands. Link its owning contract and distinguish implementation, local verification, merge and deployment. Do not mark an entire milestone complete because one constituent feature shipped.
