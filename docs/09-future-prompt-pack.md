# Storybranch future prompt pack

Use these prompts in the project workspace. Start each new implementation conversation with the shared context, then choose one bounded milestone. Replace bracketed scope where appropriate.

## Shared context

```text
We are building Storybranch, a React and TypeScript video adventure platform,
with Firebase authentication/database and Netlify web hosting. Read README.md,
docs/01-product-requirements.md, docs/02-game-and-community-rules.md, and
docs/10-decisions-and-open-questions.md before making changes. Then read the
architecture, contracts, and acceptance criteria relevant to this task.

Preserve these invariants: published story versions are immutable; saved runs
pin their versions; side quests have independent saves; shared account stats
are distinct from local story state; a location permits multiple community
branches but only one featured placement; placement ownership is distinct from
story authorship; authoritative choices, rewards, wallet changes, and trades
are server validated and idempotent; generation is asynchronous and paid jobs
must recover without double charges. Keep domain logic portable to native clients.

Distinguish confirmed requirements from proposed defaults. Use proposed defaults
for reversible prototype work, but do not invent commercial or licensing policy
for production. Inspect the current repository and preserve existing work.
Implement only the requested milestone, verify its user path and relevant
acceptance criteria, update affected documentation, and report actual results
and remaining limitations. Do not represent mocks as live integrations.
```

## Foundation

```text
Implement M0 from docs/08-delivery-and-acceptance.md. Set up the proposed
workspace boundaries with a React/TypeScript web app, pure domain package,
runtime-validated contracts, and local Firebase emulator configuration.
Add only tooling needed by the first playable slice. Verify typechecking,
build, test execution, and domain import boundaries. Prove the proposed route
strategy can serve public story metadata as well as the application shell.
Use local/test configuration and document setup without embedding secrets.
```

## Game engine and playable slice

```text
Implement M1. Read docs/02-game-and-community-rules.md and
docs/05-data-and-api-contracts.md. Build the golden story fixture, condition
evaluator, effect engine, immutable version loading, and revision-checked
playthrough commands. Add login, responsive video/choice UI, transcript
fallback, save/resume, and a local story log. Verify deterministic outcomes,
duplicate commands, simultaneous choices, loop rewards, and cross-user denial.
Leave real payments and video generation outside this milestone.
```

## Creator and catalogue

```text
Implement M2. Read docs/03-experience-and-interface.md and the publication and
asset contracts. Build graph and outline authoring, scene inspection, uploads,
condition editing, preview state controls, validation, and immutable publishing.
Add authenticated catalogue home, creator library pages, story links, and share
controls with crawler-visible metadata. Verify a creator-to-player workflow,
private asset access, concurrent draft edits, and incomplete publication recovery.
```

## Community branches and featured placement

```text
Implement M3 using the user's clarified model: many side stories may attach to
a location, but one exclusive featured placement controls the prominent entry
in the base story. The secondary list remains available. Implement separate
child playthroughs and return navigation, source attribution and permission
receipts, atomic placement claims, nominations, and direct gifts/swaps.
Follow the proposed prototype rules in the decision register and clearly label
unsettled public policies. Test parent isolation, competing claims, account caps,
stale offers, atomic swaps, and preservation of existing child saves after trades.
```

## Generation and accounting

```text
Implement M4 from docs/06-video-generation-and-economy.md. Start with a fake
provider, integer credit ledger, expiring quotes, reservations, outbox dispatch,
job status, ingestion, and reconciliation. Exercise duplicate callbacks,
uncertain provider submission, process restarts, and attachment conflicts.
Then verify current official provider API documentation and implement a real
adapter only if credentials and account access are available. Keep a documented
mock mode when they are not. Do not charge real users during sandbox testing.
```

## Combat and progression

```text
Implement M5. Add the versioned deterministic combat rules and responsive
command menu with explicit win/loss routes. Implement persistent account levels,
stat allocation, snapshots for new root runs, story achievements, and validated
platform rewards. Verify duplicate actions, reload recovery, checkpoint behavior,
and account reward anti-farming. Use original visual assets and interface styling.
```

## Public beta readiness

```text
Prepare M6. Compare the current app against docs/07-safety-and-operations.md
and the full acceptance matrix. Implement missing launch controls and the
selected billing adapter under the approved policies. Identify unresolved
commercial, audience, permission, placement, and provider decisions precisely.
Produce a staging evidence report for security, payment replay, recovery,
cost controls, accessibility, and user flows. Do not claim production readiness
while a release gate remains unresolved. Keep real deployments within the
authorization and environment instructions supplied for this task.
```

## Native client experiment

```text
Implement M7 as a small native feasibility prototype. Reuse domain and contract
packages; implement native adapters for auth persistence, video, navigation,
and deep links. Show login, one story, one choice, and resumption of the same
server save from web and native. Report which packages were actually reusable,
which interface code needs separate implementation, and unresolved native
billing/distribution requirements. Do not promise a complete port.
```

## Change review

```text
Review [milestone or change] against the Storybranch documents. Prioritize
concrete correctness, security, state isolation, concurrency, credit accounting,
and acceptance gaps. Check whether implementation silently promoted a proposed
default into an approved policy. Provide reproducible findings with file
references and practical impact. Update the decision register only when the
user has actually made a new decision; otherwise preserve the open question.
```
