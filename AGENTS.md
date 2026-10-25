# Storybranch implementation rules

## Required documentation before planning or editing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [the documentation workflow](docs/development-workflow.md). For every file in scope, discover and read applicable `AGENTS.md` files from the repository root through its parent directory, even when the session started at the root. Follow their documentation links before proposing a plan. Repeat this when scope expands. A sibling Markdown file is required when linked by those instructions; do not assume the tool automatically loads arbitrary sibling documents.

For stories, StoryNode types, rendering, authoring, routing, conditions, keys, contexts or save contracts, read [the Story system index](docs/story-system/README.md), its task-specific reading set, and [the current Story/StoryNode contract](docs/16-story-nodes.md). The index owns document precedence. The Story system documents define the target architecture; `docs/16-story-nodes.md` records current behavior and enduring runtime invariants. Older node-only design notes are historical; the new StoryNode vocabulary does not restore that removed format.

Use [the canonical terminology](docs/story-system/terminology.md): **Story**, **StoryTrunk**, **StoryNode**, **StoryBranch**, **StoryLeaf**. Every published StoryNode connects to the trunk, other nodes and/or leaves and may have several outgoing StoryBranches. Use the same names in domain types, components, UI labels, fields and documentation. Legacy spellings belong only in the compatibility boundary and its tests; external protocol/API constants retain their required spelling. Distinguish in-story StoryBranches from separately authored community side Stories and their isolated runs.

For target design, each Story has exactly one StoryTrunk: its title/configuration root outside the playthrough. StoryBranches can carry typed data and conditions; StoryLeaves configure end-of-path rewards. Every enabled StoryBranch must reach a StoryLeaf. Notify the creator of unfinished paths, disable their branches and hide their options from players; propagate unsafe required outcomes upstream and enforce availability on the server. Studio now exposes StoryTrunk configuration, blank drafts and conservative effective-graph compilation for preview/new publication. Follow the implementation policy in docs/story-system/story-nodes.md; existing immutable editions must not be recompiled. Typed bindings, broader context definitions and generalized leaf rewards remain target work.

Before implementation, name the documents read, the invariants that constrain the change, and any current-to-target gap in the plan or work summary. Before committing, complete the documentation-impact review in `CONTRIBUTING.md`. New directories and moved files must retain a discoverable documentation route. These are contributor/agent requirements, not an installed Git hook or proof that a file was read.

## Runtime invariants

- Every StoryNode renderer MUST be a child of the shared `StoryNode` component and run within a `Story` context. Do not introduce stand-alone screens that bypass the StoryNode lifecycle.
- Transient notifications must not shift the player layout. Dice results replace the centered dice display in reserved space and appear only on their pending dice StoryNode; history belongs in the story log.
- Loading feedback across the app must use a fixed overlay or reserved content placeholder, never an inserted banner above content. Existing video transitions retain their frame without a visible global loading box.
- Every new StoryNode type MUST declare its typed input, completion trigger, and output destinations before implementation. Document these in the StoryNode-type table in `docs/16-story-nodes.md` and validate the shape in the portable contracts/domain layer.
- Output routing, conditions, dice and future battle results MUST be validated by the server. Renderers emit intent; they cannot supply trusted destinations, stats, or random outcomes.
- Text: Next clicks its single output. Video: auto mode completes OR Next triggers its single output; continue mode requires explicit Continue. Options: only a chosen option triggers its selected output. Dice: Roll persists/displays a result; a separate Next follows Pass or Fail. Never silently collapse dice back to immediate routing.
- A StoryNode's selected StoryBranch leads to another StoryNode or a StoryLeaf. Entering a StoryLeaf completes the current run. Completed child Stories offer return to their parent; completed Stories offer replay and other-story recommendations. Starting another Story creates separate context/save state. Ordinary StoryBranches do not create or close separate runs. No terminal dead ends.
- Story owns context and receives an explicit user projection (stats, achievements, save references); account credentials and SDK objects do not belong in portable contracts.
- Keep domain/contracts free of React, Firebase, browser and Node APIs. Preserve idempotent commands, immutable published editions, version-pinned saves, and isolated side quests.
- Do not retain obsolete StoryNode types or implicit video fallbacks for prototype compatibility. Publish a new edition when a manifest changes; never rewrite an immutable edition or delete user data as a shortcut.
- New types require domain checks for output routing, server checks for authority/retry/persistence, and a browser flow through the shared StoryNode wrapper. Document any verification limits. Future turn-based RPG battles follow this same contract; combat is not implemented yet.

## Code Review Rules

- Flag Story renderers that bypass `Story`/`StoryNode`, client-authored trusted outcomes, or silent dice Roll-to-route transitions. Follow the shared lifecycle and authoritative command path.
- Flag edits to immutable editions, implicit save migration, or unrestricted cross-story/account state imports. Require the documented versioning and import contracts.
- Flag new types or changed context/routing semantics without a corresponding type contract, decision update and verification evidence. Identify the violated rule and behavior; a checked documentation box alone is insufficient evidence.
- Treat roadmap types and target schemas as unimplemented until code and verification support them. Do not reject an unrelated change solely because a documented future feature is absent.
- Flag new domain terminology that conflicts with the glossary, disconnected published StoryNodes, or documentation that treats every StoryBranch as a separate child Story. Preserve exact code/API names when documenting the current implementation.
