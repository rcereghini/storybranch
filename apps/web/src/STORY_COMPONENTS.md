# Story component documentation

Read this guide before planning Story-related work in this directory or any descendant. The [Story system index](../../../docs/story-system/README.md) defines target architecture and reading sets; [the current Story/StoryNode contract](../../../docs/16-story-nodes.md) records shipped behavior. New StoryNodes do not introduce a second player hierarchy.

Follow [the canonical terminology](../../../docs/story-system/terminology.md): Story, StoryTrunk, StoryNode, StoryBranch and StoryLeaf. The portable `StoryNode` data type and shared `StoryNode` rendering component describe the same graph placement; alias the type locally as `StoryNodeData` when both are imported. In-story StoryBranch navigation does not create a child Story save.

| Component responsibility | Current entry points | Read |
| --- | --- | --- |
| Player session and transitions | `player-session.ts`, `transition-timing.ts`, `main.tsx` | [Player runtime](../../../docs/story-system/player-runtime.md) |
| Context composition | `Story.tsx`, `main.tsx` | [architecture](../../../docs/story-system/architecture.md), [StoryContext](../../../docs/story-system/story-context.md), [PlayerContext](../../../docs/story-system/player-context.md), [UserContext](../../../docs/story-system/user-context.md) |
| StoryNode lifecycle and rendering | `StoryNode.tsx`, `ScenePlayer.tsx`, `ComicStrip.tsx`, `DiceRoll.tsx`, `d20-scene.ts`, `d20-geometry.ts`, `SharedStoryNode.tsx`, `StoryLeafSummary.tsx`, player CSS | [StoryNode rendering](../../../docs/story-system/node-rendering.md), [type contracts](../../../docs/story-system/node-types.md) |
| Authoring and reusable content | `Studio.tsx`, `studio-model.ts`, `StoryGraph.tsx`, `StoryOutline.tsx`, `ComicEditor.tsx`, `Library.tsx`, `StoryLeafEditor.tsx` | [StoryNodes](../../../docs/story-system/story-nodes.md), [Creator Studio](../../../docs/17-creator-studio.md) |
| AI and media authoring | `StudioAssist.tsx`, `ComicCompanion.tsx`, `comic-drawing.ts`, asset tools | [AI boundaries](../../../docs/story-system/ai-authoring.md), [data/storage](../../../docs/story-system/data-storage.md) |
| Progress and access | `Adventures.tsx`, `Dashboard.tsx`, `Achievements.tsx`, profile/auth adapters | [PlayerContext](../../../docs/story-system/player-context.md), [UserContext](../../../docs/story-system/user-context.md), [keys](../../../docs/story-system/keys.md) |

Names are navigation aids, not an exhaustive allowlist. A new renderer, hook, selector or nested component must follow the contract for its responsibility. UI previews are disposable and use the same `Story`/`StoryNode` lifecycle; only the server commits real progress.

Record the relevant documents and invariants in the plan/work summary and the [pre-commit review](../../../CONTRIBUTING.md). Do not copy the full canonical specification next to each component.

`StoryProgressEditor.tsx` authors persistent Player + Story key definitions in StoryTrunk. Read [keys](../../../docs/story-system/keys.md#first-implementation-persistent-story-progress) and [Creator Studio](../../../docs/17-creator-studio.md) before changing it or its branch-condition controls.

`StoryKeyImports.tsx` authors pinned persistent-key imports; `StoryProgressEditor.tsx` declares export destinations, and `main.tsx` presents start-time consent. Read [S19 imports](../../../docs/story-system/keys.md#persistent-key-imports-s19) before changing these paths. Imported snapshots stay server-only and are separate from local effects.

`StoryKeyImports.tsx` also exposes run-local exports and import selection mode. `StoryImportConsent.tsx` owns consent and the bounded completed-source-journey picker, launched by `main.tsx`. Read [S20 continuity](../../../docs/story-system/keys.md#selected-completed-run-imports-s20); keep source inventory/provenance out of browser responses and never preselect a source run.

`StoryInvitations.tsx` provides creator invitation controls and Story-detail redemption. Follow [invitation entry](../../../docs/story-system/keys.md#invitation-entry-contract), [UserContext](../../../docs/story-system/user-context.md) and Studio guidance. This live entry policy is separate from draft/edition changes and never promises media confidentiality or subscription enforcement.

`main.tsx` also launches `StoryImportConsent.tsx` for community side Stories, supplying the parent-scoped source-list endpoint. Follow [S21 child imports](../../../docs/story-system/keys.md#community-side-story-imports-s21); do not reuse parent consent or import state. `services/api/side-story.ts` shares authorization between the offer/list reads and committing command.

S22 extends StoryProgressEditor.tsx with exclusive threshold/approved-achievement triggers and Achievements.tsx with published reward bindings in creator/admin views. Read [achievement key policy](../../../docs/story-system/keys.md#achievement-bound-persistent-keys-s22). StoryLeafSummary.tsx retains the existing newly earned persistent-key presentation inside the shared StoryNode lifecycle.

StoryKeys.tsx provides the private earned-key history in Adventures using packages/contracts/story-progress.ts and services/api/story-key-history.ts. Read [S23 history](../../../docs/story-system/keys.md#earned-story-key-history-s23), UserContext and storage guidance. Mount it by account identity, isolate each selected Story request, retain retry cursors, and keep future/unearned definitions out of its response.

StoryKeys.tsx also provides `StoryEntryKeys`, a separate redeemed invitation list. Read [S24 invitation history](../../../docs/story-system/keys.md#private-invitation-key-history-s24); keep it account-mounted, preserve pagination on retry, and navigate to Story details without bypassing entry checks.

`PreviewKeys.tsx` and `packages/domain/preview.ts` implement disposable declared-key scenarios and creator-only option diagnostics for Studio. Read [S25](../../../docs/story-system/keys.md#key-aware-disposable-previews-s25). Never attach this diagnostic surface or simulated snapshots to published playback; scenario changes restart through the shared Story/StoryNode lifecycle.
