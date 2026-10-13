# Shared Firebase setup: local and Netlify

The default browser and API configuration targets `storybranch-f77a3`. `pnpm dev` and the normal Netlify build use this same project. Local and hosted play therefore share accounts and saves. Emulators remain available explicitly with `pnpm dev:emulator`; the optional phone tunnel remains an isolated disposable emulator preview.

The web config in `fixtures/firebase-config.ts` is public. Analytics is not initialized. Admin credentials are server-only and must never use a `VITE_` prefix or be committed.

## Firebase Console

For project `storybranch-f77a3`:

1. Enable Authentication > Sign-in method > Email/Password. Use an existing real account or add a test user under Authentication > Users. The app currently supports sign-in, not self-registration. Do not create the public emulator demo passwords in the live project.
2. Include `storybranch.com`, your Netlify site hostname, and `localhost` in Authentication > Settings > Authorized domains as appropriate.
3. Ensure a `(default)` Firestore database exists. Records are stored under `storybranch/app/...`, keeping them separate from pre-existing top-level collections. Authentication users are shared at the project level.
4. Protect `storybranch/{document=**}` against all client reads/writes. The app uses the server API, not the client Firestore SDK. Admin SDK access uses IAM and bypasses Firestore client rules. If this project has another app, inspect and merge its rules; do not replace them with the emulator rules. A permissive overlapping wildcard rule can override a restrictive match, so check that no other rule grants client writes here.
5. Add the composite collection index for `playthroughs`: `playerUid` ascending, `updatedAt` descending, collection scope (as described in `firebase/firestore.indexes.json`). Do not overwrite other indexes in a reused project.
6. Create/download a service-account key from Project settings > Service accounts for the server. Prefer a dedicated runtime account with Firestore access and Firebase Authentication read access; the server reads disabled/revoked user status. A service account from another project is rejected by the JSON credential path. Use a credential authorized for this project when using Application Default Credentials.

A new authenticated player's Storybranch profile is initialized by the API with prototype base stats (agility 5). Existing stats and disabled profiles are preserved. There is no trading, payments or combat implementation.

## Local server

Place the downloaded key at `.secrets/firebase-admin.json` (ignored by Git). Copy `.env.example` to `.env.local` and adjust the absolute credential path for this checkout:

```dotenv
STORYBRANCH_MODE=firebase
GOOGLE_APPLICATION_CREDENTIALS=C:/GameDev/storybranch/.secrets/firebase-admin.json
```

Remove emulator-host variables from this live shell. Mixed live/emulator configuration fails closed.

```sh
pnpm seed:firebase
pnpm dev
```

The live seed writes only sample content under `storybranch/app`; existing catalogue, placement and published pointers are not overwritten, and existing immutable versions must have identical hashes. It does not create Auth accounts or demo profiles. Run it once with server credentials before expecting the catalogue to enable Begin your story. Repeat safely to fill missing sample content.

## Netlify

In the site's environment variables, add `FIREBASE_SERVICE_ACCOUNT_JSON` containing the entire downloaded JSON. Mark it secret and scope it to **Functions** (or all scopes if your plan does not offer scope selection). Do not put it into `netlify.toml`, GitHub, chat, or a `VITE_` variable. The browser already has the public config.

The default server mode is `firebase`; an explicit `STORYBRANCH_MODE=firebase` in Functions is also supported. Remove old `STORYBRANCH_MODE=emulator`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `STORYBRANCH_PHONE_PREVIEW`, `VITE_PHONE_PREVIEW`, and `VITE_STORYBRANCH_MODE=emulator` overrides from the production deployment.

Redeploy after changing runtime environment variables. The build command remains `pnpm build`; publish `dist`. `/api/catalogue` should return HTTP 200 with Glass Harbor after credentials and seed are complete. Sign in with the real Firebase test user, begin a journey, choose a route, reload, and verify the saved scene.

Netlify variables declared only in `netlify.toml` are not available to Functions: [Netlify documentation](https://docs.netlify.com/build/functions/environment-variables/). Admin setup: [Firebase documentation](https://firebase.google.com/docs/admin/setup).

## Verification status

Configuration tests reject invalid modes, non-loopback emulators and mixed live/emulator settings. Emulator integration tests cover auth, cross-user denial, idempotency, races, pinned saves, isolated side quests and profile bootstrap preserving existing/disabled profiles. Live credentials, existing project rules/indexes, provider enablement and real hosted sign-in still require verification after project access is supplied. The public web configuration alone cannot authorize server writes.
