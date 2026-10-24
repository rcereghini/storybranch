# Story system documentation

Status: target architecture for future Story work, established October 23, 2026. This change is documentation-only. The [current-state review](current-state-review.md) records what was inspected and verified at `49c2ac6`; [docs/16-story-pages.md](../16-story-pages.md) remains the current implementation contract.

A **Story** is a versioned graph of **StoryNodes**. A node is a placement with typed inputs and named outputs. **StoryPage** is the player-facing presentation of that node, rendered inside the shared **Page** component and **Story** provider. A **StoryLeaf** deliberately completes the current story or child branch. These names describe one system, not parallel node and page engines.

## Authority and status

| Document set | Owns | Interpretation |
| --- | --- | --- |
| Root/scoped `AGENTS.md`, [CONTRIBUTING](../../CONTRIBUTING.md), [workflow](../development-workflow.md) | How developers and agents discover and review contracts | Required working agreement |
| This directory and [Story decisions](decisions.md) | Target StoryNode, context, key, lifecycle and storage design | Follow for new design; unimplemented features remain explicitly labeled |
| [Story/Page contract](../16-story-pages.md), [Studio](../17-creator-studio.md), [current-state review](current-state-review.md) | Existing behavior, names and verification evidence | Use to assess implementation gaps and compatibility; do not infer target support |
| [Product decision register](../10-decisions-and-open-questions.md) and numbered product docs | Product requirements, commercial policies and historical milestones | Story-specific target decisions below supersede conflicting early node-only sketches; unrelated product decisions retain ownership |

The user's current instruction governs scope. Within the docs, the topic owner below is canonical; examples and diagrams illustrate it and must be updated with it. If two current requirements conflict, record and resolve the conflict before dependent implementation. Do not silently choose whichever is convenient. Historical dates and test counts are not present-day guarantees.

**Target rule** means a requirement for future implementation, not a claim it exists. **Current** means supported by the reviewed source. **Deferred** means a type or capability is reserved but cannot yet be authored/published through the current API. Design defaults are identified in [decisions](decisions.md); unresolved commercial and privacy policy remains an explicit release gate.

## Read by task

Always read this index and [the current contract](../16-story-pages.md), then the union of relevant rows:

| Task | Canonical documents |
| --- | --- |
| Understand or change system boundaries | [Architecture](architecture.md), [decisions](decisions.md) |
| Create nodes, graph connections, blank stories, library placements | [StoryNodes](story-nodes.md), [types](page-types.md), [examples](examples.md) |
| Render a page, add a type, change completion or transitions | [StoryPage lifecycle](story-page.md), [types](page-types.md), [StoryNodes](story-nodes.md) |
| Story definitions and runtime composition | [StoryContext](story-context.md), [architecture](architecture.md) |
| Saves, visits, rolls, battle state and replay | [PlayerContext](player-context.md), [data/storage](data-storage.md) |
| Accounts, account progress and safe user projection | [UserContext](user-context.md), [keys](keys.md) |
| Keys, items, achievements, subscriptions, sequels | [Keys and imports](keys.md), [UserContext](user-context.md), [PlayerContext](player-context.md) |
| Persistence, APIs, publication, migrations and authorization | [Data/storage](data-storage.md), [architecture](architecture.md), affected context docs |
| AI assistance, generated content and editor expansion | [AI authoring](ai-authoring.md), [StoryNodes](story-nodes.md), [types](page-types.md) |
| Planning or reviewing a change | [Workflow](../development-workflow.md), [current-state review](current-state-review.md), [decisions](decisions.md), affected topic docs |

## Core rules to preserve

- StoryNodes share a typed envelope and explicit output bindings. Branch numbers are display ordinals; persisted routes use stable IDs.
- Creators can save a genuinely empty draft. Publishing requires a valid entry, supported types and a complete graph that can terminate safely.
- Every renderer is inside `Story` and the shared `Page` lifecycle. Dice persists the roll, then waits for a separate Next.
- Every authored output has a destination in its pinned edition. Every branch can reach a StoryLeaf; conditional states and loops must not create unavoidable traps.
- StoryContext holds the edition and its definitions. PlayerContext holds one run. UserContext holds account-level facts. The `Story` UI provider composes safe views of these without transferring ownership.
- Cross-story keys require explicit export/import contracts and server evidence. Account entitlements are validated by their issuer; a story cannot mint premium access.
- Commands are authorized, revision-checked and idempotent. Published editions are immutable; saves remain version-pinned; child runs remain isolated.

See [examples](examples.md) for the requested video → options → dice → ending story, context composition, sequels and future battle inputs. See [architecture](architecture.md), [keys](keys.md), [data/storage](data-storage.md) and [AI authoring](ai-authoring.md) for their flow charts.
