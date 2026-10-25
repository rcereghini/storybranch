# Keys, items, achievements and cross-story imports

Status: target contract with implemented local state, persistent Player + Story keys and approved account achievements. Decisions S04, S06, S09, S16 and S17. Current runtime supports story-namespaced local keys/items/milestones/scores, completion-threshold keys across runs, and approved account achievements. Foreign namespaces, cross-story imports and commercial entitlements remain unsupported.

“Key” is a creator-facing idea for a fact or right used in a condition. Storage and authorization distinguish several kinds; a single unrestricted boolean map is not sufficient.

## Kinds and ownership

### Shared key model (S17)

A key is an issuer-owned definition plus a verified grant to a subject. Achievements record accomplishments and may award keys; invitations, gameplay and verified purchases can also award keys. A key check does not implicitly consume it. Consumable quantities require an explicit atomic cost contract. Definitions declare scope, issuer, permitted consumers, grant rules, expiry/revocation and consumption; grants retain subject, source event, definition/edition, time and uniqueness identity.

| Scope | Subject and lifetime | Example |
| --- | --- | --- |
| Playthrough (`run`) | One player run; separate on replay | Found item or opened door |
| Player + Story (`story`) | One account's progress in one Story across runs/editions | Five completions unlock bonus content on the sixth run |
| Account (`account`, future) | One account; only declared authorized consumers may check | Creator beta invitation, paid option, expiring subscriber access |

StoryContext owns definitions, never shared player ownership. Player + Story progress belongs to private UserContext storage; a run receives a bounded, immutable starting snapshot. Other accounts and Stories cannot read it. Stable key IDs retain their meaning across editions; renaming creates a new identity. Creators can define and award their own narrative keys without platform achievement approval. They cannot mint another issuer's keys or platform/premium rights.

Beta invitations are future account grants scoped to entering the creator's Story. A shop purchase may grant permission for Option C in that issuer's Story. Game 1 items require explicit export/import permission and source-run selection when needed before Game 2 can check them. Subscription keys are live expiring rights checked at start, resume and protected actions; they are never made permanent by a run snapshot. Expiry preserves saves and offers a recoverable access screen; current content may finish, but further protected transitions require renewed access. Payment/refund/provider and offline-lease implementation remain deferred.

The server evaluates branch conditions when presenting options and again when accepting intent. Unavailable hidden branches disclose neither their option nor protected content; locked presentation may expose only an authored non-sensitive label. A disabled/expired conditional branch must retain a safe alternative. A whole-Story entry gate offers recovery before any protected content is fetched. Monetized keys may also be earned through gameplay only when their issuer explicitly permits that grant source.

### First implementation: persistent Story progress

`Story.progression: {version: 1, keys: [{keyId, label, afterCompletions}]}` declares up to 40 unique Story-namespaced permanent boolean keys, each awarded at a threshold from 1–999 completed runs. Counts include committed StoryLeaf completions after this feature is deployed, across editions and isolated child runs of the same Story. A watch means a completed run, not a reload, visit or raw video-play event. No historical completion backfill occurs. Existing completed saves stay unchanged.

On each new root/child run, the service snapshots only declared granted keys into server-only `Save.storyProgressSnapshot` (version 1, keys). Existing saves without it have no persistent keys. Active runs never change when another run earns a key. Conditions use `{kind: "key", scope: "story", keyId, present}`; absent scope or `run` uses existing local keys. Story-scoped conditions must reference declared definitions. Account scope is reserved and rejected by current schemas.

Completion atomically increments `users/{uid}/storyProgress/{storyId}.completions`, creates missing permanent grants under its `keys/{keyId}` subcollection with source run/edition/definition snapshot, and records `completions/{runId}` as a durable no-TTL deduplication receipt. These writes commit with the run/event/command receipt and any approved achievement. Thresholds use the completing run's pinned edition. Completion exposes only newly granted labels/IDs through optional `completion.storyKeys`; normal player responses omit the progress snapshot and total. No client writes or generic grant endpoint exist. Definition removal stops future snapshots/grants without deleting history. Reintroduction of the same ID recognizes its prior grant.

Studio authors these thresholds in StoryTrunk and selects persistent-key conditions on options; preview has an empty snapshot and cannot claim progress. Safe publication still requires an unconditional cost-free exit. Invitations, mid-run persistent awards, achievement-to-key bindings, sequel imports, consumption, shops and subscriptions are follow-on implementations, not supported by this first slice.

```mermaid
flowchart LR
  Definition[StoryTrunk: pinned key definitions] --> Complete[Server validates StoryLeaf completion]
  Complete --> Atomic[Atomic run, event and unique completion receipt]
  Atomic --> Progress[Private Player + Story count and grants]
  Progress --> Start[Next run: snapshot declared earned keys]
  Start --> Condition[Server evaluates StoryBranch condition]
  Condition --> Options[Permitted option projection]
  Options --> Intent[Player selects option]
  Intent --> Check[Server rechecks snapshot and revision]
```

| Kind | Example | Authoritative scope and issuer | Lifetime/consumption |
| --- | --- | --- | --- |
| Narrative key | `harbor:brass-key` | One run; validated story effect | Persist for run, revoke/consume only by declared local effect |
| Inventory item | `harbor:health-potion`, quantity 2 | One run; validated bounded inventory rules | Consumable quantity, atomic cost; never a boolean pretending to be a count |
| Milestone/score | Chapter visited, quiz score | One run; rules/effects in pinned edition | Declared effect cadence; scores bounded and generally hidden |
| Exported achievement fact | `harbor:saved-captain` | User account; approved export definition and verified source event | Usually non-consumable; explicit revocation policy |
| Promotional key | Event access, limited redemption | User account; platform/authorized campaign issuer | Expiry, redemption limit and revocation policy required |
| Subscriber/premium key | Active premium tier | User account; verified entitlement service | Live expiry/revocation checks; cannot be permanently copied as a local fact |
| Paid access/item right | Purchased chapter or pack | User account; verified payment/fulfilment service | Issuer's quantity/refund/revocation policy; no browser-created grants |
| Platform achievement | Curated account XP award | Account progression service | Approved definition and globally unique claim scope |

Subscriber and premium may be labels for the same entitlement system, not separate sources of truth. A local item may be earned in a story, but converting a paid account inventory unit into a local item would require an explicit transfer protocol and unique fulfilment record. That is deferred.

## Definitions and grants

### Approved account achievements

Current implementation policy: creators submit a title/description for one published StoryLeaf in one immutable edition; admins approve, reject or revoke that exact submission with an audit reason. Approval does not modify the edition and never grants paid access, XP, currency or subscriber rights. Definitions are private to their creator and admins. Approval is live eligibility at completion; it is not retroactive. StoryLeaf IDs form a stable achievement identity within a Story across editions; a new edition requires its own approval but cannot award the same achievement twice to an account.

The service atomically creates an account claim with the completion, preserving source run, edition, StoryLeaf, definition revision, time and display snapshot. The claim key is `(user, Story, StoryLeaf)` and has no TTL. Replay and concurrent runs return already-earned status. Revocation prevents new grants; existing historical claims are retained and marked revoked on account-list reads according to their source definition. Reapproval can restore that definition's active display status; rejection cannot alter an already approved definition. Account claims are private, paginated and API-only; they are not automatically exposed to other Stories, AI, public profiles or sequel imports. Legacy profile achievement strings remain separate and are not accepted as claim evidence.

Creator API: `POST /api/achievement-submissions` accepts `{idempotencyKey, expectedRevision, storyId, versionId, storyNodeId, title, description}`. The service checks ownership and the published leaf, snapshots its title/transcript/type for review and creates or resubmits pending/rejected metadata. `GET /api/achievement-submissions?storyId=&versionId=&storyNodeId=` retrieves the owned edition-specific submission; list/detail reads are also owner-only. Admin review is documented in [Admin](../20-admin.md). `GET /api/achievements?cursor=` lists up to 50 private claims with their current revocation status. Definitions and claims remain denied to direct Firestore clients under existing rules. IDs are SHA-256 digests of JSON-encoded identity tuples, not authority tokens. Commands use revision checks, bounded bodies, strict schemas and idempotency receipts; durable claims have no TTL.

The completion's optional `accountAchievement` is a historical grant/already-earned display snapshot, not a live entitlement assertion. Approved definitions are consulted inside the completion transaction, including direct-entry leaves and child runs. There is no post-completion claim endpoint or retroactive scan. Private Studio previews do not invoke this grant service. Source claims and completion receipts are never deleted on revocation, and existing editions and saves are not migrated.

StoryLeaf's authored reward configuration supports labeled local keys, with a versioned configuration and an embedded durable completion receipt in the run. The server grants them once on completion, recording which were already held; replay is a distinct run and child rewards stay isolated. Approved account achievements use the separate registry above; sequel exports remain deferred. See [the local completion contract](story-nodes.md#local-completion-contract).

Target definitions declare a stable ID/namespace, definition version, kind/value schema, scope, issuer, eligibility, stacking/consumption, expiry/revocation behavior and export/import policy. Grants record subject, definition version, source run/event or verified provider reference, time, value/quantity, claim ID and current status. Separate the definition from each grant.

Use namespaces owned by the story or approved issuer. Current IDs use `story-id:key-name`; retain that supported syntax for current local state. A future registry may use structured namespace/ID fields, but must specify a versioned encoding. Merely spelling `platform:premium` does not authorize a creator to issue it. Runtime schemas reject undeclared IDs, unsupported value types and foreign references without contracts.

An exported achievement is a verified fact with provenance, not a pointer allowing another story to read an entire save. Avoid putting raw form responses, private narrative choices or payment data in export values. Public display and programmatic import are separate permissions.

## Sequel import contract

An edition declares every external dependency: source issuer/story, exported definition/version, allowed value type, target local alias, required/optional status, default if optional, source-selection rule and freshness policy. The service checks both the source's export permission and the destination's import permission. Creators cannot inspect arbitrary account facts.

For narrative continuity, use an explicit source run/completion receipt. If several eligible runs disagree, ask the player to select one at story start and persist that choice. A simpler achievement import may explicitly mean “ever earned”; it must not accidentally mean “latest run” or change during reload. Defaults and missing-source UI are authored behavior, not hidden guesses.

```mermaid
flowchart LR
  Source[Story one: local run state] --> Complete[Verified completion or approved milestone]
  Definition[Approved export definition] --> Complete
  Complete --> Grant[Unique account fact and source receipt]
  Grant --> Import[Server validates sequel import declaration]
  Selection[Player selects source run when required] --> Import
  Import --> Snapshot[Sequel run stores allowlisted snapshot]
  Snapshot --> Condition[Local condition or typed node input]
```

Example target declaration in plain terms: sequel input `captainHelped: boolean` imports `harbor:saved-captain` version 1 from the selected completed Harbor run. It defaults to false only if declared optional. A battle can bind that snapshot to an authored ally buff. The server validates the mapping; the sequel never mutates the original run or takes its inventory.

Do not weaken today's foreign-namespace rejection until the full export/import permission, persistence and verification path exists. Cross-story reads through client-side save searches are not an acceptable interim implementation.

## Snapshot facts versus live rights

| Use | Resolution policy |
| --- | --- |
| Which ending occurred in the selected prequel run | Snapshot source receipt/value at sequel start; retain provenance |
| Has this account ever earned an approved achievement | Snapshot or explicit live check according to the edition's declaration |
| Is the account currently subscribed / allowed to play paid content | Live authoritative check at start/resume/protected actions; bounded offline lease only after separate design |
| Has a consumable redemption already been used | Atomic check-and-consume in the issuer's authoritative store |

Revoking access does not erase story history. Integrity revocation of exported facts requires a defined handling policy for existing snapshots; it must not silently rewrite an immutable edition or past event. Define product behavior before release for refunds, expiry during a run, offline access and changed source visibility.

## Idempotency and abuse prevention

Different scopes need different uniqueness keys. A once-per-account achievement uses `(user, rewardDefinition, eligibilityScope)`, while a once-per-run local effect uses `(run, effectDefinition)` and a once-per-visit effect adds visit identity. Retain claim records independently of short-lived command receipts. Two devices, repeated publication, replay, checkpoint restore or a retried provider callback must not duplicate a grant.

Community child runs cannot automatically export platform progress or mutate their parent. Approved account exports use the same issuer and eligibility checks as root stories. Consumptions cannot race with grants to produce negative inventory or duplicate fulfilment.

## Verification scenarios

Verify local isolation across users and runs; rejected namespace spoofing; two concurrent claims yielding one grant; explicit source selection across conflicting prequel endings; optional defaults versus required import failure; incompatible definition versions; revoked/expired rights; replay without reward farming; and private exports excluded from catalogue/share/AI payloads.
