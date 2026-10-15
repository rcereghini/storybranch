# Shared Firebase setup: local, Netlify and Vercel

The default browser and API configuration targets `storybranch-f77a3`. `pnpm dev` and the Netlify and Vercel builds use this same project. Local and hosted play therefore share accounts and saves. Emulators remain available explicitly with `pnpm dev:emulator`; the optional phone tunnel remains an isolated disposable emulator preview.

The web config in `fixtures/firebase-config.ts` is public. Analytics is not initialized. Admin credentials are server-only and must never use a `VITE_` prefix or be committed.

## Firebase Console

For project `storybranch-f77a3`:

1. Enable Authentication > Sign-in method > Email/Password. Players can create an email/password account in the app or sign in with an existing account. Enable Google as a second provider and choose the project support email to activate Continue with Google. Do not create the public emulator demo passwords in the live project.
2. Include `storybranch.com`, `www.storybranch.com`, `storybranch-alpha.vercel.app`, any Netlify site hostname, and `localhost` in Authentication > Settings > Authorized domains as appropriate.
3. Ensure a `(default)` Firestore database exists. Records are stored under `storybranch/app/...`, keeping them separate from pre-existing top-level collections. Authentication users are shared at the project level.
4. Protect `storybranch/{document=**}` against all client reads/writes. The app uses the server API, not the client Firestore SDK. Admin SDK access uses IAM and bypasses Firestore client rules. If this project has another app, inspect and merge its rules; do not replace them with the emulator rules. A permissive overlapping wildcard rule can override a restrictive match, so check that no other rule grants client writes here.
5. Add the composite collection index for `playthroughs`: `playerUid` ascending, `updatedAt` descending, collection scope (as described in `firebase/firestore.indexes.json`). Do not overwrite other indexes in a reused project.
6. Create/download a service-account key from Project settings > Service accounts for the server. Prefer a dedicated runtime account with Firestore access and Firebase Authentication read access; the server reads disabled/revoked user status. A service account from another project is rejected by the JSON credential path. Use a credential authorized for this project when using Application Default Credentials.

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

The live seed writes only sample content under `storybranch/app`. It creates missing records and promotes the known pre-page `v1` sample catalogue/branch/published pointers to `pages-v1`; newer pointers and placements are left alone. Existing immutable versions must have identical hashes. It does not create Auth accounts or demo profiles. Run it with server credentials to publish the three root mock stories. Repeat safely to fill missing sample content.

## Netlify

In the site's environment variables, add `FIREBASE_SERVICE_ACCOUNT_JSON` containing the entire downloaded JSON. Mark it secret and scope it to **Functions** (or all scopes if your plan does not offer scope selection). Do not put it into `netlify.toml`, GitHub, chat, or a `VITE_` variable. The browser already has the public config.

The default server mode is `firebase`; an explicit `STORYBRANCH_MODE=firebase` in Functions is also supported. Remove old `STORYBRANCH_MODE=emulator`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `STORYBRANCH_PHONE_PREVIEW`, `VITE_PHONE_PREVIEW`, and `VITE_STORYBRANCH_MODE=emulator` overrides from the production deployment.

Redeploy after changing runtime environment variables. The build command remains `pnpm build`; publish `dist`. `/api/catalogue` should return HTTP 200 with Glass Harbor after credentials and seed are complete. Sign in with the real Firebase test user, begin a journey, choose a route, reload, and verify the saved scene.

## Storage for clip uploads

The project's default bucket `storybranch-f77a3.firebasestorage.app` exists. Before hosted uploads work, an administrator must deploy `firebase/storage.rules`. If another app shares this bucket, merge its rules first instead of replacing them.

```sh
pnpm exec firebase deploy --only storage --project storybranch-f77a3
```

The rules read `storybranch/app/assets/{assetId}` from Firestore to authorize each upload. The first deploy asks to let Storage rules read Firestore; accept it. No CORS configuration is needed: the Storage SDK and `<video>` playback work without it. Uploading is limited to `STORYBRANCH_PUBLISHER_UIDS`. Locally the Storage emulator runs on port 9299 with the other emulators.

## Vercel

`vercel.json` builds with `pnpm build:vercel`, serves `dist`, and routes every `/api/*` request to `api/index.js`. That function re-exports a Vite bundle of the same handler (`vite.api.config.ts` → `dist-api/`), because Vercel compiles TypeScript functions file by file and cannot resolve this project's extensionless ESM imports. Netlify configuration is unchanged; both hosts can run side by side.

In Project → Settings → Environment Variables, add `FIREBASE_SERVICE_ACCOUNT_JSON` (entire JSON, marked Sensitive), `STORYBRANCH_PUBLISHER_UIDS`, and `ENABLE_EXPERIMENTAL_COREPACK=1` so the install uses the pinned pnpm version. Add the `*.vercel.app` and any custom domain to Firebase Authentication → Settings → Authorized domains. Redeploy after changing variables.

Netlify variables declared only in `netlify.toml` are not available to Functions: [Netlify documentation](https://docs.netlify.com/build/functions/environment-variables/). Admin setup: [Firebase documentation](https://firebase.google.com/docs/admin/setup).

## Verification status

Live save-list index: the `playthroughs` composite index now exists in `storybranch-f77a3`. On October 14, 2026 the saves-list query shape (`playerUid` equality, `updatedAt` and document ID descending), which the save list and dashboard share, succeeded read-only against the live project. It previously failed with `FAILED_PRECONDITION`; the runtime credential cannot create indexes (IAM `PERMISSION_DENIED`), so new projects still need an administrator to add it as described above. The player no longer refreshes the save list after every successful choice. List failures show a separate retry notice on catalogue/library screens, not a failed-choice message. Chrome regression `node --import tsx scripts/save-list-check.ts` verifies that choices persist and reload while the list endpoint returns 503.

Configuration tests reject invalid modes, non-loopback emulators and mixed live/emulator settings. Emulator integration tests cover auth, cross-user denial, idempotency, races, pinned saves, isolated side quests and profile bootstrap preserving existing/disabled profiles. Live credentials, existing project rules/indexes, provider enablement and real hosted sign-in still require verification after project access is supplied. The public web configuration alone cannot authorize server writes.

Google sign-in uses a user-triggered popup; blocked or cancelled popups leave the form open with recovery guidance. The isolated phone tunnel supports email signup but not Google OAuth. Production Google OAuth and physical-device popup behavior require manual verification.

Authentication update verification: typecheck, production build, 20 unit/domain tests and 9 emulator integration tests passed. Chrome at 390px verified password mismatch handling, email registration, session persistence after reload, new-player save creation, sign-out/sign-in/resume, and opening/cancelling the Google emulator popup. Run `pnpm test:auth` with the emulator dev server. A real Google account consent flow was not performed. Live sample content was seeded and the local function successfully read the live catalogue; Since October 14, 2026 Vercel production has credentials and serves the live catalogue.
