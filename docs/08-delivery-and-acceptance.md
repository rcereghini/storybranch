# Storybranch delivery and acceptance

Build in vertical slices that each demonstrate working user behavior. Milestones are dependency ordered, not calendar estimates. All requested features remain in the planned product even when they are introduced after the first playable slice.

## Milestones

| Milestone | Deliverable | Dependencies and exit gate |
| --- | --- | --- |
| M0 Foundation | Workspace structure, React/TypeScript app, pure domain package, runtime schemas, emulator environment, CI, routing and metadata spike | Confirm version strategy and development environment; no production credentials required |
| M1 Playable slice | Login, one seeded video story, choices, stat/key checks, save/resume, local log, responsive playback | M0; deterministic fixture and server revision/idempotency tests pass |
| M2 Creator alpha | Draft editor, upload pipeline, graph validation, preview, immutable publishing, catalogue, story/library sharing | M1; end-to-end creator-to-player path and private asset tests pass |
| M3 Community alpha | Open locations, multiple branches, separate child saves, featured holder, community list, gift/swap flow | M2; concurrent claim/trade and parent isolation tests pass; placement policy chosen for public access |
| M4 Generation sandbox | Fake then sandbox provider, quotes, reservations, jobs, ingestion, reconciliation | M2 and provider access; all failure/accounting tests pass without real credit sales |
| M5 Gameplay beta | Combat, shared profile leveling, validated account rewards, achievements, checkpoint behavior | M1/M2; deterministic combat and anti-farming tests pass |
| M6 Monetized public beta | Selected payment integration, real provider, credit packs, entitlement policies, moderation, spend alerts, recovery | M3/M4/M5; commercial and content gates resolved; staging launch review complete |
| M7 Native exploration | One native client prototype with auth, deep link, video, choice, and shared save | Stable API; document actual package reuse and native billing needs before store launch |

Do not implement subscriptions merely because the interface has a Paid badge. Until terms are chosen, development can use explicit test entitlements and mock credits.

## Acceptance scenarios

### Story play and versioning

- Given agility 7, when Escape checks `agility >= 8`, the capture clip plays; with agility 8 the escape clip plays.
- Given no harbor pass, a pass-only option is locked with a reason. Granting the correct namespaced key unlocks it; a same-named key from another story does not.
- Replaying a transition request produces one event and one effect application. Two different choices from the same revision produce only one committed move.
- Refreshing or resuming on another device restores the committed node and state. It never trusts a client-provided success result.
- Publishing a new edition changes new starts but leaves existing saves on the old version. A mid-publication failure exposes no partial version.
- A loop cannot repeat a once-only reward. Checkpoint restore cannot reverse purchases or grant a platform achievement twice.

### Creator and discovery

- A creator can upload clips, connect nodes, configure a condition, preview both outcomes, publish, and open the resulting story in a separate player account.
- Publication rejects dangling routes, absent battle outcomes, excessive condition nesting, inaccessible media, and a graph with no valid entry. Cycles and unreachable nodes produce actionable diagnostics.
- Another user cannot read private drafts or private staging media. Public catalogue records contain no private fields.
- A logged-in user lands on the catalogue and can resume a story. Search/filter pagination does not duplicate or skip records under the defined cursor behavior.
- Public story and library links render usable social metadata without JavaScript execution. Renaming a story does not break its ID-based link.

### Community and trades

- Two authors can publish branches at one open location. Only the nominated featured entry appears prominently; both remain discoverable in the community list.
- Opening a branch creates a child save; changing its key, HP, inventory, or combat result leaves the parent state byte-for-byte equivalent for those fields.
- Return to main adventure opens the actual current parent save, including any independent progress committed on another device.
- Two concurrent claims for the same slot yield exactly one holder. Concurrent claims at different locations cannot exceed the account holding cap.
- Accepting a swap transfers both placements or neither. Duplicate acceptance has no extra effect. A stale offer cannot transfer a placement that has changed hands.
- Former branch authors retain authorship and media after a placement trade. Existing child playthroughs continue their pinned branch version.
- Closing a source to new branches blocks new derivative creation while applying the selected grandfathering policy to already authorized branches.
- Retiring a location does not create an extra exclusive placement on the next story edition.

### Video jobs and credits

- Available 150 and quote 100 produces available 50/reserved 100. Successful settlement at 90 produces available 60/reserved 0. Failure instead restores 150/0.
- Duplicate generation submission with the same key returns the same job and reservation. Reusing that key with altered input returns a conflict.
- A provider acceptance followed by a network timeout enters uncertainty and does not automatically create a second paid generation.
- A duplicate or out-of-order callback cannot debit twice or regress success. An invalid callback cannot update the job.
- Ingestion failure retries file acquisition, not provider generation. Output is not successful until stored and validated.
- A completed job cannot overwrite a draft node edited while the job ran.
- A checkout redirect alone grants no credits. A replayed verified payment event grants credits once.
- Wallet and ledger totals reconcile after concurrent jobs, failures, refunds, and service restarts.

### Combat and progression

- Invalid targets, unaffordable skills, and actions out of turn are rejected without state changes.
- The same initial battle and command sequence produces the same outcome. Refreshing does not reroll enemies or reset consumed items.
- Win and loss route to their authored destinations exactly once. A battle without both routes cannot publish.
- A new root story receives the account stat snapshot; an existing story retains its original snapshot after the account levels up.
- Unapproved creator rewards cannot grant account XP. Repeating an approved milestone across playthroughs or editions cannot farm the same account reward.

### Accessibility and operations

- A player can complete the fixture by keyboard and using transcript alternatives. Mobile controls remain reachable without hiding subtitles or requiring graph dragging.
- Provider outage, media failure, offline state, expired authentication, and stale save conflicts produce recoverable interface states.
- Security rules reject all direct client writes to authoritative data. API tests also reject those actions without appropriate authorization.
- A staging restore recovers representative saves, publication references, and jobs. Reconciliation detects a deliberately introduced accounting mismatch.

## Golden fixture

Create The Glass Harbor as a small test story: dock arrival, pass acquisition, market branch location, an escape check, guard combat, success ending, and failure ending. Include at least one intentional loop with a once-only reward and a checkpoint. Provide two community side quests at the market, one featured. Use owned or generated fixture media with known rights; test environments can use simple placeholder clips.

Seed accounts should include a new player, a progressed player, a free creator, a paid-test creator, two branch authors, and a moderator. Never seed privileged test identities or fake credit balances into production.

## Completion standard

Local M0/M1 implementation evidence is recorded in [the local delivery record](12-local-prototype.md). Community examples are fixture-only; full M3 features are not delivered. Combat and checkpoint restore remain M5. The local environment is the acceptance target for this slice; no staging or production deployment is claimed.

A milestone is complete when its user path works in staging or the specified local environment, relevant acceptance tests pass, loading/error states exist, changed contracts are documented, and any remaining limitations are stated. A mock provider result is not evidence of a live provider integration. A local build is not evidence of a successful deployment.
