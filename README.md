# Storybranch

Storybranch is a working name for a video based interactive storytelling platform. Players discover and play adventures, creators build video story graphs, and the community adds side quests without replacing the original adventure.

For Story-related work, start with the [Story system documentation](docs/story-system/README.md) and [canonical terminology](docs/story-system/terminology.md): Story, StoryTrunk, connected StoryNodes, their StoryBranches, and StoryLeaves. The documentation covers node types, Story/Player/User contexts, keys, storage, AI boundaries and flow charts. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [documentation workflow](docs/development-workflow.md) before planning or editing. The [October 23 review](docs/story-system/current-state-review.md) records the latest pull and verification limits. Target design is explicitly distinguished from current implementation.

This repository contains a working M0 foundation and M1 local playable prototype, plus the product specifications. React/TypeScript now defaults to Firebase Authentication and Firestore project `storybranch-f77a3` locally and in production. Production runs on Vercel at https://www.storybranch.com. Server credentials are required for that mode; explicit emulator mode remains credential-free. See [shared Firebase setup](docs/15-shared-firebase-setup.md). Implementation and verification notes: [M0/M1 delivery record](docs/12-local-prototype.md).

The player now uses a landscape overlay on larger screens and an authored portrait rendition at ≤700px. Opening a story attempts audible playback automatically. If the browser requires a gesture, a large centered **Start story with sound** button appears. Saved choices reuse the same video element. Loading announcements do not move the video; the last frame covers clip loading, and custom controls replace the native timeline. Story controls fade during playback; pause, completion or **Skip to choices** restores them. If the browser blocks autoplay, **Play scene** provides a manual fallback. **Share this adventure** offers public story-link sharing/copying and a downloadable portrait MP4 teaser. Shared links use the address they were copied from, so production links point at https://www.storybranch.com. See [responsive video and sharing](docs/13-responsive-video-and-sharing.md) for the research, behavior and limits.

## Run against shared Firebase

Signed-in players land on their **Dashboard**: profile with display name and avatar, shared stats, progress across stories, endings found and where they left off. The catalogue lives under **Discover** (`/discover`). See [Player dashboard and profile](docs/18-player-dashboard.md).

**Create** opens the new Creator Studio: private drafts, all seven StoryNode types, personality-quiz and comic templates, output routing, playable preview and immutable publication to Discover. See [Creator Studio setup and limits](docs/17-creator-studio.md). Video StoryNodes can use sample clips or uploaded MP4/WebM clips stored in Firebase Storage. Hosted publishing needs the account's `publish` feature (`pnpm features grant <email> publish`, see [Account access](docs/15-shared-firebase-setup.md#account-access)); emulator accounts can publish immediately.

The player now supports seven explicit StoryNode types, including Comic, and sample stories such as **The Clockwork Door**, **The Storm Signal** and the personality quiz **What Kind of Explorer Are You?**. See [Story and StoryNode model](docs/16-story-nodes.md). Reseed to publish the sample `story-nodes-v1` editions. Pre-StoryNode prototype saves require a new journey; accounts are unchanged.

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

Open [Storybranch](http://127.0.0.1:5173). The API listens on port 3001, Auth on 9099, Firestore on 8080, and the [emulator console](http://127.0.0.1:4000) on 4000. All bind to loopback. Use **Sign in**, then **Begin your story**. Signing in lands on the dashboard; **Discover** (`/discover`) is the catalogue and `/adventures` lists saved journeys. The story detail route also offers **Start a new journey** when older saves exist.

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
pnpm test:studio           # create, save/reload, preview, publish and play
pnpm test:auth             # same emulator setup; registration, sign-in and resume
pnpm test:audio            # shipped audio clips, delayed choice response
pnpm test:media            # verifies non-silent audio in every shipped MP4
pnpm test:scenes           # verifies distinct scenes autoplay in landscape/portrait
pnpm exec playwright install webkit
pnpm test:audio --webkit   # optional Windows WebKit engine check, not real iOS
```

Browser checks use Google Chrome on every platform (`pnpm exec playwright install --with-deps chrome`) so local runs and Linux CI have the H.264/AAC codecs required by the shipped clips. Screenshots and failure traces are written to ignored `test-results/`. The player and downloadable teaser now use six-second H.264/AAC clips with audible synthesized harbor wash and three bell notes. They have no narration. `pnpm media:audio` generates these renditions from local SVGs (requires the dev server and Chrome with H.264/AAC recording). Original silent assets remain preserved; full scene transcripts carry the narrative. No external media or generation service is used. CI runs the same checks; browser failures upload a screenshot and a Playwright trace for diagnosis.

`pnpm media:portrait` generates the separate 1080×1920 phone and social-teaser MP4 fixtures using H.264-capable Chrome. Normal setup uses the included files. Use new rendition IDs for future media changes. Social upload acceptance and physical-device share sheets have not been tested; this is a local teaser download, not an automatic posting integration.

The production bundle is in `dist/`. `vercel.json` defines static hosting, generated story/creator metadata, and API function routing (see [Vercel setup](docs/15-shared-firebase-setup.md#vercel)). The default deployment uses `storybranch-f77a3` and requires server-only Firebase credentials, Firestore setup and sample content seeding. See [shared Firebase setup](docs/15-shared-firebase-setup.md). Moderation, broader production hardening and live end-to-end verification remain outstanding.

If `pnpm` is not on PATH, run `corepack enable`; `package.json` pins pnpm 11.25.0. If a corporate TLS certificate prevents downloads, enable the trusted OS certificate store with `$env:NODE_USE_SYSTEM_CA='1'`; do not disable TLS verification. Java 21 can be installed normally; `.tools/` is not source-controlled.

## Source layout

- `apps/web`: responsive catalogue, Firebase auth adapter, player, saves and story log.
- `packages/domain`: deterministic engine; no React, Firebase, browser or Node imports.
- `packages/contracts`: bounded runtime schemas, serializable state and command types.
- `packages/api-client`: injected transport/token adapter; `packages/design-tokens`: shared visual tokens.
- `services/api`: token verification, ownership checks, Firestore transactions and receipts; `services/functions`: hosted entry that reports missing server credentials; `api/index.js`: Vercel entry that re-exports the bundled handler.
- `firebase`: deny-by-default rules and the exact save-list index; `fixtures`: immutable sample stories.
- `scripts`, `tests`: emulator setup, seed, metadata, media generation and verification.

## Start here

Read [CONTRIBUTING](CONTRIBUTING.md) and follow the [documentation reading map](docs/development-workflow.md). For Story work, the [Story system index](docs/story-system/README.md) is the architectural entry point; it links the current implementation contract and topic-specific target documents. [Product requirements](docs/01-product-requirements.md), [Game and community rules](docs/02-game-and-community-rules.md), and [Decisions and open questions](docs/10-decisions-and-open-questions.md) supply broader product context. Read the relevant acceptance criteria before implementation.

| Document | Purpose |
| --- | --- |
| [Story terminology](docs/story-system/terminology.md) | Canonical graph vocabulary, connectivity, and mappings to existing code names |
| [Story system](docs/story-system/README.md) | Canonical target architecture, StoryNode types, contexts, keys, storage, AI and example flows |
| [Contribution and documentation workflow](CONTRIBUTING.md) | Required reading, scoped guides and review before committing |
| [Current-state review](docs/story-system/current-state-review.md) | Latest pull, inspected architecture, target gaps and actual verification limits |
| [Product requirements](docs/01-product-requirements.md) | Vision, confirmed requirements, scope, and success measures |
| [Game and community rules](docs/02-game-and-community-rules.md) | Stats, keys, progression, combat, side quests, featured placements, and trades |
| [Experience and interface](docs/03-experience-and-interface.md) | Screens, navigation, player flow, authoring, accessibility, and visual direction |
| [Technical architecture](docs/04-technical-architecture.md) | React and TypeScript, Firebase, Vercel, asynchronous work, and native portability |
| [Data and API contracts](docs/05-data-and-api-contracts.md) | Entities, permissions, commands, versioning, and concurrency |
| [Video generation and economy](docs/06-video-generation-and-economy.md) | Provider integration, credits, jobs, failure recovery, and commercial assumptions |
| [Safety and operations](docs/07-safety-and-operations.md) | Content controls, security, observability, backups, and service budgets |
| [Delivery and acceptance](docs/08-delivery-and-acceptance.md) | Dependency ordered releases and testable completion criteria |
| [Future prompt pack](docs/09-future-prompt-pack.md) | Copyable prompts for bounded implementation tasks |
| [Decisions and open questions](docs/10-decisions-and-open-questions.md) | Confirmed choices, proposed defaults, and decisions required before release |
| [Technical sources](docs/11-technical-sources.md) | Official references and integration verification checklist |
| [M0/M1 delivery record](docs/12-local-prototype.md) | What the first local slice delivered, its API and verification evidence |
| [Responsive video and sharing](docs/13-responsive-video-and-sharing.md) | Landscape/portrait player, teaser video and share links |
| [Phone playback preview](docs/14-phone-playback-preview.md) | Private HTTPS tunnel for testing on a real phone |
| [Shared Firebase setup](docs/15-shared-firebase-setup.md) | Live Firebase project, credentials and Vercel hosting |
| [Story and StoryNode model](docs/16-story-nodes.md) | Current StoryNode-type contract; read before changing stories, StoryNodes or routing |
| [Creator Studio](docs/17-creator-studio.md) | Drafts, preview, publishing and publishing access |
| [Player dashboard](docs/18-player-dashboard.md) | Dashboard home, profile customization and progress summary |
| [Copilot](docs/19-copilot.md) | In-app chat assistant: phases, contract, limits and the video model test |
| [Admin dashboard](docs/20-admin.md) | Admins, managing accounts and stories, audit log |
| [Design system](docs/21-design-system.md) | Light and dark themes, tokens, fonts, shell and component rules |

## How to use these documents

The user's latest instruction takes precedence. Confirmed requirements describe requested behavior. Proposed defaults are design recommendations that may be used for prototypes but are not approved commercial policies. Unresolved decisions must remain visible; do not silently turn them into production promises.

The product decision register owns product/commercial status. For Story architecture, follow [document authority and ownership](docs/story-system/README.md#authority-and-status) and the [Story decision register](docs/story-system/decisions.md); earlier node-only schemas are historical. The delivery document owns milestone acceptance. If a change crosses boundaries, update the affected owning documents together.

Begin future prompts with the context block in the prompt pack and name one delivery milestone. Do not ask an implementation agent to build the entire product in one pass. No cloud resources, billing accounts, or external publishing have been configured by this documentation work.


