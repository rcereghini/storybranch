# Creator Studio alpha

Open **Create** in the main navigation (or `/studio`) and sign in. Choose **New story**, edit its title and description, and select pages in **Edit page**. Each new story starts with an opening and an ending. Add pages, select their types, and connect outputs with the destination selectors. The first-page selector sets the entry. An ending closes the story and uses the existing replay/recommendation shell.

Supported types are Text, Text with Options, Video, Video with Options, and Dice. Video pages use a shipped sample clip (with portrait renditions and audio) or a clip you upload; see [Clip uploads](#clip-uploads). Dice pages configure sides, threshold and separate pass/fail destinations; Roll reveals the result and Next follows its route. Advanced output/effect JSON uses the contracts in `packages/contracts/index.ts`; it supports stat/key/roll conditions, checks and namespaced story effects. Visual condition builders are not implemented yet.

**Save draft** stores a private draft. Incomplete connections may be saved. **Preview** validates a snapshot of the current edits and plays it inside the shared Story and Page components. It runs the portable engine in a disposable client sandbox with default stats, and can force the highest or lowest dice roll. Preview never writes player progress, rewards, or trusted outcomes. Only published gameplay uses the authoritative choice API. Close and reopen preview to test changed content.

**Publish edition** requires a saved draft with no local changes. It publishes publicly to Discover; it does not replace old editions. Use **Play published story** to open a real, server-backed journey. Editing and saving afterward makes the next revision available to publish. Existing player saves remain pinned to their edition. Publishing the same revision again is safe.

## Local and hosted publishing

The existing emulator setup works without new services: `pnpm emulators`, `pnpm seed`, `pnpm dev:emulator`. Active emulator accounts can create and publish. Hosted/shared-Firebase accounts can create private drafts and preview; public publishing is restricted to an explicit creator allowlist during this alpha.

Set server-only `STORYBRANCH_PUBLISHER_UIDS` to a comma-separated list of Firebase Authentication user IDs. Studio displays the signed-in user's publisher ID when publishing is unavailable. For local shared Firebase, put the variable in ignored `.env.local` and restart `pnpm dev`. On Netlify set it for Functions; on Vercel set it for Production and Preview. Redeploy after changing it. Do not use an email address or a `VITE_` variable. Firebase web configuration is unchanged. This is a prototype access policy, not a finished moderation or creator-verification system.

## Clip uploads

On a Video page, **Upload a clip** accepts an MP4 or WebM file of up to 100 MB and 60 seconds. When it finishes, the page uses the clip and **Video clip** lists it under **Your clips** for any page. Save the draft to keep the choice. Preview plays the uploaded clip. Publishing makes every clip the story uses public; unused and draft-only clips stay private.

1. `POST /api/uploads` with `{idempotencyKey, fileName, contentType, bytes, durationSeconds}` creates a pending asset (`assets/{assetId}`) and returns its Storage path `uploads/{uid}/{assetId}`.
2. The browser uploads the file directly to Firebase Storage with the Storage SDK, so large files never pass through the API (Vercel limits request bodies to about 4.5 MB). `firebase/storage.rules` accepts the write only from that user, once, into a pending asset with exactly the declared size and type. Rules allow no reads.
3. `POST /api/uploads/{assetId}/complete` checks the stored size and type, and the file's leading bytes (an MP4 `ftyp` box or the WebM EBML header). A file that fails is deleted along with its asset. A file that passes gets a Firebase download token and becomes `ready`.
4. `GET /api/uploads` lists the caller's clips. Download URLs are returned only to the owner, and to players for pages in published editions.

Pages store an uploaded clip as `video: "asset:<assetId>"`. Publishing rejects a clip that is missing, not ready, or owned by someone else, then marks used clips `published`. Players get `media.landscape.src` as the Storage download URL. Uploaded clips have no portrait rendition, poster, captions or social teaser, so the player contains the one rendition at every width and shows no captions track.

Hosted uploads use the same allowlist as publishing (`STORYBRANCH_PUBLISHER_UIDS`); emulator accounts can upload immediately. Each account can keep 50 clips. The length comes from the browser and is informational: the server checks size, type and file signature, not duration or whether the video decodes. There is no transcoding, thumbnail, moderation, deletion or storage quota beyond those limits. The phone preview has no Storage emulator and shows uploads as unavailable.

## Contracts and persistence

All endpoints require a verified active Firebase user:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/studio?cursor=...&limit=20` | Own draft summaries, opaque document-ID cursor, publishing capability and own UID. Limit 1–50. |
| `GET /api/studio/{storyId}` | Own private draft and its saved revision. Other users cannot read it. |
| `POST /api/studio/{storyId}` | Save `{idempotencyKey, expectedRevision, draft: {story, description}}`. Revision 0 creates; later revisions use optimistic concurrency. |
| `POST /api/studio/{storyId}/publish` | Publish `{idempotencyKey, expectedRevision, policyVersion: "creator-alpha-1"}`. Requires creator allowlist in Firebase mode. |

Drafts live at `creatorDrafts/{uid}/stories/{storyId}` within the existing configured database prefix. A first save reserves story ownership at `stories/{storyId}`. IDs of existing sample stories cannot be claimed. API authorization derives identity from the token; direct Firestore draft access and writes remain denied by default.

Draft requests are bounded to 250,000 UTF-8 bytes, 80 pages, 20 choices per page, 160-character titles and 500-character descriptions. Schema validation applies even to private drafts. Publication also validates graph references, page completion contracts, key namespaces, a reachable ending, unreachable pages and loops with no route to an ending. Cycles with an exit are allowed. This is structural validation, not a proof that every conditional route is satisfiable for every player state.

Publication writes `edition-{draftRevision}`, its frozen page documents, the public catalogue projection, the latest-version pointer and its durable receipt in one transaction. The bounded graph fits a single transaction; no asynchronous job is needed yet. No partial edition becomes visible. Private draft fields are not copied into the catalogue. Repeated commands return their receipt; changed payloads with the same key conflict. Stale tabs must reload the saved draft. An ambiguous network failure keeps the same request for **Retry same request**.

Loading and notifications overlay content. Reload/closing the browser warns about unsaved edits; saving is explicit. Offline edits remain in memory until saved, so do not close the tab before reconnecting.

## Scope and verification

This is the authoring/publishing portion of M2, not the complete creator milestone. Clip uploads exist (above); transcoding, custom thumbnails, moderation tools, unpublishing, visual graph dragging, community branch authoring and dynamic social metadata for newly published stories remain future work. Sample media is diagnostic placeholder footage. Drafts are not backed up in browser storage.

Run `pnpm check`, `pnpm test:integration` and `pnpm test:studio`. The browser test creates, saves, reloads, previews, publishes and plays a story at desktop and mobile widths, then uploads a clip, previews it, publishes and plays it from the Storage emulator. Integration coverage includes cross-user denial, idempotency, stale revisions, immutable editions and invalid-publication rollback. Hosted account permissions and real-device Safari still need verification.

October 15, 2026 upload verification: typecheck, build and 38 unit tests passed, including file-signature, download-URL and contract tests. 14 emulator integration tests passed. They cover idempotent upload requests, Storage rules (another user, no asset record, wrong size or type, overwrite, reads all denied), owner-only completion and listing, a fake MP4 deleted on completion, a clip borrowed by another creator rejected at publish, and the published clip served to another player byte for byte. All six browser checks passed on freshly seeded data. Not verified: live Storage rules (they must be deployed; see [shared Firebase setup](15-shared-firebase-setup.md)), real uploads from a phone, and large files over slow connections.

October 14, 2026 verification: production build and TypeScript passed; 26 unit/domain/config checks and 11 emulator integration checks passed. Chrome completed the Studio flow at 1440px and 390px. The existing delayed-media transition check also passed at both widths. No test stories were published to the live Firebase project.
