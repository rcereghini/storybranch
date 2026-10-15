# Storybranch safety and operations

Public user-created video, generation spending, and scarce featured placements require enforceable permissions and recovery procedures. These requirements support the requested product; they do not establish final legal terms or audience policy.

## Authorization

Treat every browser and native client as untrusted. Verify Firebase identity tokens on commands, check account status, verify ownership or participation, and validate request schemas. Reject attempts to edit another creator's drafts, launch inaccessible versions, nominate someone else's branch, or accept another user's trade.

Use deny-by-default Firestore and Storage rules with explicit allowlists. Client writes cannot change wallets, ledger entries, account XP, published versions, placements, battle results, or committed playthrough state. Server SDK access has separate service-account permissions and server authorization checks. Test both paths; passing a rules test does not prove the API safe.

Keep provider keys, payment secrets, and privileged Firebase credentials server-side. Use the deployment platform's secret facilities, separate environments, redacted logs, and rotation procedures. Use rate limits and supported application attestation as additional abuse signals, not substitutes for authorization. Protect cookie-authenticated endpoints against CSRF if cookies are introduced.

## User content and permissions

Draft media starts private. Publication requires a content rating, required warnings, rights confirmation, and acknowledgement of the chosen community permission setting. A derivative links to its source and records permission rather than implying that copying a published work transfers copyright.

Provide report actions on stories, branches, profiles, and generated assets. A moderation case can hide discovery, suspend featured promotion, block media access, or restrict an account while preserving an audit trail. Sanctioning a featured branch leaves ordinary base choices intact. Distinguish unpublishing, permission revocation for future branches, safety takedown, and deletion because they have different effects on existing saves.

Before public launch decide the audience age range, allowed content, likeness and consent requirements, handling of sexual and graphic content, appeals, repeat infringement, and retention. Provider acceptance alone does not determine platform eligibility. These policy decisions are release gates, not legal conclusions in this specification.

## Financial and community abuse

Apply spend caps and generation concurrency limits per account and globally. Block automated claim hoarding through verified eligibility, account holding caps, and monitored patterns. The release policy must define what happens to inactive holdings and closed accounts. Do not implement confiscation or paid auctions as an unreviewed technical shortcut.

Account XP can only come from approved reward definitions. Duplicate playthroughs and re-published story versions cannot repeatedly award the same platform reward. Record sufficient origin data to investigate farming without making private player logs public.

Audit every credit operation, featured claim, nomination, trade acceptance, moderation change, and entitlement update. A credit ledger should reconcile with wallet totals, jobs, and verified purchase events. A placement audit should reconcile with holder counts. Reconciliation reports discrepancies instead of silently overwriting them.

## Operational signals

Measure API errors and latency, transaction contention, stuck jobs, outbox age, callback verification failures, generation delivery rate, provider spend, media delivery errors, and cost per delivered minute. Correlate command, job, provider, and ledger identifiers. Avoid logging raw private prompts, auth tokens, or signed media links by default.

Proposed beta targets, to validate with load tests: p95 committed gameplay commands below 1.5 seconds excluding media loading, successful resume after refresh in all acceptance scenarios, and all unresolved generation jobs surfaced for reconciliation within 15 minutes. Provider completion time is measured separately and is not promised by these targets.

Budget alerts should cover Firebase reads/writes, storage, media egress, Vercel usage, and provider spend. Pause new generation when configured spend ceilings are reached. Catalogue browsing and purchased asset access should degrade independently of provider outages.

## Recovery procedures

| Incident | Expected response |
| --- | --- |
| Provider unavailable | Stop submissions, retain queued jobs within published limits, show clear status, reconcile accepted requests |
| Duplicate payment or callback | Return existing receipt and perform no second grant or charge |
| Worker crashes during ingestion | Resume ingestion using the stored provider result; do not regenerate |
| Trade race | Commit one valid transfer; reject others as stale and notify participants |
| Media removed for safety | Block delivery and show an unavailable scene/branch state with a safe exit to library or parent |
| Bad deployment | Roll back compatible application code; keep durable jobs and ledger data; repair forward where schema changed |
| Credential exposure | Revoke and rotate credentials, audit affected usage, reconcile unauthorized jobs |

Configure database backup/export and storage recovery appropriate to budget, then prove restoration in staging. Proposed initial recovery objectives are at most 24 hours of recoverable data loss and restoration within one business day; paid launch must explicitly accept or tighten these. Financial operations need independent processor/provider reconciliation beyond a database snapshot.

Account export and deletion workflows should identify private profile data, saves, authored public works, derivative dependencies, and necessary audit records. Select retention periods before production collection. Test that deleted private media is not left available through a public projection or long-lived delivery URL.
