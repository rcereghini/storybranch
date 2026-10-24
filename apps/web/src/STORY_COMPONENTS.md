# Story component documentation

Read this guide before planning Story-related work in this directory or any descendant. The [Story system index](../../../docs/story-system/README.md) defines target architecture and reading sets; [the current Story/Page contract](../../../docs/16-story-pages.md) records shipped behavior. New StoryNodes do not introduce a second player hierarchy.

| Component responsibility | Current entry points | Read |
| --- | --- | --- |
| Context composition | `Story.tsx`, `main.tsx` | [architecture](../../../docs/story-system/architecture.md), [StoryContext](../../../docs/story-system/story-context.md), [PlayerContext](../../../docs/story-system/player-context.md), [UserContext](../../../docs/story-system/user-context.md) |
| Page lifecycle and rendering | `Page.tsx`, `ScenePlayer.tsx`, `ComicStrip.tsx`, `SharedPage.tsx`, player CSS | [StoryPage](../../../docs/story-system/story-page.md), [type contracts](../../../docs/story-system/page-types.md) |
| Authoring and reusable content | `Studio.tsx`, `studio-model.ts`, `StoryGraph.tsx`, `StoryOutline.tsx`, `ComicEditor.tsx`, `Library.tsx` | [StoryNodes](../../../docs/story-system/story-nodes.md), [Creator Studio](../../../docs/17-creator-studio.md) |
| AI and media authoring | `StudioAssist.tsx`, `ComicCompanion.tsx`, `comic-drawing.ts`, asset tools | [AI boundaries](../../../docs/story-system/ai-authoring.md), [data/storage](../../../docs/story-system/data-storage.md) |
| Progress and access | `Adventures.tsx`, `Dashboard.tsx`, profile/auth adapters | [PlayerContext](../../../docs/story-system/player-context.md), [UserContext](../../../docs/story-system/user-context.md), [keys](../../../docs/story-system/keys.md) |

Names are navigation aids, not an exhaustive allowlist. A new renderer, hook, selector or nested component must follow the contract for its responsibility. UI previews are disposable and use the same `Story`/`Page` lifecycle; only the server commits real progress.

Record the relevant documents and invariants in the plan/work summary and the [pre-commit review](../../../CONTRIBUTING.md). Do not copy the full canonical specification next to each component.
