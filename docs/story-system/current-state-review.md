# Project review after the main pull

Reviewed October 23, 2026 (America/Phoenix). Working tree initially clean; `main`, `origin/main` and `origin/HEAD` pointed to `49c2ac6`. Local reflog identifies the latest fast-forward as `ea6a32b` → `49c2ac6`. This is a focused source/architecture review, not a complete security audit or a hosted browser acceptance run.

## Latest pulled changes

| Commit | Change | Architecture implications |
| --- | --- | --- |
| `455af94` | Comic pages with square grid or scrolling strip | Adds the seventh page type through contracts, domain validation, shared Page renderer, Studio and publication asset checks |
| `f439204` | Comic companion and daily generation limit 100 | Adds bounded script/cast/panel suggestions and coordinated asset generation; quotas remain server-checked |
| `49c2ac6` | Background comic drawing, status pill and finish notification | Component-independent browser state survives in-app navigation; reload stops placement coordination |

The range touches 31 files. Earlier recent work already supplied image generation, outline/writing assistance, page library, Studio editing and updated player surfaces. No code in that range was changed by this documentation task.

## Current architecture inspected

- [Story provider](../../apps/web/src/Story.tsx) composes story metadata, a safe user projection and one save. [Page](../../apps/web/src/Page.tsx) dispatches common outputs and hosts text, video, dice, reveal and comic presentation; [ComicStrip](../../apps/web/src/ComicStrip.tsx) is its child.
- [Portable contracts](../../packages/contracts/index.ts) define seven page enums, bounded conditions/effects, `PageInput`, `PageOutput`, local state and versioned saves. The schema is still explicitly page-based.
- [Domain engine](../../packages/domain/index.ts) validates outputs, applies local effects, persists a pending dice result before continuation and enforces story namespaces. [Publication validation](../../packages/domain/authoring.ts) additionally rejects unreachable placements and nodes with no structural path to an ending.
- [API handler](../../services/api/handler.ts), [authoring service](../../services/api/authoring.ts) and [storage paths](../../services/api/paths.ts) enforce server commands, receipts, publishing and owned state. Comic panels join normal published image validation and media projection.
- [Studio model](../../apps/web/src/studio-model.ts) currently creates opening/ending starter nodes in `blankStory`; [comic drawing](../../apps/web/src/comic-drawing.ts) coordinates generation in browser memory. It is not a durable queue.
- [CI](../../.github/workflows/check.yml) runs application type/unit/build and emulator/browser checks. No documentation-impact or mandatory reading gate was found in the repository workflow. Remote branch protections were not inspected.

## Current-to-target gaps

These are planning findings, not fixes made here and not necessarily regressions introduced by the latest pull.

| Area | Current | Target documentation decision |
| --- | --- | --- |
| Blank creation | Opening and ending are inserted automatically | S02: empty draft; explicit templates |
| Type extensibility | Enum/schema and type conditionals across layers | S08: explicit versioned type contracts and registrations with consistent inputs/results |
| Graph termination | Structural reachability and path-to-ending checks | S03: additionally safe conditional states, usable fallbacks and bounded automatic cycles |
| Context ownership | Story provider wraps `story`, `user`, `save` | S04: documented logical Story/Player/User boundaries; no provider refactor in this task |
| Result input passing | Current save and latest named-page roll | S08: typed edge bindings with visit identity and persisted provenance |
| Cross-story keys | Local namespace enforced; no import implementation | S06: explicit verified export/import contracts and source selection |
| Account progress/rights | Profile projection and feature flags; achievement progression deferred | S09: issuer-backed facts, unique claims and live entitlement checks |
| Future types | Text/options, Video/options, Dice, Reveal, Comic | S11: documented GraphicNovel/Form/Battle/Ad contracts, still unimplemented |
| AI durability | Request-driven generation and browser placement queue | S10: durable jobs/reconciliation and conflict-aware draft placement |
| Documentation | Existing numbered specs, some historical naming/status/count drift | S12: canonical Story index, local reading links and review evidence |

## Verification performed

- Ran the repository's listed unit suite through the installed `vitest` executable: **15 files, 73 tests passed**, including 9 comic tests and 2 comic-drawing tests. This verifies the existing unit suite, not the new target capabilities.
- `pnpm check` could not start its normal chain: pnpm attempted dependency synchronization and hit an `EPERM` symlink permission error in the sandbox store.
- Ran the installed `tsc --noEmit` directly: failed with missing `@anthropic-ai/sdk` and `@anthropic-ai/sdk/helpers/zod` modules in this local install, plus related type errors in `services/api/copilot.ts` (implicit-any callback parameters and unknown error type). The dependency is declared in `package.json`; this does not establish a clean-install CI failure.
- Did not install/update dependencies, alter application code, start emulators, run a production build or exercise hosted providers/browser flows. Those checks are not claimed as passing. No data migration or live publication was performed.

Existing historical test counts in numbered docs remain dated evidence, not replacements for this review.

## Documentation review record

Reviewed root instructions, README, docs/04, 05, 09, 10, 16 and 17, the relevant portable/runtime/authoring code, and the new Story system contracts against decisions S01–S12. The final documentation impact is the new canonical Story set, scoped reading routes, contributor/PR review process and links/status corrections in existing specifications. Runtime gaps remain listed above; none were implemented here.

All 30 changed files are Markdown. The local link/anchor check passed 254 references, code fences are balanced, and `git diff --check` passed. The changed documents contain 16 Mermaid diagrams (15 new, one existing); diagram source was reviewed for lifecycle and authority consistency, but automatic parsing/rendering was not performed because Mermaid tooling is absent from this checkout. No independent reviewer or merge enforcement is claimed. This is a self-review record; no commit or push was made.
