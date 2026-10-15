# Storybranch technical sources

The architecture combines user requirements with proposed design choices. The official references below support provider and platform facts, not approval of the proposed product policies. Reviewed October 11, 2026; verify current API schemas, plan limits, prices, and terms again when implementing.

## Official references

| Source | Fact used in the specifications | Implementation consequence |
| --- | --- | --- |
| [Higgsfield API guide](https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api) | API billing is separate; generation is asynchronous; outputs require application storage; API models may differ from website models | Provider adapter, durable jobs, own media storage, configuration verification |
| [Higgsfield API documentation](https://docs.higgsfield.ai/) | Documentation destination linked by the official guide; endpoint schemas still need integration-time verification | Verify request fields, authentication, callbacks, pricing and retries before coding a real adapter |
| [Firestore security overview](https://firebase.google.com/docs/firestore/security/overview) | Client access uses Authentication and Security Rules; server client access uses IAM | Test client rules and server endpoint authorization separately |
| [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) | Transactions provide atomic operations and can retry under contention | Keep external side effects outside callbacks; use atomic claims and accounting |
| [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) | Functions have a bounded maximum duration that depends on the plan | Persist job state and reconcile across invocations rather than waiting indefinitely |

## Verification checklist for implementation

Before live video generation, perform a small authenticated sandbox request and capture the actual request, status, callback/polling, failure, cancellation, and output ingestion contracts without recording secrets. Confirm whether submissions support an idempotency key or a retrievable client correlation ID. If neither exists, document the operational handling for ambiguous submission.

Before production deployment, verify selected Vercel plan limits and routes, Firebase region and rules configuration, worker queue delivery semantics, media access and cache invalidation, payment event verification, and provider usage permissions. Pin dependency versions only after checking the implementation environment. This specification deliberately contains no asserted current retail prices or copied provider endpoint schemas.

Prototype formulas, balancing numbers, release boundaries, UX choices, account caps, and refund proposals come from this design rather than the sources above. They remain adjustable through the decision register.
