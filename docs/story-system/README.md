# Story system documentation

Status: architecture established October 23, 2026, with the player runtime implementation described in [player runtime](player-runtime.md). Other target capabilities remain explicitly deferred. The [current-state review](current-state-review.md) records what was inspected and verified at `49c2ac6`; [docs/16-story-nodes.md](../16-story-nodes.md) remains the current implementation contract.

A **Story** contains a **StoryTrunk**, connected **StoryNodes**, their **StoryBranches**, and **StoryLeaves**. Every published StoryNode connects to the trunk, other nodes and/or leaves, and may have several outgoing StoryBranches. A StoryLeaf completes the current Story run. Read [the canonical terminology](terminology.md) before interpreting any of these concepts; it distinguishes narrative relationships from existing code names and separately authored community side Stories.

StoryNode renderers run inside the shared `StoryNode` component and `Story` provider. The portable data type and shared component both use `StoryNode`. Each Story has exactly one StoryTrunk: its title/configuration root outside the playthrough. `StoryTrunk` is a typed configuration projection of root metadata and optional versioned starting-key definitions; see the [implementation contract](story-nodes.md#storytrunk-and-safe-publication-implementation). StoryLeaves configure end-of-path rewards; StoryBranches can carry typed data and conditions.

## Authority and status

For present-day delivery status and remaining work, use [the maintained roadmap](../roadmap.md). The October 23 review is a historical checkpoint. [S32 StoryBranch data](branch-data.md) owns the bounded constant/Dice input-binding implementation and its remaining gaps.

| Document set | Owns | Interpretation |
| --- | --- | --- |
| Root/scoped `AGENTS.md`, [CONTRIBUTING](../../CONTRIBUTING.md), [workflow](../development-workflow.md) | How developers and agents discover and review contracts | Required working agreement |
| [Terminology](terminology.md) | Story, StoryTrunk, StoryNode, StoryBranch and StoryLeaf meanings | Canonical vocabulary; implementation identifiers are explicitly mapped |
| This directory and [Story decisions](decisions.md) | Target StoryNode, context, key, lifecycle and storage design | Follow for new design; unimplemented features remain explicitly labeled |
| [Story/StoryNode contract](../16-story-nodes.md), [Studio](../17-creator-studio.md), [current-state review](current-state-review.md) | Existing behavior, names and verification evidence | Use to assess implementation gaps and compatibility; do not infer target support |
| [Product decision register](../10-decisions-and-open-questions.md) and numbered product docs | Product requirements, commercial policies and historical milestones | Story-specific target decisions below supersede conflicting early node-only sketches; unrelated product decisions retain ownership |

The user's current instruction governs scope. Within the docs, the topic owner below is canonical; examples and diagrams illustrate it and must be updated with it. If two current requirements conflict, record and resolve the conflict before dependent implementation. Do not silently choose whichever is convenient. Historical dates and test counts are not present-day guarantees.

**Target rule** means a requirement for future implementation, not a claim it exists. **Current** means supported by the reviewed source. **Deferred** means a type or capability is reserved but cannot yet be authored/published through the current API. Design defaults are identified in [decisions](decisions.md); unresolved commercial and privacy policy remains an explicit release gate.

## Read by task

Always read this index, [terminology](terminology.md) and [the current contract](../16-story-nodes.md), then the union of relevant rows:

| Task | Canonical documents |
| --- | --- |
| Understand or change system boundaries | [Architecture](architecture.md), [decisions](decisions.md) |
| Create nodes, graph connections, blank stories, library placements | [StoryNodes](story-nodes.md), [types](node-types.md), [examples](examples.md) |
| Render a StoryNode, add a type, change completion or transitions | [Player runtime](player-runtime.md), [StoryNode rendering](node-rendering.md), [types](node-types.md), [StoryNodes](story-nodes.md) |
| Story definitions and runtime composition | [StoryContext](story-context.md), [architecture](architecture.md) |
| Design or implement TurnBasedBattle | [Battle S35 and portable S35a](battle.md), [types](node-types.md), [PlayerContext](player-context.md), [StoryBranch data](branch-data.md), [storage](data-storage.md), [rendering](node-rendering.md) |
| Saves, visits, rolls, battle state and replay | [PlayerContext](player-context.md), [data/storage](data-storage.md) |
| Accounts, account progress and safe user projection | [UserContext](user-context.md), [keys](keys.md) |
| Keys, items, achievements, subscriptions, sequels | [Keys and imports](keys.md), [UserContext](user-context.md), [PlayerContext](player-context.md) |
| Naming, legacy records/clients, API format negotiation | [Naming compatibility](naming-compatibility.md), [data/storage](data-storage.md) |
| Persistence, APIs, publication, migrations and authorization | [Data/storage](data-storage.md), [architecture](architecture.md), affected context docs |
| AI assistance, generated content and editor expansion | [AI authoring](ai-authoring.md), [StoryNodes](story-nodes.md), [types](node-types.md) |
| Planning or reviewing a change | [Workflow](../development-workflow.md), [current-state review](current-state-review.md), [decisions](decisions.md), affected topic docs |

## Core rules to preserve

- StoryNodes share a typed envelope and explicit output bindings. Each bound route is a StoryBranch. Branch numbers are display ordinals; persisted routes use stable IDs.
- Creators can save a blank Story containing only its StoryTrunk. Publishing requires a safe start, supported types and a validated effective playable graph; incomplete draft paths remain preserved and diagnosed.
- Every renderer is inside `Story` and the shared `StoryNode` lifecycle. Dice persists the roll, then waits for a separate Next.
- Every playable StoryNode connects into the graph from the unique StoryTrunk. Every enabled StoryBranch has a destination in its pinned edition and can reach a StoryLeaf; conditional states and loops must not create unavoidable traps. Notify the creator of unfinished paths, disable their branches and hide their options from players; propagate required-outcome failures upstream. Preview/new publication implement conservative selective suppression; conditional-only exits and unsafe required outcomes are excluded. Existing editions are unchanged.
- StoryContext holds the edition and its definitions. PlayerContext holds one run. UserContext holds account-level facts. The `Story` UI provider composes safe views of these without transferring ownership.
- Cross-story keys require explicit export/import contracts and server evidence. Account entitlements are validated by their issuer; a story cannot mint premium access.
- Commands are authorized, revision-checked and idempotent. Published editions are immutable; saves remain version-pinned; child runs remain isolated.

See [examples](examples.md) for the requested video → options → dice → ending story, context composition, sequels and future battle inputs. See [architecture](architecture.md), [keys](keys.md), [data/storage](data-storage.md) and [AI authoring](ai-authoring.md) for their flow charts.
