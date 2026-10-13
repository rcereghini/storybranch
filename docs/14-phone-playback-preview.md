# Phone playback preview

This is a disposable, access-controlled test of the actual player, not a production deployment. It uses a separate `demo-storybranch-phone` Firebase emulator project and separate ports. It does not import or modify normal local saves. Phone saves last only until these emulators stop.

## Running it

Use the normal Node/pnpm/Java prerequisites from README. In one terminal:

```sh
pnpm phone:emulators
```

In another:

```sh
pnpm phone:seed
pnpm phone:build
pnpm phone:serve
```

The gateway listens only on `127.0.0.1:4173`. The preview Auth emulator is on 9199 and Firestore on 8180; their administrative ports are never tunneled. Only the static `dist-phone` bundle, application API, and three exact Firebase sign-in/lookup/token endpoints are served. MP4 byte-range requests are supported. Development source/HMR, emulator management, account creation and direct Firestore are not exposed.

Tunnel **4173 only** through an HTTPS provider. A Cloudflare Quick Tunnel can normally be started using `cloudflared tunnel --url http://127.0.0.1:4173`. On this machine it failed edge certificate validation, even after supplying the existing Windows root certificates. TLS verification was not disabled. The successful fallback was LocalTunnel 2.0.2 (`lt --port 4173 --local-host 127.0.0.1`), installed temporarily rather than as an application dependency. Its provider may show a one-time host-IP confirmation before the app.

Read the random key from ignored `.phone-preview.json`, and open:

```text
https://<tunnel-host>/preview-access?key=<key>
```

That exchanges the link for an HttpOnly same-site cookie and redirects to the catalogue. The key is not part of shared story links or checked-in docs. Treat the access link as private. It grants access to this shared test environment, whose demo credentials are intentionally public. The gateway expires after eight hours; restarting it rotates the key. Keep the computer awake and the gateway, emulators, and tunnel running. Stop the tunnel with Ctrl+C to remove external access immediately; stop the other processes with Ctrl+C when finished. New tunnel sessions may receive a different URL.

Sign in with `player@storybranch.test` / `HarborDemo123!`. For the successful rooftop route use `progressed@storybranch.test` with the same password. The sign-in form defaults to the first account. These credentials are for this disposable environment only.

## Verification

`pnpm test:phone` checks the local gateway. To run against a tunnel, set `PHONE_PREVIEW_URL` to its HTTPS origin. For LocalTunnel's confirmation set `TUNNEL_CONFIRM_IP` to the address its prompt displays. It checks private access, denied administrative/source endpoints, unauthenticated API rejection, same-origin Firebase login, byte-range MP4 delivery, audible media playback, a server-validated choice and resume after reload at 390 CSS pixels.

October 12, 2026: this suite passed locally and against the real public HTTPS URL in desktop Chrome. TypeScript, production build, eight domain/foundation checks and eight emulator authorization/persistence tests also passed. Physical Safari and social-app browser results remain pending. A narrow Chrome viewport is not an iPhone test.

## Physical phone acceptance

Open the private access link in Safari on the iPhone, ideally on cellular first. Record iPhone model, iOS version and browser. Repeat using a link opened inside a social app; open the access link there too because browser cookies are separate.

1. Sign in, begin a new journey, and tap **Start story with sound** once. Confirm the wash and bell notes are audible.
2. Let the clip finish, choose the courier, then follow the lanterns. Each choice should start another audible clip without an extra Play tap.
3. Pause, resume, mute/unmute and rotate the phone. Controls must remain usable; rotation must not change the selected story route.
4. Background the browser for 15 seconds and return. Lock/unlock the phone and return. Record whether an extra resume tap is needed and whether audio overlaps or fails.
5. Reload and resume the save. The saved scene must survive; one new sound-start tap after opening/reloading the player is expected.
6. Try with a slower connection. A rejected or pending save must not advance the scene. If playback is blocked, Play scene must recover without losing progress.

**Decision gate:** ordinary choices after initial sound start should not routinely need a second playback tap. Document any extra taps, silence, stalled clips or progress mismatch before investing in more player polish. These fixtures have six-second synthesized ambience and no narration; every scene currently reuses it.
