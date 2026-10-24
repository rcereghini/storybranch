# Storybranch video generation and economy

Use creation credits to pay for video generation. Keep this economy separate from RPG inventory, XP, and featured placement trades. Pricing, paid plan benefits, credit expiry, and purchase packs remain unresolved commercial choices.

## Provider strategy

Higgsfield is the initial candidate, not a hard dependency of the domain model. Its official guide describes an API with separate API billing, asynchronous requests, status polling or webhooks, and outputs that must be copied to the application's own storage. Available models can differ from the consumer website. See the [Higgsfield API guide](https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api).

Before integration, verify account access, model configuration, current cost, permitted commercial/derivative usage, callback authentication, rate limits, retention, cancellation, and idempotency behavior. A consumer subscription is not assumed to fund application API traffic. Do not hardcode model names or prices from marketing examples.

Define an internal provider adapter with `listCapabilities`, `estimateCost`, `submit`, `getStatus`, `cancelIfSupported`, and `normalizeResult`. Capabilities include input modes, durations, aspect ratios, audio support, reference images, output formats, and safety restrictions. These are internal contracts, not claims about a provider's exact endpoint names. Unsupported capabilities are disabled in the UI.

Start with a fake adapter that simulates success, rejection, timeout, duplicate callbacks, and uncertain submission. Add the real provider only after the job and accounting pipeline works. Preserve model ID, configuration, prompt, reference IDs, provider request ID, and provenance on each output.

## User generation flow

The creator selects a scene, supplies a prompt or reference assets, chooses a supported model/configuration, and receives an expiring credit quote. Generate explicitly authorizes up to that quoted credit amount. Reserve the credits and create the job atomically, then submit asynchronously. The creator can leave the generation view and return to the same job.

A completed output goes into the creator's asset library. The creator reviews it and chooses Attach to scene. Check the node revision before attachment; if it changed during generation, offer the output as a new selection rather than overwriting content. Generating another variation requires a new quote and deliberate action.

Character reference sheets, a scene style guide, continuity notes, and reusable prompts help visual consistency, but the product must not promise perfect model consistency. Captions and transcripts require their own authoring or verified generation step; do not assume video outputs include them.

## Job state and recovery

```text
quoted -> reserved -> submitting -> running -> ingesting -> succeeded
                         |            |           |
                         v            v           v
                      uncertain    failed      retry ingestion
reserved -> cancelled
running -> cancellation requested -> reconciled terminal outcome
```

`uncertain` means a provider might have accepted a request but the application did not receive a reliable acknowledgement. Preserve the reservation and reconcile with the provider. Do not blindly resubmit and potentially pay twice. If the provider cannot recover requests by client correlation ID, escalate to operational review after a bounded interval; disable automatic retries for that ambiguity.

A worker copies output into controlled storage, validates media, creates required delivery metadata, and only then marks it deliverable. An ingestion failure retries the copy, not generation. Use provider URL allowlists and constrained fetching to prevent arbitrary server-side requests. Never expose an unvalidated provider output directly as a permanent public asset.

Callbacks must use the provider's documented verification mechanism. If verified callbacks are unavailable, authenticated status polling is authoritative. Duplicate and out-of-order callbacks cannot regress a terminal state or charge twice. Reconciliation handles lost callbacks, expired worker leases, and the gap between provider acceptance and local persistence.

## Credit ledger

A wallet tracks nonnegative `available` and `reserved` integer credits. Append-only ledger entries record both deltas and link to a unique business operation. Corrections use compensating entries, never edits to old ledger rows.

| Event | Available delta | Reserved delta |
| --- | --- | --- |
| Purchase or authorized promotional grant | +C | 0 |
| Reserve a quote of Q | -Q | +Q |
| Deliver output at charge A, where A <= Q | +(Q-A) | -Q |
| Release a failed job reservation | +Q | -Q |

The delivered charge is represented by the reservation being consumed, not an additional subtraction from available credits. Store the charge as ledger metadata for reporting. Every operation ID can settle once. Purchases are credited from verified payment events, never from a checkout success redirect.

Proposed customer policy: no deliverable output means release the reservation after the failure is confirmed. Provider spend may still exist and must be tracked as platform loss. Do not release an uncertain job merely because a browser timer expires. A cancellation requested after provider acceptance is not guaranteed to stop generation; the customer treatment must be shown before ordering and finalized before paid launch.

If provider cost unexpectedly exceeds the quote, do not debit extra credits without new consent. The platform absorbs the difference or applies a previously disclosed pre-submission rejection rule. Chargebacks and refunds create audited compensating operations; insufficient remaining credits trigger a wallet restriction and review rather than silently corrupting the ledger.

## Price construction

Proposed quoting formula: `credits = ceil((estimated provider cost + delivery allowance + retry allowance) / ((1 - target margin) * net revenue per credit))`. Use consistent currency minor units internally. Validate target margin is below 1 and revenue per credit is positive. Net revenue per credit reflects payment costs and pack discounts; taxes and policy details belong in the selected billing design.

Illustrative numbers only: estimated cost plus allowances of $0.60, a 40% target margin, and $0.01 net revenue per credit yield a quote of 100 credits. This is not a provider price or recommended retail offer. Store the pricing policy version and estimated underlying cost with every quote.

Track actual provider spend, storage, delivery bandwidth, transcoding, failed generations, promotional usage, and payment adjustments. Limit per-account concurrency, maximum duration, and daily spend. Provide a global paid-generation kill switch that leaves existing library playback available.

## Subscription and trading boundaries

Free publication defaults to community openness. Paid benefits might include privacy controls, higher generation limits, or monthly credits, but none are promised yet. Paid subscription entitlements and consumable credit balances require separate records and update rules.

Featured placement transfers do not spend or move credits in the proposed first version. If a later marketplace accepts credits or cash, it needs explicit escrow, refunds, disputes, fees, abuse controls, and payout policy. Do not quietly add that economy to the initial swap system.
