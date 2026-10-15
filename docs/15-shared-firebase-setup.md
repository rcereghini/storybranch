# Shared Firebase setup: local and Vercel

The default browser and API configuration targets `storybranch-f77a3`. `pnpm dev` and the Vercel build use this same project. Local and hosted play therefore share accounts and saves. Emulators remain available explicitly with `pnpm dev:emulator`; the optional phone tunnel remains an isolated disposable emulator preview.

The web config in `fixtures/firebase-config.ts` is public. Analytics is not initialized. Admin credentials are server-only and must never use a `VITE_` prefix or be committed.

## Firebase Console

For project `storybranch-f77a3`:

1. Enable Authentication > Sign-in method > Email/Password. Players can create an email/password account in the app or sign in with an existing account. Enable Google as a second provider and choose the project support email to activate Continue with Google. Do not create the public emulator demo passwords in the live project.
2. Include `storybranch.com`, `www.storybranch.com`, `storybranch-alpha.vercel.app` and `localhost` in Authentication > Settings > Authorized domains as appropriate.
3. Ensure a `(default)` Firestore database exists. The project holds only Storybranch data, laid out as in [Data layout](#data-layout).
4. Deploy `firebase/firestore.rules` and `firebase/firestore.indexes.json` (`pnpm exec firebase deploy --only firestore --project storybranch-f77a3`). The rules let clients read only the catalogue and their own `users/{uid}` records and deny all client writes; the app itself uses the server API, whose Admin SDK bypasses rules. The indexes file defines no composite indexes, only a TTL policy that deletes command receipts after their `expireAt`.
5. Create/download a service-account key from Project settings > Service accounts for the server. Prefer a dedicated runtime account with Firestore access and Firebase Authentication read access; the server reads disabled/revoked user status. A service account from another project is rejected by the JSON credential path. Use a credential authorized for this project when using Application Default Credentials.

A new authenticated player's Storybranch profile is initialized by the API with prototype base stats (agility 5). Existing stats and disabled profiles are preserved. There is no trading, payments or combat implementation.

## Local server

Place the downloaded key at `.secrets/firebase-admin.json` (ignored by Git). Copy `.env.example` to `.env.local`. The credential path is relative to the repo root, so it needs no per-checkout edits:

```dotenv
STORYBRANCH_MODE=firebase
GOOGLE_APPLICATION_CREDENTIALS=./.secrets/firebase-admin.json
```

Remove emulator-host variables from this live shell. Mixed live/emulator configuration fails closed.

```sh
pnpm seed:firebase
pnpm dev
```

The live seed writes only sample content (`stories`, `catalogue`, `branches`, `placements`). It creates missing records and promotes the known pre-page `v1` sample catalogue/branch/published pointers to `pages-v1`; newer pointers and placements are left alone. Existing immutable versions must have identical hashes. It does not create Auth accounts or demo profiles. Run it with server credentials to publish the three root mock stories. Repeat safely to fill missing sample content.

## Storage for clip uploads

The project's default bucket `storybranch-f77a3.firebasestorage.app` exists and is used only by Storybranch. Before hosted uploads work, an administrator must deploy `firebase/storage.rules`, which replace rules an earlier, unrelated app left on the bucket (it stored no files).

```sh
pnpm exec firebase deploy --only storage --project storybranch-f77a3
```

A clip's file is `users/{uid}/clips/{clipId}`; the rules read the clip record at the same Firestore path to authorize each upload. The first deploy asks to let Storage rules read Firestore; accept it. No CORS configuration is needed: the Storage SDK and `<video>` playback work without it. Uploading is limited to `STORYBRANCH_PUBLISHER_UIDS`. Locally the Storage emulator runs on port 9299 with the other emulators.

## Data layout

Everything a player owns sits under their user record; published and public content is top level. `services/api/paths.ts` is the single source for these paths, and local emulators use the same layout as the live project.

```text
users/{uid}                                profile: stats, status, display fields
users/{uid}/playthroughs/{saveId}          save, pinned to one story edition
users/{uid}/playthroughs/{saveId}/events   story log, one record per revision
users/{uid}/drafts/{storyId}               private Studio draft
users/{uid}/clips/{clipId}                 uploaded clip record
users/{uid}/receipts/{hash}                retry receipts; deleted 30 days after expireAt
stories/{storyId}                          owner and published-edition pointer
stories/{storyId}/versions/{versionId}     immutable edition (+ clips it uses)
stories/{storyId}/versions/{v}/pages/{p}   frozen pages
catalogue/{storyId}                        public listing
branches/{branchId}, placements/{locationId}  community side quests

Storage: users/{uid}/clips/{clipId}        uploaded clip file
```

A published edition records the Storage file and download token of each uploaded clip it uses, so players never read a creator's private clip records, and another player's saves are simply not found under your account.

### Moving from the old layout

Until October 2026 the live project kept everything under `storybranch/app/...` (with `playerProfiles`, top-level `playthroughs`, `creatorDrafts/{uid}/stories` and `commandReceipts`). `pnpm migrate:layout` copies that into the layout above using the local server credential: run it without flags for a dry run, then with `--apply`. It only creates records or moves a save forward to a higher revision, never overwrites newer data and never deletes. It refuses to write if any record has no place in the new layout. Run it once before deploying the new code and once right after, to pick up anything written in between. Delete `storybranch/app` only after checking the live site, and keep it for a while first.

## Vercel

`vercel.json` builds with `pnpm build:vercel`, serves `dist`, and routes every `/api/*` request to `api/index.js`. That function re-exports a Vite bundle of the same handler (`vite.api.config.ts` → `dist-api/`), because Vercel compiles TypeScript functions file by file and cannot resolve this project's extensionless ESM imports.

In Project → Settings → Environment Variables, add `FIREBASE_SERVICE_ACCOUNT_JSON` (entire JSON, marked Sensitive), `STORYBRANCH_PUBLISHER_UIDS`, and `ENABLE_EXPERIMENTAL_COREPACK=1` so the install uses the pinned pnpm version. Add the `*.vercel.app` and any custom domain to Firebase Authentication → Settings → Authorized domains. Redeploy after changing variables.

The default server mode is `firebase`; an explicit `STORYBRANCH_MODE=firebase` is also supported. Keep emulator overrides (`STORYBRANCH_MODE=emulator`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `STORYBRANCH_PHONE_PREVIEW`, `VITE_PHONE_PREVIEW`, `VITE_STORYBRANCH_MODE=emulator`) out of the production deployment. After credentials and seed are in place, `/api/catalogue` should return HTTP 200 with Glass Harbor; sign in, begin a journey, choose a route, reload and check the saved scene.

Admin setup: [Firebase documentation](https://firebase.google.com/docs/admin/setup).

## Verification status

Save list: saves are listed from `users/{uid}/playthroughs` ordered by `updatedAt`, which needs no composite index. The old `playthroughs` composite index (`playerUid`, `updatedAt`) is unused after the move and can be deleted. The player no longer refreshes the save list after every successful choice. List failures show a separate retry notice on catalogue/library screens, not a failed-choice message. Chrome regression `node --import tsx scripts/save-list-check.ts` verifies that choices persist and reload while the list endpoint returns 503.

Configuration tests reject invalid modes, non-loopback emulators and mixed live/emulator settings. Emulator integration tests cover auth, cross-user denial (another player's save is not found), the layout copy, idempotency, races, pinned saves, isolated side quests and profile bootstrap preserving existing/disabled profiles. Live credentials, existing project rules/indexes, provider enablement and real hosted sign-in still require verification after project access is supplied. The public web configuration alone cannot authorize server writes.

Google sign-in uses a user-triggered popup; blocked or cancelled popups leave the form open with recovery guidance. The isolated phone tunnel supports email signup but not Google OAuth. Production Google OAuth and physical-device popup behavior require manual verification.

Authentication update verification: typecheck, production build, 20 unit/domain tests and 9 emulator integration tests passed. Chrome at 390px verified password mismatch handling, email registration, session persistence after reload, new-player save creation, sign-out/sign-in/resume, and opening/cancelling the Google emulator popup. Run `pnpm test:auth` with the emulator dev server. A real Google account consent flow was not performed. Live sample content was seeded and the local function successfully read the live catalogue; Since October 14, 2026 Vercel production has credentials and serves the live catalogue.
