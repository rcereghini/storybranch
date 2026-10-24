# Storybranch implementation rules

## Required documentation before planning or editing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [the documentation workflow](docs/development-workflow.md). For every file in scope, discover and read applicable `AGENTS.md` files from the repository root through its parent directory, even when the session started at the root. Follow their documentation links before proposing a plan. Repeat this when scope expands. A sibling Markdown file is required when linked by those instructions; do not assume the tool automatically loads arbitrary sibling documents.

For stories, page types, rendering, authoring, routing, conditions, keys, contexts or save contracts, read [the Story system index](docs/story-system/README.md), its task-specific reading set, and [the current Story/Page contract](docs/16-story-pages.md). The index owns document precedence. The Story system documents define the target architecture; `docs/16-story-pages.md` records current behavior and enduring runtime invariants. Older node-only design notes are historical; the new StoryNode vocabulary does not restore that removed format.

Before implementation, name the documents read, the invariants that constrain the change, and any current-to-target gap in the plan or work summary. Before committing, complete the documentation-impact review in `CONTRIBUTING.md`. New directories and moved files must retain a discoverable documentation route. These are contributor/agent requirements, not an installed Git hook or proof that a file was read.

## Runtime invariants

- Every page renderer MUST be a child of the shared `Page` component and run within a `Story` context. Do not introduce stand-alone screens that bypass the Page lifecycle.
- Transient notifications must not shift the player layout. Dice results replace the centered dice display in reserved space and appear only on their pending dice page; history belongs in the story log.
- Loading feedback across the app must use a fixed overlay or reserved content placeholder, never an inserted banner above content. Existing video transitions retain their frame without a visible global loading box.
- Every new page type MUST declare its typed input, completion trigger, and output destinations before implementation. Document these in the page-type table in `docs/16-story-pages.md` and validate the shape in the portable contracts/domain layer.
- Output routing, conditions, dice and future battle results MUST be validated by the server. Renderers emit intent; they cannot supply trusted destinations, stats, or random outcomes.
- Text: Next clicks its single output. Video: auto mode completes OR Next triggers its single output; continue mode requires explicit Continue. Options: only a chosen option triggers its selected output. Dice: Roll persists/displays a result; a separate Next follows Pass or Fail. Never silently collapse dice back to immediate routing.
- A page resolves to another page, or closes its story/branch. Closed branches return to their parent; closed stories offer replay and other-story recommendations. Starting another story creates separate context/save state. No terminal dead ends.
- Story owns context and receives an explicit user projection (stats, achievements, save references); account credentials and SDK objects do not belong in portable contracts.
- Keep domain/contracts free of React, Firebase, browser and Node APIs. Preserve idempotent commands, immutable published editions, version-pinned saves, and isolated side quests.
- Do not retain obsolete page types or implicit video fallbacks for prototype compatibility. Publish a new edition when a manifest changes; never rewrite an immutable edition or delete user data as a shortcut.
- New types require domain checks for output routing, server checks for authority/retry/persistence, and a browser flow through the shared Page wrapper. Document any verification limits. Future turn-based RPG battles follow this same contract; combat is not implemented yet.

## Code Review Rules

- Flag Story renderers that bypass `Story`/`Page`, client-authored trusted outcomes, or silent dice Roll-to-route transitions. Follow the shared lifecycle and authoritative command path.
- Flag edits to immutable editions, implicit save migration, or unrestricted cross-story/account state imports. Require the documented versioning and import contracts.
- Flag new types or changed context/routing semantics without a corresponding type contract, decision update and verification evidence. Identify the violated rule and behavior; a checked documentation box alone is insufficient evidence.
- Treat roadmap types and target schemas as unimplemented until code and verification support them. Do not reject an unrelated change solely because a documented future feature is absent.
