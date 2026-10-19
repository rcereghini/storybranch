# Creator Studio alpha

Open **Create** in the main navigation (or `/studio`) and sign in. Choose **New story**, edit its title and description, then build its branching **Story timeline**. Each new story starts with an opening and an ending. Select a page card to edit its content in **Page settings**; the **Edit page** selector provides an alternative for long graphs. The first-page selector sets the entry. An ending closes the story and uses the existing replay/recommendation shell.

## Branching timeline

- **Add page** creates the selected page type. From a linear page it inserts the new page between that page and its previous destination; otherwise it creates a page you can connect to a branch. New non-ending pages lead to an existing ending by default.
- **Add branch** creates a new page and an option leading to it from the selected page. A linear text/video page becomes its options counterpart; existing choices and effects remain. Its library link is detached because its content/output slots changed.
- Select an output row on a card, then select the destination card to reconnect it. Pass/Fail and quiz result outputs are individually displayed. Quiz results can only connect to endings. Existing route effects and conditions are preserved. **Cancel connection** or Escape cancels selection.
- Drag a card by its type header to move it. Keyboard users can focus that handle and use arrow keys in 24-pixel increments. Moving cards changes editor layout only. **Save draft** persists positions; reloading restores them.
- **Arrange tree** lays out the graph from left to right. Branches may rejoin, and cycles are displayed without infinite layout traversal. Disconnected pages appear in a separate column. Zoom controls, scrollbars and **Find selected** help navigate larger stories.

The graph edits the same authored routing contracts as the destination selectors. Publication still rejects missing destinations, unreachable pages and branches with no route to an ending. Layout is private draft metadata and never becomes gameplay state or part of a published edition.

Supported types are Text, Text with Options, Video, Video with Options, Dice and Reveal. Video pages use a shipped sample clip (with portrait renditions and audio) or a clip you upload; see [Clip uploads](#clip-uploads). Dice pages configure sides, threshold and separate pass/fail destinations; Roll reveals the result and Next follows its route. Advanced output/effect JSON uses the contracts in `packages/contracts/index.ts`; it supports stat/key/roll conditions, checks and namespaced story effects. Visual condition builders are not implemented yet.

## Quizzes

**New quiz** starts a draft that is already a working quiz: an opening, two questions with three answers each, a reveal page and three result endings. Each answer has a **Counts toward** selector listing the results by page title, or No result. On the reveal page, **Result N page** chooses each result's ending, **Add result** creates a new ending and adds it (up to twelve), and **Remove result N** drops one while at least three remain. Changing any page's type to Reveal creates two new result endings for it. Preview plays the quiz with the same scoring rules as the server, so a creator can check that a set of answers reaches the expected result. See [Story and Page model](16-story-pages.md) for the scoring contract.

**Save draft** stores a private draft. Incomplete connections may be saved. **Preview** validates a snapshot of the current edits and plays it inside the shared Story and Page components. It runs the portable engine in a disposable client sandbox with default stats, and can force the highest or lowest dice roll. Preview never writes player progress, rewards, or trusted outcomes. Only published gameplay uses the authoritative choice API. Close and reopen preview to test changed content.

**Publish edition** requires a saved draft with no local changes. It publishes publicly to Discover; it does not replace old editions. Use **Play published story** to open a real, server-backed journey. Editing and saving afterward makes the next revision available to publish. Existing player saves remain pinned to their edition. Publishing the same revision again is safe.

## Local and hosted publishing

The existing emulator setup works without new services: `pnpm emulators`, `pnpm seed`, `pnpm dev:emulator`. Active emulator accounts can create and publish. Hosted/shared-Firebase accounts can create private drafts and preview; public publishing is limited to accounts with the `publish` feature during this alpha.

Publishing needs the account's `publish` feature: `pnpm features grant <email> publish` (see Account access in `15-shared-firebase-setup.md`). It applies on the next request, with no redeploy. When publishing is unavailable, Studio says so and keeps drafts and previews available. This is a prototype access policy, not a finished moderation or creator-verification system.

## Clip uploads

The **Assets** navigation item (`/assets`) opens the independent asset library. Upload videos or JPEG/PNG/WebP photos there, then select the same asset on any number of pages. Photos are capped at 10 MB and appear in reading pages or as video posters. No draft is needed to upload an asset.

For linear Video pages, **After the video ends** chooses **Automatically continue** or **Wait for Continue**. Video with Options always waits for a chosen output.

The **Reusable pages** panel saves the selected text/video page's content and output labels separately from story routing. **Use page** adds a new placement pinned to that revision, initially connecting its outputs to the first ending in the current draft. Connect the placement into the graph and adjust its destinations before publishing. Content edits require **Save page to library** again; this makes a new revision and does not change existing stories. **Share page** explicitly publishes that revision as an anonymous, isolated preview with replay/discovery exits. Sharing a page also publishes its assets and requires the creator publishing permission. The shared link never includes a private save. Dice and Reveal library entries are not supported yet.

On a Video page, **Upload a clip** accepts an MP4 or WebM file of up to 100 MB and 60 seconds. When it finishes, the page uses the clip and **Video clip** lists it under **Your clips** for any page. Save the draft to keep the choice. Preview plays the uploaded clip. Publishing makes every clip the story uses public; unused and draft-only clips stay private.

1. `POST /api/uploads` with `{idempotencyKey, fileName, contentType, bytes, durationSeconds}` creates a pending clip record (`users/{uid}/clips/{clipId}`) and returns its Storage path, which is the same `users/{uid}/clips/{clipId}`.
2. The browser uploads the file directly to Firebase Storage with the Storage SDK, so large files never pass through the API (Vercel limits request bodies to about 4.5 MB). `firebase/storage.rules` accepts the write only from that user, once, into a pending asset with exactly the declared size and type. Rules allow no reads.
3. `POST /api/uploads/{assetId}/complete` checks the stored size and type, and the file's leading bytes (an MP4 `ftyp` box or the WebM EBML header). A file that fails is deleted along with its asset. A file that passes gets a Firebase download token and becomes `ready`.
4. `GET /api/uploads` lists the caller's clips. Download URLs are returned only to the owner, and to players for pages in published editions.

Pages store an uploaded clip as `video: "asset:<assetId>"`. Publishing rejects a clip that is missing, not ready, or not among the publisher's own clips, marks used clips `published`, and records each clip's Storage file and token in the edition so playback never reads the creator's clip records. Players get `media.landscape.src` as the Storage download URL. Uploaded clips have no portrait rendition, poster, captions or social teaser, so the player contains the one rendition at every width and shows no captions track.

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

Draft requests are bounded to 250,000 UTF-8 bytes, 80 pages, 20 choices per page, 160-character titles and 500-character descriptions. Schema validation applies even to private drafts. Publication also validates graph references, page completion contracts, key namespaces, a reachable ending, unreachable pages and loops with no route to an ending. Cycles with an exit are allowed. This is structural validation, not a proof that every conditional route is satisfiable for every player state.

Publication writes `edition-{draftRevision}`, its frozen page documents, the public catalogue projection, the latest-version pointer and its durable receipt in one transaction. The bounded graph fits a single transaction; no asynchronous job is needed yet. No partial edition becomes visible. Private draft fields are not copied into the catalogue. Repeated commands return their receipt; changed payloads with the same key conflict. Stale tabs must reload the saved draft. An ambiguous network failure keeps the same request for **Retry same request**.

Loading and notifications overlay content. Reload/closing the browser warns about unsaved edits; saving is explicit. Offline edits remain in memory until saved, so do not close the tab before reconnecting.

## Scope and verification

### Video workshop

Assets links to **Generate image** and **Edit video**. AI generation makes images only; video generation is turned off (the server refuses `kind: "video"`, and the unused `VideoGenerator` workshop stays in the codebase for when it returns). Creators can still upload their own video clips. The generator takes a prompt, a quality tier and a shape (landscape 16:9, portrait 9:16 or square):

| Tier | Model | Cost | References |
|---|---|---|---|
| Quick draft | `fal-ai/flux/schnell` | a fraction of a cent | none |
| High quality | `fal-ai/nano-banana-pro` (`/edit` with references) | about $0.15 per image | up to 3 owned images |

Reference images keep a character or place consistent across images; the contract rejects references on a quick draft. Results land in the asset library and Recent generations. A submitted request is remembered in the browser until the server answers, so a retry after a network failure reuses its idempotency key.

Configure server-only `FAL_KEY` in `.env.local` or the hosting environment, then restart the server, and grant the account's `generate` feature (`pnpm features grant <email> generate`; emulator accounts already have it). Never use `VITE_` for the key. The UI explains when generation is unavailable.

`POST /api/generation` accepts a strict image command with a prompt, tier, shape, owned reference asset IDs and an idempotency key. The server validates ready image ownership, uses fixed model settings with safety checking, and sends image bytes to fal (including with local Storage). A durable receipt is reserved before provider submission. An ambiguous submission is marked uncertain and never automatically resubmitted; inspect fal's dashboard. Each creator is limited to 20 submitted image requests per UTC day, and full libraries reject new submissions. `GET /api/generation` returns only the creator's recent jobs. `POST /api/generation/{jobId}` checks a saved job and imports completed media once under a deterministic asset ID, using an import lease. Media imports allow only HTTPS fal CDN hosts, reject redirects, bound file sizes, inspect signatures, and remain private. Provider credentials and arbitrary model/source URLs are never accepted from the browser. A worker/webhook and reconciliation of ambiguous submissions are not yet implemented; completion import is driven by the browser's status checks. The library size check remains a soft cap under concurrency, like ordinary uploads.

Editing supports clip start/end, original/landscape/portrait/square crop, horizontal/vertical framing, crop preview, and audio removal. Export uses browser Canvas/MediaRecorder with Web Audio, retaining source audio unless muted. It runs in real time in a visible tab and saves a new WebM through the same validated upload path as other assets. It preserves the source and never silently rewrites pages referencing it. Export is capped at 60 seconds and a 1280-pixel longest edge. Chrome/Edge WebM recording is required; server transcoding, multi-track editing, lossless export, and background rendering are not implemented.

This is the authoring/publishing portion of M2, not the complete creator milestone. Clip uploads and the branching timeline exist (above); transcoding, custom thumbnails, moderation tools, unpublishing, community branch authoring and dynamic social metadata for newly published stories remain future work. Sample media is diagnostic placeholder footage. Drafts are not backed up in browser storage.

Run `pnpm check`, `pnpm test:integration`, `pnpm test:studio` and `pnpm test:quiz`. The quiz check plays the sample quiz to its server-chosen result and share card at desktop and mobile widths, then builds a quiz from the Studio template, changes an answer's result, adds a result and previews it to the expected ending. The browser test creates, saves, reloads, previews, publishes and plays a story at desktop and mobile widths, then uploads a clip, previews it, publishes and plays it from the Storage emulator. Integration coverage includes cross-user denial, idempotency, stale revisions, immutable editions and invalid-publication rollback. Hosted account permissions and real-device Safari still need verification.

October 15, 2026 upload verification: typecheck, build and 38 unit tests passed, including file-signature, download-URL and contract tests. 14 emulator integration tests passed. They cover idempotent upload requests, Storage rules (another user, no asset record, wrong size or type, overwrite, reads all denied), owner-only completion and listing, a fake MP4 deleted on completion, a clip borrowed by another creator rejected at publish, and the published clip served to another player byte for byte. All six browser checks passed on freshly seeded data. Not verified: live Storage rules (they must be deployed; see [shared Firebase setup](15-shared-firebase-setup.md)), real uploads from a phone, and large files over slow connections.

October 14, 2026 verification: production build and TypeScript passed; 26 unit/domain/config checks and 11 emulator integration checks passed. Chrome completed the Studio flow at 1440px and 390px. The existing delayed-media transition check also passed at both widths. No test stories were published to the live Firebase project.

Branching timeline verification (October 15, 2026): `pnpm check` passed with 52 unit tests, TypeScript and production build; all 17 emulator integration tests passed, including editor-position persistence and exclusion from published manifests. `pnpm test:graph` passed at 1440px and 390px for page insertion, branching, reconnection, pointer and keyboard movement, save/reload and shared Page preview routing. `pnpm test:studio` passed the existing author/save/publish/upload flow at desktop/mobile widths. Canvas screenshots were inspected. Physical touch devices and hosted editor persistence remain unverified; desktop/mobile Chrome testing used a mouse plus keyboard.

Video workshop verification (October 17, 2026): TypeScript, production build and 54 unit tests passed; all 18 emulator integration tests passed, including generation authorization, idempotency, cross-user denial, failed jobs, and successful private asset import using mocked fal responses. Chrome at 1440px/390px verified prompt persistence, reference upload, unavailable-provider gating, real trim/crop export, playable portrait dimensions, and new asset identity. The desktop flow additionally verified three generated frame suggestions, frame selection/reordering, adjacent-pair requests, and real three-shot joining using simulated provider responses. Screenshots were inspected. Live fal inference, output quality, actual video pricing, hosted execution, physical mobile devices and Safari export remain unverified. The existing production bundle size warning remains.
