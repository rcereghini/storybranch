# Storybranch

Storybranch is a working name for a video based interactive storytelling platform. Players discover and play adventures, creators build video story graphs, and the community adds side quests without replacing the original adventure.

This repository contains a working M0 foundation and M1 local playable prototype, plus the product specifications. React/TypeScript now defaults to Firebase Authentication and Firestore project `storybranch-f77a3` locally and on Netlify. Server credentials are required for that mode; explicit emulator mode remains credential-free. See [shared Firebase setup](docs/15-shared-firebase-setup.md). Implementation and verification notes: [M0/M1 delivery record](docs/12-local-prototype.md).

The player now uses a landscape overlay on larger screens and an authored portrait rendition at ≤700px. Opening the player offers **Start story with sound**. After that explicit tap, saved choices start the next scene automatically using the same video element. Story controls fade during playback; pause, completion or **Skip to choices** restores them. If the browser blocks autoplay, **Play scene** provides a manual fallback. **Share this adventure** offers public story-link sharing/copying and a downloadable portrait MP4 teaser. Links remain local until hosting is configured. See [responsive video and sharing](docs/13-responsive-video-and-sharing.md) for the research, behavior and limits.

## Run against shared Firebase

The player now supports five explicit page types and two additional mixed-page stories: **The Clockwork Door** and **The Storm Signal**. See [Story and Page model](docs/16-story-pages.md). Reseed to publish the new `pages-v1` editions. Pre-page prototype saves require a new journey; accounts are unchanged.

Follow [shared Firebase setup](docs/15-shared-firebase-setup.md) to install server credentials in ignored `.secrets/` and `.env.local`, then run `pnpm seed:firebase` and `pnpm dev`. Use a real Firebase Email/Password account; local and hosted saves share the same namespaced data.

## Run locally with emulators

For isolated HTTPS testing on a real phone, see [phone playback preview](docs/14-phone-playback-preview.md). The phone preview has its own disposable emulator data and a private, expiring access link.

Requirements: Node 24, pnpm 11.25.0, Java 21 (on PATH or `JAVA_HOME`). The first emulator run downloads Firebase's emulator binaries. This workspace also has an ignored local Java runtime under `.tools/java`; the launcher uses it automatically when `JAVA_HOME` is unset.

```sh
pnpm install --frozen-lockfile
pnpm emulators
```

Leave the emulators running. In a second terminal:

```sh
pnpm seed
pnpm dev:emulator
```

Open [Storybranch](http://127.0.0.1:5173). The API listens on port 3001, Auth on 9099, Firestore on 8080, and the [emulator console](http://127.0.0.1:4000) on 4000. All bind to loopback. Use **Sign in**, then **Begin your story**. Signing in lands on the catalogue; `/adventures` lists saved journeys. The story detail route also offers **Start a new journey** when older saves exist.

| Account | Password | Starting agility |
| --- | --- | --- |
| `player@storybranch.test` | `HarborDemo123!` | 5 (rooftop check fails) |
| `progressed@storybranch.test` | `HarborDemo123!` | 8 (rooftop check succeeds) |

These are intentionally public, emulator-only credentials. Additional creator/author/moderator fixture identities have no privileged application features. Email/password registration and Google sign-in are supported. Enable both providers for hosted use. Never reuse these passwords for real accounts.

Speak to the courier for the harbor pass, visit the market, try a rooftop escape, or explore either community side quest. Return to the main adventure at any time. Side-quest state never merges into the parent. Replay a loop through the courier to see that its token is awarded once.

Stop `pnpm emulators` with Ctrl+C to export saves and accounts to ignored `.emulator-data`; the next start imports them. Reseeding preserves existing profiles and immutable editions. Changing an existing fixture requires a new version ID. To explicitly export while running: `pnpm exec firebase emulators:export .emulator-data --project demo-storybranch --force`.

## Checks

```sh
pnpm check                 # types, pure domain/boundary tests, production build
pnpm test:integration      # running emulators + seeded data required
pnpm test:browser          # emulators + seed + pnpm dev:emulator required
pnpm test:auth             # same emulator setup; registration, sign-in and resume
pnpm test:audio            # shipped audio clips, delayed choice response
pnpm test:media            # verifies non-silent audio in every shipped MP4
pnpm test:scenes           # verifies distinct scenes autoplay in landscape/portrait
pnpm exec playwright install webkit
pnpm test:audio --webkit   # optional Windows WebKit engine check, not real iOS
```

Browser checks use installed Chrome on Windows, otherwise Playwright Chromium (`pnpm exec playwright install chromium`). Screenshots are written to ignored `test-results/`. The player and downloadable teaser now use six-second H.264/AAC clips with audible synthesized harbor wash and three bell notes. They have no narration. `pnpm media:audio` generates these renditions from local SVGs (requires the dev server and Chrome with H.264/AAC recording). Original silent assets remain preserved; full scene transcripts carry the narrative. No external media or generation service is used. CI configuration runs the same checks, but a hosted CI run has not yet occurred.

`pnpm media:portrait` generates the separate 1080×1920 phone and social-teaser MP4 fixtures using H.264-capable Chrome. Normal setup uses the included files. Use new rendition IDs for future media changes. Social upload acceptance and physical-device share sheets have not been tested; this is a local teaser download, not an automatic posting integration.

The production bundle is in `dist/`. `netlify.toml` defines static hosting, generated story/creator metadata, and API function routing. The default deployment uses `storybranch-f77a3` and requires server-only Firebase credentials, Firestore setup and sample content seeding. See [shared Firebase setup](docs/15-shared-firebase-setup.md). Moderation, broader production hardening and live end-to-end verification remain outstanding.

If this machine's bundled Node is the only runtime on PATH, pnpm is at `C:\Users\rcere\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`. In PowerShell, invoke that path with `&`. If a corporate TLS certificate prevents downloads, enable the trusted OS certificate store with `$env:NODE_USE_SYSTEM_CA='1'`; do not disable TLS verification. Java 21 can be installed normally; `.tools/` is not source-controlled.

## Source layout

- `apps/web`: responsive catalogue, Firebase auth adapter, player, saves and story log.
- `packages/domain`: deterministic engine; no React, Firebase, browser or Node imports.
- `packages/contracts`: bounded runtime schemas, serializable state and command types.
- `packages/api-client`: injected transport/token adapter; `packages/design-tokens`: shared visual tokens.
- `services/api`: token verification, ownership checks, Firestore transactions and receipts; `services/functions`: Netlify adapter.
- `firebase`: deny-by-default rules and the exact save-list index; `fixtures`: immutable sample stories.
- `scripts`, `tests`: emulator setup, seed, metadata, media generation and verification.

## Start here

Read [Product requirements](docs/01-product-requirements.md), [Game and community rules](docs/02-game-and-community-rules.md), and [Decisions and open questions](docs/10-decisions-and-open-questions.md) first. For implementation, also read the architecture, data contracts, and the relevant acceptance criteria.

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/01-product-requirements.md) | Vision, confirmed requirements, scope, and success measures |
| [Game and community rules](docs/02-game-and-community-rules.md) | Stats, keys, progression, combat, side quests, featured placements, and trades |
| [Experience and interface](docs/03-experience-and-interface.md) | Screens, navigation, player flow, authoring, accessibility, and visual direction |
| [Technical architecture](docs/04-technical-architecture.md) | React and TypeScript, Firebase, Netlify, asynchronous work, and native portability |
| [Data and API contracts](docs/05-data-and-api-contracts.md) | Entities, permissions, commands, versioning, and concurrency |
| [Video generation and economy](docs/06-video-generation-and-economy.md) | Provider integration, credits, jobs, failure recovery, and commercial assumptions |
| [Safety and operations](docs/07-safety-and-operations.md) | Content controls, security, observability, backups, and service budgets |
| [Delivery and acceptance](docs/08-delivery-and-acceptance.md) | Dependency ordered releases and testable completion criteria |
| [Future prompt pack](docs/09-future-prompt-pack.md) | Copyable prompts for bounded implementation tasks |
| [Decisions and open questions](docs/10-decisions-and-open-questions.md) | Confirmed choices, proposed defaults, and decisions required before release |
| [Technical sources](docs/11-technical-sources.md) | Official references and integration verification checklist |

## How to use these documents

The user's latest instruction takes precedence. Confirmed requirements describe requested behavior. Proposed defaults are design recommendations that may be used for prototypes but are not approved commercial policies. Unresolved decisions must remain visible; do not silently turn them into production promises.

The decision register owns decision status. The game rules own gameplay semantics, the data contracts own persistence and command semantics, and the delivery document owns release acceptance. If a change crosses those boundaries, update the affected documents together.

Begin future prompts with the context block in the prompt pack and name one delivery milestone. Do not ask an implementation agent to build the entire product in one pass. No cloud resources, billing accounts, or external publishing have been configured by this documentation work.


