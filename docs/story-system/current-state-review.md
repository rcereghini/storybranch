# Project review after the main pull

Reviewed October 23, 2026 (America/Phoenix). Working tree initially clean; `main`, `origin/main` and `origin/HEAD` pointed to `49c2ac6`. Local reflog identifies the latest fast-forward as `ea6a32b` → `49c2ac6`. This is a focused source/architecture review, not a complete security audit or a hosted browser acceptance run.

## Latest pulled changes

| Commit | Change | Architecture implications |
| --- | --- | --- |
| `455af94` | Comic StoryNodes with square grid or scrolling strip | Adds the seventh StoryNode type through contracts, domain validation, shared StoryNode renderer, Studio and publication asset checks |
| `f439204` | Comic companion and daily generation limit 100 | Adds bounded script/cast/panel suggestions and coordinated asset generation; quotas remain server-checked |
| `49c2ac6` | Background comic drawing, status pill and finish notification | Component-independent browser state survives in-app navigation; reload stops placement coordination |

The range touches 31 files. Earlier recent work already supplied image generation, outline/writing assistance, StoryNode library, Studio editing and updated player surfaces. The original documentation checkpoint changed no application code. The subsequent naming and compatibility work is recorded below; descriptions and links here use the canonical names.

## Current architecture inspected

- [Story provider](../../apps/web/src/Story.tsx) composes story metadata, a safe user projection and one save. [StoryNode](../../apps/web/src/StoryNode.tsx) dispatches common outputs and hosts text, video, dice, reveal and comic presentation; [ComicStrip](../../apps/web/src/ComicStrip.tsx) is its child.
- [Portable contracts](../../packages/contracts/index.ts) define seven StoryNode enums, bounded conditions/effects, `StoryNodeInput`, `StoryNodeOutput`, local state and versioned saves. The schema is still explicitly StoryNode-based.
- [Domain engine](../../packages/domain/index.ts) validates outputs, applies local effects, persists a pending dice result before continuation and enforces story namespaces. [Publication validation](../../packages/domain/authoring.ts) additionally rejects unreachable placements and nodes with no structural path to an ending.
- [API handler](../../services/api/handler.ts), [authoring service](../../services/api/authoring.ts) and [storage paths](../../services/api/paths.ts) enforce server commands, receipts, publishing and owned state. Comic panels join normal published image validation and media projection.
- [Studio model](../../apps/web/src/studio-model.ts) currently creates opening/ending starter nodes in `blankStory`; [comic drawing](../../apps/web/src/comic-drawing.ts) coordinates generation in browser memory. It is not a durable queue.
- [CI](../../.github/workflows/check.yml) runs application type/unit/build and emulator/browser checks. No documentation-impact or mandatory reading gate was found in the repository workflow. Remote branch protections were not inspected.

## Current-to-target gaps

These are planning findings, not fixes made here and not necessarily regressions introduced by the latest pull.

| Area | Current | Target documentation decision |
| --- | --- | --- |
| Blank creation | Opening and ending are inserted automatically | S01/S02: exactly one title/configuration StoryTrunk outside playthrough; no playable content until explicitly authored |
| Type extensibility | Enum/schema and type conditionals across layers | S08: explicit versioned type contracts and registrations with consistent inputs/results |
| Graph termination | Invalid graphs are rejected using structural reachability and path-to-ending checks | S03: notify creator, disable unfinished branches and hide player options; propagate unsafe required outcomes upstream and validate a safe effective graph, including conditions/loops |
| Context ownership | Story provider wraps `story`, `user`, `save` | S04: documented logical Story/Player/User boundaries; no provider refactor in this task |
| Result input passing | Current save and latest named-StoryNode roll | S08: typed edge bindings with visit identity and persisted provenance |
| Cross-story keys | Local namespace enforced; no import implementation | S06: explicit verified export/import contracts and source selection |
| Account progress/rights | Profile projection and feature flags; achievement progression deferred | S03/S09: configured StoryLeaf rewards with issuer-backed facts, unique claims and live entitlement checks |
| Future types | Text/options, Video/options, Dice, Reveal, Comic | S11: documented GraphicNovel/Form/Battle/Ad contracts, still unimplemented |
| AI durability | Request-driven generation and browser placement queue | S10: durable jobs/reconciliation and conflict-aware draft placement |
| Documentation | Existing numbered specs, some historical naming/status/count drift | S12: canonical Story index, local reading links and review evidence |

## Original verification checkpoint

- Ran the repository's listed unit suite through the installed `vitest` executable: **15 files, 73 tests passed**, including 9 comic tests and 2 comic-drawing tests. This verifies the existing unit suite, not the new target capabilities.
- `pnpm check` could not start its normal chain: pnpm attempted dependency synchronization and hit an `EPERM` symlink permission error in the sandbox store.
- Ran the installed `tsc --noEmit` directly: failed with missing `@anthropic-ai/sdk` and `@anthropic-ai/sdk/helpers/zod` modules in this local install, plus related type errors in `services/api/copilot.ts` (implicit-any callback parameters and unknown error type). The dependency is declared in `package.json`; this does not establish a clean-install CI failure.
- Did not install/update dependencies, alter application code, start emulators, run a production build or exercise hosted providers/browser flows. Those checks are not claimed as passing. No data migration or live publication was performed.

Existing historical test counts in numbered docs remain dated evidence, not replacements for this review.

## Documentation review record

Reviewed root instructions, README, docs/04, 05, 09, 10, 16 and 17, the relevant portable/runtime/authoring code, and the new Story system contracts against decisions S01–S12. The final documentation impact is the new canonical Story set, scoped reading routes, contributor/PR review process and links/status corrections in existing specifications. Runtime gaps remain listed above; none were implemented here.

At the original review checkpoint, all 30 changed files were Markdown. The local link/anchor check passed 254 references, code fences were balanced, and `git diff --check` passed. Those documents contained 16 Mermaid diagrams (15 new, one existing); diagram source was reviewed for lifecycle and authority consistency, but automatic parsing/rendering was not performed because Mermaid tooling is absent from this checkout. That checkpoint preceded the user's subsequent request to commit and open a PR. No independent reviewer or merge enforcement was claimed.

## Terminology clarification review

The follow-up incorporates the user's explicit StoryTrunk, StoryNode, StoryLeaf and StoryBranch definitions into the [canonical glossary](terminology.md), S01–S03 and product decision C19. The trunk is the unique title/configuration root outside the playthrough; branches carry typed data/conditions; leaves configure end-of-path rewards. Unfinished paths notify the creator, disable their branches and hide their options from players. The safe-effective-graph and upstream required-outcome rules are documented design defaults supporting that requirement, not implemented features.

Read and cross-checked root/scoped instructions, CONTRIBUTING, the workflow, current docs/16 and 17, product vocabulary/decisions, and affected Story contracts/examples. Renamed the target rendering/type documents to use StoryNode terminology and updated their inbound links. This intermediate checkpoint was a documentation-only self-review. The user subsequently authorized code/storage/API renames with compatibility and then requested merging PR [architecture-documentation](https://github.com/rcereghini/storybranch/pull/10) after verification.

## Naming and compatibility review — October 24, 2026

The user expanded scope to code, UI, file, storage and API renames with support for existing data. S13/C20 and [naming compatibility](naming-compatibility.md) own this implementation boundary. Shared rendering, output evaluation, dice Roll/Next, graph validation, authorization, pinned saves, immutable editions and isolated child runs retain their behavior. StoryTrunk authoring, selective branch suppression, new types, rewards and context/import capabilities remain target work.

Documentation reviewed: root and scoped AGENTS, CONTRIBUTING, the workflow, Story index and terminology, current contract, Studio, architecture, nodes, rendering/types, contexts, keys, storage, AI, examples and S01–S13. All moved components and contracts retain the same ancestor instructions and their linked reading routes. Generic app views and list batches are distinguished from playable StoryNodes.

Verification on the final implementation:

- `pnpm check`: type checking, **76 unit tests across 16 files**, production build and metadata generation passed. The build retains its bundle-size advisory.
- Local Firebase Auth/Firestore/Storage emulators: **26 integration tests passed**, including legacy editions, saved/pending dice state, response formats, old command receipts, draft publication hashes, shared revisions, ownership, mixed-store pagination and canonical writes. Existing concurrency, authorization, server dice, publication, storage and AI failure/retry tests passed.
- Chrome browser checks passed at desktop/mobile sizes: StoryNode playback/dice/reload; reusable save/share/placement and old/new preview links; graph editing/layout/reload; Studio autosave/preview/publication, uploads and mocked AI assistance. Outdated panel selectors and upload confirmation expectations in browser checks were aligned with the current UI. Representative mobile Studio/shared-preview screenshots were inspected.
- Reviewed the final diff for naming-only gameplay changes. A TypeScript syntax-tree comparison of seven core domain/provider/renderer/editor-model files found no structural differences after ignoring names/text and equivalent import aliases; this supports the review and does not replace tests.
- Checked 44 changed Markdown documents and their local links/anchors; fences are balanced. The 18 Mermaid diagrams were reviewed as source, with no automatic rendering/parsing claim.

The initial dependency problem was resolved with a frozen-lockfile install using the system certificate store; dependency versions and the lockfile are unchanged. No live database migration or destructive rewrite was run. Hosted providers and physical mobile browsers were not exercised in this follow-up. Review is self-review; independent review is not claimed. Markdown instructions and review templates establish the reading agreement; automated reading gates and branch-protection administration remain deferred.
