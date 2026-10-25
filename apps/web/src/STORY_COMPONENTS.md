# Story component documentation

Read this guide before planning Story-related work in this directory or any descendant. The [Story system index](../../../docs/story-system/README.md) defines target architecture and reading sets; [the current Story/StoryNode contract](../../../docs/16-story-nodes.md) records shipped behavior. New StoryNodes do not introduce a second player hierarchy.

Follow [the canonical terminology](../../../docs/story-system/terminology.md): Story, StoryTrunk, StoryNode, StoryBranch and StoryLeaf. The portable `StoryNode` data type and shared `StoryNode` rendering component describe the same graph placement; alias the type locally as `StoryNodeData` when both are imported. In-story StoryBranch navigation does not create a child Story save.

| Component responsibility | Current entry points | Read |
| --- | --- | --- |
| Player session and transitions | `player-session.ts`, `transition-timing.ts`, `main.tsx` | [Player runtime](../../../docs/story-system/player-runtime.md) |
| Context composition | `Story.tsx`, `main.tsx` | [architecture](../../../docs/story-system/architecture.md), [StoryContext](../../../docs/story-system/story-context.md), [PlayerContext](../../../docs/story-system/player-context.md), [UserContext](../../../docs/story-system/user-context.md) |
| StoryNode lifecycle and rendering | `StoryNode.tsx`, `ScenePlayer.tsx`, `ComicStrip.tsx`, `SharedStoryNode.tsx`, player CSS | [StoryNode rendering](../../../docs/story-system/node-rendering.md), [type contracts](../../../docs/story-system/node-types.md) |
| Authoring and reusable content | `Studio.tsx`, `studio-model.ts`, `StoryGraph.tsx`, `StoryOutline.tsx`, `ComicEditor.tsx`, `Library.tsx` | [StoryNodes](../../../docs/story-system/story-nodes.md), [Creator Studio](../../../docs/17-creator-studio.md) |
| AI and media authoring | `StudioAssist.tsx`, `ComicCompanion.tsx`, `comic-drawing.ts`, asset tools | [AI boundaries](../../../docs/story-system/ai-authoring.md), [data/storage](../../../docs/story-system/data-storage.md) |
| Progress and access | `Adventures.tsx`, `Dashboard.tsx`, profile/auth adapters | [PlayerContext](../../../docs/story-system/player-context.md), [UserContext](../../../docs/story-system/user-context.md), [keys](../../../docs/story-system/keys.md) |

Names are navigation aids, not an exhaustive allowlist. A new renderer, hook, selector or nested component must follow the contract for its responsibility. UI previews are disposable and use the same `Story`/`StoryNode` lifecycle; only the server commits real progress.

Record the relevant documents and invariants in the plan/work summary and the [pre-commit review](../../../CONTRIBUTING.md). Do not copy the full canonical specification next to each component.
