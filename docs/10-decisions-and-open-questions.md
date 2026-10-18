# Storybranch decisions and open questions

Creator alpha implementation assumptions (October 14, 2026): private drafts are available to active accounts; hosted publication requires the account's `publish` feature flag (a server-side UID allowlist until October 18, 2026); publication is public and atomic for a bounded graph of up to 80 pages. The first editor uses shipped sample clips and a disposable client preview. Uploads, moderation and community branch authoring are not enabled by this slice. These are prototype defaults, not settled public-launch policy. See [Creator Studio](17-creator-studio.md).

This register distinguishes the user's requirements from proposed defaults. A proposed default can guide a reversible prototype. It must not become an undisclosed paid-service or content-permission promise.

## Confirmed decisions

October 13: Stories own context and typed pages; every renderer uses a shared Page parent with explicit inputs/outputs. Remove obsolete prototype compatibility rather than carrying implicit video-only pages. See [Story and Page model](16-story-pages.md). RPG combat remains deferred. Dice and linear Continue behavior are prototype defaults documented there.

| ID | Decision | Source |
| --- | --- | --- |
| C01 | Web first, mobile friendly, with an easier path to native clients | Initial request |
| C02 | React and TypeScript, Firebase login/database, Vercel hosting | Initial request named Netlify; changed to Vercel October 15, 2026 and the Netlify configuration removed |
| C03 | Video stories with creator tools, shareable story/library links, and social controls | Initial request |
| C04 | Generic shared stats, unique story keys, player levels, achievements, and log | Initial request |
| C05 | Optional command based combat with win/loss story routes | Initial request |
| C06 | In-app video generation and a currency to fund it | Initial request |
| C07 | Public catalogue as logged-in home with streaming-library and retro-game influences | Initial request |
| C08 | Community openness defaults on for published non-paid stories | Initial request |
| C09 | Community side quests use separate instances from the core playthrough | Initial request |
| C10 | One prominent branch placement at a location, while other branches remain in a secondary fan-fiction style list | User clarification |
| C11 | Players can initiate trades involving the exclusive branch right | Initial request; interpreted as featured placement following C10 |
| C12 | Prefer landscape presentation on larger screens; support portrait at small breakpoints, with social clip sharing as a product goal | October 12, 2026 user direction |
| C13 | Video is the primary player content; choosing a route starts the next clip and the interface fades during playback | October 12, 2026 user direction |

## Proposed defaults

Implementation default for C12: 16:9 desktop, 9:16 mobile at ≤700 CSS pixels, and independent 9:16 social teaser renditions. The aspect choices follow platform guidance; the numerical breakpoint, safe-zone treatment and export details remain adjustable. This does not claim universal audience preference for vertical narrative video.

| ID | Default | Reason and impact |
| --- | --- | --- |
| P01 | Storybranch is a working name | Uses the workspace name without assuming final branding |
| P02 | Shared account stats are snapshotted at root story start | Supports a persistent character without changing saved story checks unexpectedly |
| P03 | Strength, agility, intellect, resolve, charisma; simple versioned level curve | Provides a usable prototype vocabulary; balancing remains adjustable |
| P04 | Child runs copy allowlisted entry state and do not merge local rewards back | Prevents community content from corrupting or farming the parent |
| P05 | Featured ownership means one prominent, attributed entry option | Gives a clear initial UI without allowing replacement of base choices |
| P06 | Initial claim requires a published eligible branch, is free, and uses first valid commit | Avoids speculative empty reservations; still needs anti-hoarding review |
| P07 | Three placement holdings per account for prototype testing | Exercises limits; not an approved public allocation policy |
| P08 | Trades are gifts or placement swaps with no money or credits | Implements requested trading without silently creating a financial marketplace |
| P09 | Free creators may explicitly opt out of the default open setting | User specified a default, not an irrevocable mandatory license |
| P10 | Authorized existing branches survive later closure to new branching | Protects community work; final derivative terms remain a launch gate |
| P11 | Platform XP only from validated reward definitions | Prevents arbitrary creator-authored XP farming |
| P12 | Credits fund generation only; failed deliverables release reserved credits | Separates creation costs from gameplay and enables clear accounting |
| P13 | Firebase Storage for media; durable Google Cloud worker/queue for production jobs | Complements Firebase data and Vercel hosting without long-lived web requests |
| P14 | Account required to save/play persistently; public story detail and catalogue can be browsed anonymously | Keeps discovery shareable and authoritative saves simple |
| P15 | No nested community branches or multiplayer in v1 | Bounds state and provenance complexity |
| P16 | Signed-in players land on a dashboard; the catalogue moves to Discover | Built October 14, 2026. Changes C07 (catalogue as logged-in home), so it needs explicit confirmation or reverting |
| P17 | Production hosting on Vercel | Confirmed October 15, 2026 and folded into C02; Netlify is retired |

## Decisions required before the relevant feature launches

| Question | Recommended starting position | Gate |
| --- | --- | --- |
| Does free publication merely default open, or must it remain open? | Default open with clear explicit choice | Public creator release |
| What permissions cover remixing text, video, references, and inherited assets? | Versioned permission receipt with attribution and explicit reuse scope | Public community release |
| Who selects the featured holder: first claim, base author, rotation, or another policy? | Test first claim in closed alpha, measure hoarding and creator satisfaction | Public featured placement |
| Can a base author reject a holder or require review before their option appears? | Retain moderation reporting; decide editorial powers explicitly | Public featured placement |
| When do inactive or retired holdings expire, and is anything compensated? | Avoid selling placements before lifecycle rules are settled | Public featured placement |
| Can a placement have multiple prominent choices? | One entry option initially | Featured interface implementation |
| Can side quest rewards flow back into the parent? | No in v1; later explicit validated reward contracts | Community gameplay expansion |
| Should shared stat values update live in active stories? | Snapshot at start | Progression implementation |
| Can items become account-wide? | Keep story items local | Progression expansion |
| Which provider/model configurations and commercial rights are acceptable? | Verify Higgsfield API as first candidate; retain an adapter boundary | Live generation |
| What is the cancellation/refund policy after provider acceptance? | State costs clearly and reconcile before settlement | Paid generation |
| Which payment processor, credit packs, margins, expiry, and paid benefits? | Separate consumable credits from subscriptions; no cash trading initially | Real checkout |
| What age audience and content categories are allowed? | Decide before public uploads; configure moderation accordingly | Public launch |
| What geographic availability and native billing approach apply? | Web release first; native policy review at M7 | Paid distribution |
| Which platform achievements grant account XP and how are they reviewed? | Curated reward catalogue for beta | Public account progression |
| What budgets, expected concurrency, retention, and recovery targets are acceptable? | Measure staging costs and validate proposed operational targets | Production rollout |

## Product direction (October 14, 2026)

The working plan for AI-generated clips lives in the Claude Doc "Storybranch: AI clips idea vs. our plan": hand-make one AI-clip story before building in-app generation, fix sharing, trial a personality-quiz template, then implement [generation and credits](06-video-generation-and-economy.md). Clip length (6–12 seconds or 30) and whether to pursue business uses such as trainings and ads are open questions. Hand-made clips need Studio uploads, which are not built yet.

## Change procedure

### M0/M1 implementation assumptions (October 11, 2026)

The local prototype adopts P02–P05 and P14 with emulator-only, preseeded email/password accounts; no registration or production auth configuration. Ruleset `prototype-1` uses base stats 5 and a separate progressed test profile with agility 8. Child entry contracts import no narrative state and never merge back. The market has two fixture branches with one independent featured nomination. Authored guard choices substitute for deferred combat. A checkpoint marker is fixture metadata only until M5. See [the delivery record](12-local-prototype.md) for API details, media placeholders and verification boundaries. These implementation choices do not settle any public-release policy question above.

When the user settles a question, add or update a confirmed decision and revise the owning rule, contract, and acceptance scenario. Preserve a short explanation when it prevents a likely regression. Do not keep contradictory current policies in different files. Numeric balancing changes require a ruleset version if they affect active saves.
