# Contributing to Storybranch

Read [AGENTS.md](AGENTS.md) before planning a change. Follow [the documentation workflow](docs/development-workflow.md) to find the documents for each affected area. This applies to human developers, coding agents and reviewers.

For Story work, begin with [the Story system](docs/story-system/README.md) and [the current Story/Page contract](docs/16-story-pages.md). Source code establishes what runs today; the target documents establish where new implementation should go. Describe a mismatch explicitly instead of preserving it as a new design requirement or silently claiming it is already fixed.

## Before implementation

1. Inspect the working tree and relevant recent changes. Preserve unrelated work.
2. Read root and scoped instructions, then the task's linked contracts. Name the read set and relevant invariants in the plan or work summary; a separate plan file is optional.
3. For a new type or changed behavior, update its inputs, state ownership, completion event, outputs, authority and recovery contract before implementing it. Record meaningful architecture decisions in the owning register.
4. Keep the task's scope explicit. Documentation-only work changes Markdown, not runtime code, schemas, dependencies, workflows, hooks or production settings.

## Before every commit

Review the staged diff against the applicable contracts, including tests, fixtures, storage rules and indirect callers. Record the following in the PR description or, for work without a PR, a durable commit body or linked review note:

```text
Documentation reviewed: [paths and relevant rule/decision IDs]
Contract impact: [changed documents, or a specific reason no update is needed]
Current/target gap: [implemented here, left for later, or none]
Verification: [checks actually run, results and limits]
Reviewer: [reviewer identity, or self-review; independent review still pending]
```

Update owning documents in the same change when behavior changes. Do not make a meaningless documentation edit just to satisfy a checklist. For documentation-only changes, check local links, diagrams, terminology, status labels and consistency; application tests need not be rerun unless required to substantiate a current-state claim.

The [PR template](.github/pull_request_template.md) makes this review visible. It does not block commits or merges. A local hook cannot prove reading, and can be bypassed. The [enforcement roadmap](docs/development-workflow.md#enforcement-levels) specifies future CI and protected-branch gates; they are not enabled by this documentation change. Do not report an independent review or successful check that did not occur.

## Review and validation

Reviewers check the actual behavior against the cited contracts and ask for missing evidence. Read [README checks](README.md#checks) for runnable commands and prerequisites. Story changes generally need portable contract/domain checks, authoritative retry/persistence checks and a browser flow through `Story`/`Page`; choose checks that cover the change. Record unavailable emulators, devices, providers or credentials as verification limits.

No commit, push, publish, migration or deployment is implied by preparing a change. Follow the user's requested delivery scope.
