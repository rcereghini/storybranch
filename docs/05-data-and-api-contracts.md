# Storybranch data and API contracts

The following logical model is a proposed schema, suitable for implementation planning. Collection paths are illustrative but ownership, separation of public and private data, and concurrency guarantees are required. Monetary amounts use integers in explicitly named units. Dates are server timestamps.

## Persisted entities

| Entity and suggested path | Essential fields | Writer and visibility |
| --- | --- | --- |
| `users/{uid}` | account status, private preferences, entitlement references | User may edit allowlisted preferences; server controls status; owner reads |
| `creatorProfiles/{uid}` | unique handle, display name, avatar, public bio | Validated owner edits; public reads |
| `playerProfiles/{uid}` | level, XP, allocated stats, unspent points, ruleset version | Server writes; owner reads; optional public projection |
| `stories/{storyId}` | creator ID, title, visibility, status, draft revision, published version ID, community setting | Server controls publication and settings; owner reads private metadata |
| `catalogue/{storyId}` | public title, cover, creator projection, tags, rating, published version | Server generated public projection |
| `stories/{id}/draftNodes/{nodeId}` | type, asset ID, choices, effects, combat config, revision | Owner allowlisted edits under draft policy |
| `stories/{id}/versions/{versionId}` | source draft revision, schema/ruleset versions, manifest hash, readiness, entry node, permissions snapshot | Server only; authorized readers |
| `stories/{id}/versions/{vid}/nodes/{nodeId}` | frozen validated node payload | Server only; authorized readers |
| `branchLocations/{locationId}` | source story ID, stable node ID, supported versions, entry contract, status | Source author through API |
| `branches/{branchId}` | author ID, source location/version, side story ID, permission receipt ID, publication status | Server validated writes; public projection if eligible |
| `permissionReceipts/{id}` | author, source version, derivative policy version, timestamp, permitted asset references | Server only; relevant authors and moderation |
| `placements/{locationId}` | holder UID or null, nominated branch ID or null, revision, status | Server only; public holder projection |
| `placementAccounts/{uid}` | active holding count, limit, revision | Server only; locks account caps across simultaneous claims |
| `tradeOffers/{tradeId}` | proposer/recipient, placement IDs and expected revisions, expiry, status | Participants read; server writes |
| `playthroughs/{playthroughId}` | player UID, pinned story/version, parent ID/revision, current node, state revision, stats snapshot, local state, status, ruleset version | Owner reads; server writes |
| `playthroughs/{id}/events/{eventId}` | command ID, transition, node IDs, reward references, timestamp | Append-only server writes; owner reads |
| `playthroughs/{id}/checkpoints/{checkpointId}` | local state snapshot, entry-effect markers, battle state, revision | Server writes; owner reads |
| `battles/{battleId}` | playthrough, encounter version, actors, turn, resources, outcome, revision | Owner reads; server writes |
| `achievementDefinitions/{id}` | scope, eligibility, stable reward ID, display data | Platform or validated story publishing |
| `users/{uid}/rewardClaims/{rewardId}` | scope, source, award, timestamp | Server only; owner reads |
| `wallets/{uid}` | available credits, reserved credits, revision, account lock | Server only; owner reads |
| `wallets/{uid}/ledger/{entryId}` | operation ID, deltaAvailable, deltaReserved, reason, job/payment reference, price version | Append-only server writes; owner reads |
| `generationJobs/{jobId}` | owner, quote, normalized input, provider request ID, state, reservation ID, output asset ID, lease, attempts | Server writes; owner reads safe projection |
| `assets/{assetId}` | owner, storage key, readiness, media attributes, captions, provenance, retention references | Server controlled readiness; access by entitlement/reference |
| `commandReceipts/{receiptId}` | actor, idempotency key, request hash, status, result | Server only; scoped API result |
| `outbox/{id}` and `inbox/{id}` | event kind, payload reference, dedupe key, lease, status, due time | Server only |
| `moderationCases/{id}` | target, report, evidence references, decision, audit | Restricted moderators |

A public projection is a separate safe record, not a rule that tries to hide individual fields inside a publicly readable private document. Store large histories and reward markers in subcollections or bounded structures. Do not allow unbounded node effects or inventory quantities.

## Conceptual TypeScript contracts

```ts
type StatId = 'strength' | 'agility' | 'intellect' | 'resolve' | 'charisma';
type Compare = 'gte' | 'lte' | 'eq';
type Condition =
  | { kind: 'stat'; stat: StatId; op: Compare; value: number }
  | { kind: 'key'; keyId: string; present: boolean }
  | { kind: 'item'; itemId: string; op: Compare; quantity: number }
  | { kind: 'all' | 'any'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition };

type Effect =
  | { id: string; kind: 'key'; keyId: string; present: boolean }
  | { id: string; kind: 'item'; itemId: string; delta: number }
  | { id: string; kind: 'stat'; stat: StatId; delta: number }
  | { id: string; kind: 'health'; delta: number }
  | { id: string; kind: 'milestone'; milestoneId: string };

type Route = { targetNodeId: string; effects: Effect[] };
type Choice = {
  id: string;
  label: string;
  availableWhen?: Condition;
  unavailableDisplay: 'locked' | 'hidden';
  costs: Array<{ itemId: string; quantity: number }>;
  outcome: { kind: 'direct'; route: Route }
    | { kind: 'check'; condition: Condition; success: Route; failure: Route };
};

type Command<T> = {
  idempotencyKey: string;
  expectedRevision?: number;
  payload: T;
};
```

Runtime schemas must reject unknown operators, excessive nesting, non-finite or out-of-range numbers, missing routes, foreign namespaces without an import contract, and oversized lists. TypeScript types alone are not request validation. Entity IDs use stable generated IDs rather than titles or array positions.

## Command API

All commands use a verified Firebase identity token, schema validation, explicit entity authorization, and durable idempotency. Actor identity comes from the token, not the payload. Public catalogue reads do not require an account; saving, creation, and trades do.

| Command | Required inputs beyond identity | Result and atomic boundary |
| --- | --- | --- |
| `POST /api/playthroughs` | story/version, command key | Validated starting state and playthrough ID |
| `POST /api/playthroughs/{id}/choices` | choice ID, expected revision | State transition, event, receipt, and local rewards together |
| `POST /api/playthroughs/{id}/branches` | branch ID, expected parent revision | Child instance and receipt; parent state unchanged |
| `POST /api/playthroughs/{id}/restore` | checkpoint ID, expected revision | Restored local state and new revision; account claims unchanged |
| `POST /api/battles/{id}/actions` | action/target, expected revision | Committed turn and terminal routing if applicable |
| `POST /api/stories/{id}/publish` | draft revision, visibility, acknowledged policy version | Publication job ID; final pointer changes only after validation |
| `POST /api/placements/{id}/claim` | nominated branch, expected placement revision | Placement owner plus account holding counter |
| `POST /api/placements/{id}/nominate` | branch ID, expected revision | Eligible nomination by current holder |
| `POST /api/trades` | recipient, offered/requested placements and revisions, expiry | Pending offer; no rights move |
| `POST /api/trades/{id}/accept` | expected offer revision | Offer terminal state, placement transfers, counters, audit, receipt |
| `POST /api/trades/{id}/cancel` | expected revision | Cancellation if still pending |
| `POST /api/generation/quotes` | model/configuration and asset references | Immutable expiring quote with credit ceiling |
| `POST /api/generation/jobs` | quote ID, draft node/revision, command key | Reserved credits, job, outbox, and receipt |
| `POST /api/generation/jobs/{id}/cancel` | command key | Cancellation request status; not a promise of provider refund |
| `POST /api/billing/checkout` | server defined pack ID | Hosted checkout reference from the selected payment adapter |
| `POST /api/webhooks/{provider}` | provider verification data | Durable deduplicated inbox acknowledgement |

Read endpoints or Firestore queries expose catalogue pages, creator libraries, authorized versions, owner saves, community lists, job status, and wallet history. Cursors and maximum page sizes are mandatory. The full API schema will be generated during implementation; this document defines behavioral boundaries.

Errors use stable codes such as `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_FAILED`, `STALE_REVISION`, `INSUFFICIENT_CREDITS`, `PLACEMENT_UNAVAILABLE`, `QUOTE_EXPIRED`, and `PROVIDER_UNAVAILABLE`, plus safe human text and a correlation ID. Never expose provider secrets or stack traces.

## Concurrency and idempotency

Derive command receipt scope from authenticated actor, command kind, and idempotency key. Store a canonical request hash; reusing the key with a different payload returns a conflict. A completed command returns its stored result. A pending external operation returns its existing job. Keep financial receipts and reward claims for the required audit lifetime rather than short cache TTLs.

Featured placement ID equals stable location ID, guaranteeing one slot per location. Claims lock the placement and the claimant's holding counter. Trades lock every affected placement and account counter in one transaction. Competing offers need no long-lived reservation; the first valid acceptance wins and subsequent offers become stale.

For gameplay, the transaction reads the current playthrough and referenced immutable rules, validates revision, applies effects, and writes the new state and event. Account rewards can be granted by an idempotent outbox processor keyed by stable reward ID, so local completion does not require an unbounded transaction.

## Queries and lifecycle

The M0/M1 implemented command/read subset, bounded cursor formats, emulator authorization and durable receipt behavior are documented in [the local delivery record](12-local-prototype.md). Other command families in this document remain planned contracts.

The October 12 presentation extension adds optional `media` to the single-save response: `{landscape, portrait?, socialClip?, captions}`. Each rendition has `{src, poster, type}`. Local prototype paths are runtime-validated and resolved from a separate fixture asset catalog. Renditions do not mutate node/video references, published-version hashes, gameplay commands or save revisions. `socialClip` is a public teaser, never an export of private playthrough state. See [responsive video and sharing](13-responsive-video-and-sharing.md).

Expected composite query patterns include catalogue by visibility/status, genre and publish date; owner's playthroughs by status and updated time; branches by location/status and publish date; participant trades by status/expiry; and jobs by state/next attempt time. Implement and check the exact indexes used by actual query code, avoiding speculative combinatorial filters.

Story unpublishing removes discovery but does not automatically delete immutable media referenced by saves or permitted derivatives. Account deletion and rights removals use a documented retention/tombstone workflow. Tombstones retain only necessary references and audit data; private content should not remain publicly accessible through cached asset URLs.
