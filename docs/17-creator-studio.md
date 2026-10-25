# Creator Studio alpha

This document describes current Studio behavior. Future authoring changes must also read [StoryNodes](story-system/story-nodes.md), [type contracts](story-system/node-types.md) and [AI authoring](story-system/ai-authoring.md). New Story starts blank. Starter, Quiz and Comic templates are explicit choices. Preview and publication compile a safe effective graph with creator diagnostics.

Use [the canonical Story vocabulary](story-system/terminology.md) for design: StoryTrunk, StoryNodes, StoryBranches and StoryLeaves. **StoryNodes**, **StoryNode type** and other current Studio labels below remain exact UI references. The target StoryTrunk is the single title/configuration root, outside the playthrough and selected by default for authoring Story details. Studio opens on StoryTrunk settings: title, description, start connection and local starting keys. The trunk is a typed projection of root metadata and versioned `trunkContext`, with no duplicate title or playable renderer.

Blank creation provides only that trunk. StoryBranches connect the root, playable StoryNodes and ending StoryLeaves, with explicit data mappings and conditions. StoryLeaves configure end-of-path rewards. An unfinished path triggers creator diagnostics; its StoryBranch is disabled and its option hidden from players. Valid remaining paths can be exposed only after upstream required-outcome checks leave a safe effective graph. Typed branch data mappings and generalized leaf rewards remain future work. The implemented conservative graph policy is described in [StoryTrunk and safe publication](story-system/story-nodes.md#storytrunk-and-safe-publication-implementation).

Open **Create** in the main navigation (or `/studio`) and sign in. The Studio StoryNode lists your drafts; **New story**, **New starter story**, **New quiz**, **New comic** or a draft opens the editor, which fills the window below the app header (the footer and phone tab bar step aside, and **←** returns to the drafts after saving). New Story has no placements and can be saved/reopened before connecting a start. New starter story explicitly inserts an opening and ending. An ending closes the story and uses the existing replay/recommendation shell.

## Editor layout

- **Top bar:** the story title (edit it in place), the save status, Undo/Redo, **Save draft**, **Preview**, **Play published story** (once published) and **Publish edition**.
- **StoryNodes** (left): the story as an outline in reading order, starting from the first StoryNode, with where each StoryNode's choices lead; StoryNodes nothing leads to yet are listed under "Not reachable yet". Selecting a StoryNode edits it and centers it on the map. The **Library** tab holds reusable StoryNodes.
- **Map** (center): the branching canvas (below).
- **Settings** (right): **StoryNode** edits the selected StoryNode (the **Edit StoryNode** selector switches StoryNodes); **StoryTrunk** holds the description, first StoryNode, starting keys, playable-path diagnostics, publishing notes and **Reload saved draft**. The title remains editable in the top bar. Starting keys are comma-separated lowercase names with hyphens, applied when the field loses focus and copied into each new run.

At 1100px and narrower one part fills the screen at a time, chosen with **StoryNodes · Map · Edit StoryNode**. Selecting a StoryNode in the outline or on the map opens its settings; **←** returns to where you came from.

**Saving.** Drafts save automatically two seconds after editing stops; Ctrl/Cmd+S saves at once, and **Publish edition** saves first. The status reads Unsaved changes, Saving…, All changes saved, Not saved (retried after eight seconds, or **Retry save**), Offline, or Changed elsewhere (a newer revision was saved from another tab; **Reload saved draft**). Edits made while a save is in flight are kept and saved next. A save interrupted by the network is resent with the same idempotency key. Because each save is a draft revision and an edition is named after the revision it publishes (`edition-{revision}`), edition numbers can skip.

**Undo.** Undo/Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y outside text fields) step through story, description and layout changes, up to 60 steps; quick successive edits such as typing count as one step. Text fields keep their own undo while focused. History resets when a draft is opened. Undo/Redo buttons show at 1241px and wider; the shortcuts work at any width.

## Story map

The map is a canvas: drag the background (or two-finger scroll on a trackpad) to move around; pinch, Ctrl/Cmd + scroll or **−/+** to zoom (25–160%); **Fit** shows the whole story; **◎** centers the selected StoryNode. The overview in the corner shows every StoryNode and the visible area; click or drag in it to move there. With the canvas focused, arrow keys pan, `+`/`-` zoom and `0` fits. It opens showing the whole story if it fits at a readable size, otherwise starting from the first StoryNode.

- **Add StoryNode** creates the selected StoryNode type. From a linear StoryNode it inserts the new StoryNode between that StoryNode and its previous destination; otherwise it creates a StoryNode you can connect to a branch. New non-ending StoryNodes lead to an existing ending by default.
- **Add branch** creates a new StoryNode and an option leading to it from the selected StoryNode. A linear text/video StoryNode becomes its options counterpart; existing choices and effects remain. Its library link is detached because its content/output slots changed.
- Select an output row on a card, then select the destination card to reconnect it. Pass/Fail and quiz result outputs are individually displayed. Quiz results can only connect to endings. Existing route effects and conditions are preserved. **Cancel connection** or Escape cancels selection.
- Drag a card by its type header to move it (positions are whole canvas pixels, independent of zoom). Keyboard users can focus that handle and use arrow keys in 24-pixel increments. Moving cards changes editor layout only; positions save with the draft and reloading restores them.
- **Arrange tree** lays out the graph from left to right. Branches may rejoin, and cycles are displayed without infinite layout traversal. Disconnected StoryNodes appear in a separate column.

## AI help

With the account's `copilot` feature (and `ANTHROPIC_API_KEY` on the server), StoryNode settings offer writing help under the text field:

- **Write it** drafts the StoryNode's text from the story title and description, up to three StoryNodes leading to it, and its outputs (**Write again** once it has text).
- **Rewrite** changes the existing text in a chosen way: tighter, more vivid, more suspense, lighter or darker tone, or a custom instruction.
- **Suggest choices** proposes up to three choices, each with a StoryNode title and text. **Add these choices** turns the StoryNode into its options type (a plain StoryNode's single Continue is replaced) and adds one new StoryNode per choice, each continuing to where the StoryNode led before.
- **Generate a StoryNode image** opens a dialog with a prompt drafted from the StoryNode (or **Write the prompt with AI**), a quality tier and shape; the image is generated through `/api/generation` (the `generate` feature and its daily limit), saved to the creator's assets and set as the StoryNode photo.

Suggestions open over the text field, so the panel never shifts, and change nothing until **Use this text** or **Add these choices**; an accepted suggestion is one undo step. `POST /api/assist` takes a strict command (`packages/contracts/assist.ts`): the action, an optional rewrite instruction and bounded story context sent by the browser (the draft may be unsaved). Story text is escaped and wrapped in tags as data, not instructions. The server calls Claude (`claude-opus-5-5`, low effort, structured output) and clamps the reply: text up to 10,000 characters, at most three choices, a prompt up to 1,800 characters. Requests share Copilot's daily limit of 100; a retry with the same key replays the stored suggestion, and a failed answer frees its key. Suggestions are never trusted state: they enter the draft only through the normal revision-checked save, and publication validates them like any other edit.

The graph edits the same authored routing contracts as the destination selectors. Publication still rejects missing destinations, unreachable StoryNodes and branches with no route to an ending. Layout is private draft metadata and never becomes gameplay state or part of a published edition.

Supported types are Text, Text with Options, Video, Video with Options, Dice, Reveal and Comic. Video StoryNodes use a shipped sample clip (with portrait renditions and audio) or a clip you upload; see [Clip uploads](#clip-uploads). Dice StoryNodes configure sides, threshold and separate pass/fail destinations; Roll reveals the result and Next follows its route. Advanced output/effect JSON uses the contracts in `packages/contracts/index.ts`; it supports stat/key/roll conditions, checks and namespaced story effects. Visual condition builders are not implemented yet.

## Comics

**New comic** starts a draft with one comic StoryNode: a 2×2 square grid of empty panels that ends the story, so a reader gets replay and sharing as soon as they finish it. In a comic draft the center of the editor shows the comic as it will read instead of the map; select a panel to edit it, and **Story map** switches to the map (**Back to the comic** returns). Any StoryNode in any story can also become a comic through **StoryNode type**.

StoryNode settings for a comic hold:

- **Square grid / Scrolling strip.** A grid publishes with exactly 4 or 9 panels; a strip with 4 to 12. The line below says what is still missing before it can publish.
- **Panels**, each with **What's in this panel** (alt text, and the start of the image prompt), **Caption or dialogue**, **Panel image** (any of your photos) and **✦ Generate panel image**. Panels can be reordered, removed and added (up to 12).
- **Cast and style**: an art style and up to six characters, each with a name, a **Looks like** description and a **Reference image**. **✦ Generate character sheet** makes a full-body reference on a plain background.

Generating a panel drafts a square prompt from the panel description, the art style and the characters named in the panel's description or caption, and asks for no text or speech bubbles. Named characters with a reference image are preselected as references (up to three) and the quality defaults to High, because quick drafts can't follow references. Generation uses the same `/api/generation` endpoint, daily limit and asset library as StoryNode images. The cast and style save with the draft but are never published.

### The comic companion

**✦ Make it with AI** at the top of a comic's settings (opened automatically for a **New comic** when AI help is available) makes a whole comic from a premise in three steps:

1. **Brief.** The creator describes the situation and the joke, picks a style (Cartoon, Realistic, Manga, Pixel art, Watercolor, 3D animated, Newspaper strip, or **Other…** in their own words; each preset stands for a fixed style prompt) and a layout: a square of 4 or 9 panels, or a strip of 4 to 12.
2. **Script.** `POST /api/assist` with the `comic-script` action and a strict brief (`comicBriefSchema` in `packages/contracts/assist.ts`) asks Claude (medium effort, structured output) for a title, a one-line description, a cast of at most six characters with drawable descriptions, and each panel's picture description and caption, paced so the last panel lands the joke. Panel descriptions call characters by their cast names and keep all words out of the picture. The server clamps the reply with `clampComicScript`: exactly the panels asked for (fewer is refused as incomplete), deduplicated cast names, every field within its limit. The creator can edit any line, ask for a revision (**Make it funnier**, **Sharper punchline**, **Shorter captions**, **More absurd**, or their own words, sent with the current script), or **Use the script only**. Nothing is drawn yet, and a script costs one assist request, not a generation.
3. **Draw.** **✦ Draw it** shows the number of high-quality images and the approximate cost first, and is unavailable when the day's remaining generations (`remaining` in `GET /api/generation`) or the asset library's room is short. It applies the script to the draft through the normal edit (replacing the panels, setting the cast and style, and filling a blank title and listing description; a character already in the cast by name keeps its reference image), then generates a character sheet for every cast member without a reference image, and then every panel without an image, three at a time, with the characters named in the panel as references. Each image fills into the comic as soon as it is ready, only in the draft it was drawn for. A refused or failed image is listed with its reason and can be retried (an unanswered request retries with its original key, a refused one is redrawn from the draft's current description); the rest of the comic is kept.

Drawing runs in the background (`apps/web/src/comic-drawing.ts`, a store outside any component): **✦ Draw it** closes the dialog, and a fixed status pill at the bottom of Studio shows the progress (it never shifts the editor). **View** reopens the dialog on the live progress, opening the comic's draft first if another one, or none, is open. When drawing finishes the pill shows the result until dismissed, and a system notification is shown if the creator allowed notifications (asked when they click **✦ Draw it**) and isn't looking at Studio. Images finished while the comic's draft is closed, or while the creator is elsewhere in the app, are placed when the draft is next opened. One comic draws at a time. Reloading or closing the tab stops placing images (the browser asks first); images already drawn stay in the asset library.

The companion is an ordinary Studio client of the existing endpoints: the script is a suggestion until applied, every image is an ordinary generation job, and publication validates the result like any hand-made comic.

## Quizzes

**New quiz** starts a draft that is already a working quiz: an opening, two questions with three answers each, a reveal StoryNode and three result endings. Each answer has a **Counts toward** selector listing the results by StoryNode title, or No result. On the reveal StoryNode, **Result N StoryNode** chooses each result's ending, **Add result** creates a new ending and adds it (up to twelve), and **Remove result N** drops one while at least three remain. Changing any StoryNode's type to Reveal creates two new result endings for it. Preview plays the quiz with the same scoring rules as the server, so a creator can check that a set of answers reaches the expected result. See [Story and StoryNode model](16-story-nodes.md) for the scoring contract.

Drafts are private. Incomplete connections may be saved. **Preview** validates a snapshot of the current edits and plays it inside the shared Story and StoryNode components. It runs the portable engine in a disposable client sandbox with default stats, and can force the highest or lowest dice roll. Preview never writes player progress, rewards, or trusted outcomes. Only published gameplay uses the authoritative choice API. Preview opens over the editor; close and reopen it to test changed content.

**Publish edition** requires a saved draft with no local changes. It publishes publicly to Discover; it does not replace old editions. Use **Play published story** to open a real, server-backed journey. Editing and saving afterward makes the next revision available to publish. Existing player saves remain pinned to their edition. Publishing the same revision again is safe.

## Local and hosted publishing

The existing emulator setup works without new services: `pnpm emulators`, `pnpm seed`, `pnpm dev:emulator`. Active emulator accounts can create and publish. Hosted/shared-Firebase accounts can create private drafts and preview; public publishing is limited to accounts with the `publish` feature during this alpha.

Publishing needs the account's `publish` feature: `pnpm features grant <email> publish` (see Account access in `15-shared-firebase-setup.md`). It applies on the next request, with no redeploy. When publishing is unavailable, Studio says so and keeps drafts and previews available. This is a prototype access policy, not a finished moderation or creator-verification system.

## Clip uploads

The **Assets** navigation item (`/assets`) opens the independent asset library. Upload videos or JPEG/PNG/WebP photos there, then select the same asset on any number of StoryNodes. Photos are capped at 10 MB and appear in reading StoryNodes or as video posters. No draft is needed to upload an asset.

For linear Video StoryNodes, **After the video ends** chooses **Automatically continue** or **Wait for Continue**. Video with Options always waits for a chosen output.

The **Reusable StoryNodes** panel saves the selected text/video StoryNode's content and output labels separately from story routing. **Use StoryNode** adds a new placement pinned to that revision, initially connecting its outputs to the first ending in the current draft. Connect the placement into the graph and adjust its destinations before publishing. Content edits require **Save StoryNode to library** again; this makes a new revision and does not change existing stories. **Share StoryNode** explicitly publishes that revision as an anonymous, isolated preview with replay/discovery exits. Sharing a StoryNode also publishes its assets and requires the creator publishing permission. The shared link never includes a private save. Dice and Reveal library entries are not supported yet.

On a Video StoryNode, **Upload a clip** accepts an MP4 or WebM file of up to 100 MB and 60 seconds. When it finishes, the StoryNode uses the clip and **Video clip** lists it under **Your clips** for any StoryNode. Save the draft to keep the choice. Preview plays the uploaded clip. Publishing makes every clip the story uses public; unused and draft-only clips stay private.

1. `POST /api/uploads` with `{idempotencyKey, fileName, contentType, bytes, durationSeconds}` creates a pending clip record (`users/{uid}/clips/{clipId}`) and returns its Storage path, which is the same `users/{uid}/clips/{clipId}`.
2. The browser uploads the file directly to Firebase Storage with the Storage SDK, so large files never pass through the API (Vercel limits request bodies to about 4.5 MB). `firebase/storage.rules` accepts the write only from that user, once, into a pending asset with exactly the declared size and type. Rules allow no reads.
3. `POST /api/uploads/{assetId}/complete` checks the stored size and type, and the file's leading bytes (an MP4 `ftyp` box or the WebM EBML header). A file that fails is deleted along with its asset. A file that passes gets a Firebase download token and becomes `ready`.
4. `GET /api/uploads` lists the caller's clips. Download URLs are returned only to the owner, and to players for StoryNodes in published editions.

StoryNodes store an uploaded clip as `video: "asset:<assetId>"`. Publishing rejects a clip that is missing, not ready, or not among the publisher's own clips, marks used clips `published`, and records each clip's Storage file and token in the edition so playback never reads the creator's clip records. Players get `media.landscape.src` as the Storage download URL. Uploaded clips have no portrait rendition, poster, captions or social teaser, so the player contains the one rendition at every width and shows no captions track.

Hosted uploads use the same `publish` feature as publishing; emulator accounts can upload immediately. Each account can keep 50 clips. The length comes from the browser and is informational: the server checks size, type and file signature, not duration or whether the video decodes. There is no transcoding, thumbnail, moderation, deletion or storage quota beyond those limits. The phone preview has no Storage emulator and shows uploads as unavailable.

## Contracts and persistence

All endpoints require a verified active Firebase user:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/studio?cursor=...&limit=20` | Own draft summaries, opaque document-ID cursor, publishing capability and own UID. Limit 1–50. |
| `GET /api/studio/{storyId}` | Own private draft and its saved revision. Other users cannot read it. |
| `POST /api/studio/{storyId}` | Save `{idempotencyKey, expectedRevision, draft: {story, description}}`. Revision 0 creates; later revisions use optimistic concurrency. |
| `POST /api/studio/{storyId}/publish` | Publish `{idempotencyKey, expectedRevision, policyVersion: "creator-alpha-1"}`. Requires the account's `publish` feature. |

Drafts live at `users/{uid}/drafts/{storyId}`. A first save reserves story ownership at `stories/{storyId}`. IDs of existing sample stories cannot be claimed. API authorization derives identity from the token; direct Firestore draft access and writes remain denied by default.

Draft requests are bounded to 250,000 UTF-8 bytes, 80 StoryNodes, 20 choices per StoryNode, 160-character titles and 500-character descriptions. Schema validation applies even to private drafts. Publication validates StoryNode completion contracts, namespaces and a safe start. It excludes unfinished choices and unreachable placements while preserving them in the private draft. Required dice/check/reveal outcomes must all be safe. An unconditional, cost-free strategy to a StoryLeaf is required; conditional-only exits and unavoidable automatic cycles cannot establish safety. Item entry effects require future bounded inventory analysis. Optional item-changing routes retain runtime bounds and cannot establish the guaranteed exit. Existing issued editions are not recompiled or mutated.

Publication writes `edition-{draftRevision}`, its frozen StoryNode documents, the public catalogue projection, the latest-version pointer and its durable receipt in one transaction. The bounded graph fits a single transaction; no asynchronous job is needed yet. No partial edition becomes visible. Private draft fields are not copied into the catalogue. Repeated commands return their receipt; changed payloads with the same key conflict. Stale tabs must reload the saved draft. An ambiguous network failure keeps the same request for **Retry save**.

Loading and notifications overlay content. Reload/closing the browser warns about unsaved edits; saving is explicit. Offline edits remain in memory until saved, so do not close the tab before reconnecting.

## Scope and verification

### Video workshop

Assets links to **Generate image** and **Edit video**. AI generation makes images only; video generation is turned off (the server refuses `kind: "video"`, and the unused `VideoGenerator` workshop stays in the codebase for when it returns). Creators can still upload their own video clips. The generator takes a prompt, a quality tier and a shape (landscape 16:9, portrait 9:16 or square):

Both tiers use OpenAI's `gpt-image-2` at exact sizes (1536×864, 864×1536, 1024×1024), returned as JPEG:

| Tier | OpenAI quality | Cost (approximate, 1024×1024) | References |
|---|---|---|---|
| Quick draft | `low` | about $0.006 per image | none |
| High quality | `high` (`/v1/images/edits` with references) | about $0.21 per image | up to 3 owned PNG, JPEG or WebP images |

Reference images keep a character or place consistent across images; the contract rejects references on a quick draft. Results land in the asset library and Recent generations. A submitted request is remembered in the browser until the server answers, so a retry after a network failure reuses its idempotency key.

Configure server-only `OPENAI_API_KEY` in `.env.local` or the hosting environment, then restart the server, and grant the account's `generate` feature (`pnpm features grant <email> generate`; emulator accounts already have it). Never use `VITE_` for the key. The UI explains when generation is unavailable.

`POST /api/generation` accepts a strict image command with a prompt, tier, shape, owned reference asset IDs and an idempotency key. The server validates ready image ownership, uses fixed model settings with OpenAI's default moderation, and sends reference image bytes to OpenAI as multipart uploads. A durable receipt is reserved before the provider call. OpenAI returns the image in the response, so the same request saves it once under a deterministic asset ID; the Vercel function allows 300 seconds for this (`vercel.json`). A 400 refusal (including `moderation_blocked`) marks the job failed. Any other failure is marked uncertain and never automatically resubmitted; check OpenAI usage. A job still submitting after five minutes is shown as uncertain. Each creator is limited to 100 submitted image requests per UTC day (`generationLimits.daily`; a comic drawn by the companion takes one per character sheet and panel), and full libraries reject new submissions. `GET /api/generation` returns only the creator's recent jobs. `POST /api/generation/{jobId}` reports a saved job's status, so a retried request can wait for the original. Results are size-bounded, signature-checked and private. Provider credentials and arbitrary model/source URLs are never accepted from the browser. Reconciliation of uncertain jobs is not implemented. The library size check remains a soft cap under concurrency, like ordinary uploads.

Editing supports clip start/end, original/landscape/portrait/square crop, horizontal/vertical framing, crop preview, and audio removal. Export uses browser Canvas/MediaRecorder with Web Audio, retaining source audio unless muted. It runs in real time in a visible tab and saves a new WebM through the same validated upload path as other assets. It preserves the source and never silently rewrites StoryNodes referencing it. Export is capped at 60 seconds and a 1280-pixel longest edge. Chrome/Edge WebM recording is required; server transcoding, multi-track editing, lossless export, and background rendering are not implemented.

This is the authoring/publishing portion of M2, not the complete creator milestone. Clip uploads and the branching timeline exist (above); transcoding, custom thumbnails, moderation tools, unpublishing, community branch authoring and dynamic social metadata for newly published stories remain future work. Sample media is diagnostic placeholder footage. Drafts are not backed up in browser storage.

Run `pnpm check`, `pnpm test:integration`, `pnpm test:studio` and `pnpm test:quiz`. The quiz check plays the sample quiz to its server-chosen result and share card at desktop and mobile widths, then builds a quiz from the Studio template, changes an answer's result, adds a result and previews it to the expected ending. The browser test creates, saves, reloads, previews, publishes and plays a story at desktop and mobile widths, then uploads a clip, previews it, publishes and plays it from the Storage emulator. Integration coverage includes cross-user denial, idempotency, stale revisions, immutable editions and invalid-publication rollback. Hosted account permissions and real-device Safari still need verification.

October 15, 2026 upload verification: typecheck, build and 38 unit tests passed, including file-signature, download-URL and contract tests. 14 emulator integration tests passed. They cover idempotent upload requests, Storage rules (another user, no asset record, wrong size or type, overwrite, reads all denied), owner-only completion and listing, a fake MP4 deleted on completion, a clip borrowed by another creator rejected at publish, and the published clip served to another player byte for byte. All six browser checks passed on freshly seeded data. Not verified: live Storage rules (they must be deployed; see [shared Firebase setup](15-shared-firebase-setup.md)), real uploads from a phone, and large files over slow connections.

October 14, 2026 verification: production build and TypeScript passed; 26 unit/domain/config checks and 11 emulator integration checks passed. Chrome completed the Studio flow at 1440px and 390px. The existing delayed-media transition check also passed at both widths. No test stories were published to the live Firebase project.

Branching timeline verification (October 15, 2026): `pnpm check` passed with 52 unit tests, TypeScript and production build; all 17 emulator integration tests passed, including editor-position persistence and exclusion from published manifests. `pnpm test:graph` passed at 1440px and 390px for StoryNode insertion, branching, reconnection, pointer and keyboard movement, save/reload and shared StoryNode preview routing. `pnpm test:studio` passed the existing author/save/publish/upload flow at desktop/mobile widths. Canvas screenshots were inspected. Physical touch devices and hosted editor persistence remain unverified; desktop/mobile Chrome testing used a mouse plus keyboard.

Video workshop verification (October 17, 2026): TypeScript, production build and 54 unit tests passed; all 18 emulator integration tests passed, including generation authorization, idempotency, cross-user denial, failed jobs, and successful private asset import using mocked fal responses. Chrome at 1440px/390px verified prompt persistence, reference upload, unavailable-provider gating, real trim/crop export, playable portrait dimensions, and new asset identity. The desktop flow additionally verified three generated frame suggestions, frame selection/reordering, adjacent-pair requests, and real three-shot joining using simulated provider responses. Screenshots were inspected. Live fal inference, output quality, actual video pricing, hosted execution, physical mobile devices and Safari export remain unverified. The existing production bundle size warning remains.
