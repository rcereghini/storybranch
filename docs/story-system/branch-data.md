# Typed StoryBranch data — S32

Status: S32 established bounded server-only inputs through constants and the current Dice result. S33 below adds visual authoring, private inspection and input conditions. Neither introduces a renderer type, dynamic text substitution, combat or account rights. S32's original limitations and verification remain recorded below; S33 supersedes the deferral of visual controls and conditions.

Read [StoryNodes](story-nodes.md), [storage](data-storage.md) and [PlayerContext](player-context.md) with this contract.

## Authored contract

An optional `StoryNode.inputs: {version: 1, fields}` declares at most 16 uniquely named inputs. Names match `[a-z][a-zA-Z0-9_]{0,39}`; `constructor` and `prototype` are forbidden. Each field has `name`, `type` (`integer`, `boolean`, `string`), `required` and optional `default`. Integers are bounded to -999..999; strings to 200 characters; defaults must match the declared type. There are no nested objects, nulls, coercion, expressions or arbitrary property paths.

An optional route `inputBindings: {version: 1, bindings}` contains at most 16 unique mappings `{input, source}`. A source is either `{kind: "constant", value}` or `{kind: "dice", field}`, where field is `value`, `sides`, `target` or `passed`. Dice sources are legal only on that Dice choice's success/failure routes. Numeric Dice fields bind to integer inputs; passed binds to boolean. `target` is the existing persisted threshold name. Branch ordinals never become results.

Resolution starts from destination defaults, then replaces each explicitly bound field. Unknown names, type mismatches and missing required values are errors. Optional fields without a default/binding are absent. The StoryTrunk start uses the entry placement's defaults; required entry inputs must have defaults. Every incoming route is independently checked, including loops and both Dice outcomes. Unsafe optional choices are suppressed with creator diagnostics; an unsafe required outcome removes that choice and can invalidate upstream paths. Final publication validates the effective graph again.

Example: a destination declares `scoutingRoll` as required integer and `surprised` as optional boolean default false. Both incoming Dice routes bind `scoutingRoll` from `value`; the failure route can override `surprised` with constant true. An unrelated non-Dice predecessor must provide its own integer constant or rely on a declared default.

Destination Inputs JSON:

```json
{"version":1,"fields":[{"name":"scoutingRoll","type":"integer","required":true},{"name":"surprised","type":"boolean","required":false,"default":false}]}
```

The failure route within the source Dice choice's Outputs JSON (the success route also needs a scoutingRoll mapping):

```json
{"targetStoryNodeId":"next-scene","effects":[],"inputBindings":{"version":1,"bindings":[{"input":"scoutingRoll","source":{"kind":"dice","field":"value"}},{"input":"surprised","source":{"kind":"constant","value":true}}]}}
```

## Entry, persistence and disclosure

The domain resolves selected bindings before route/entry effects commit. Dice Roll only persists the pending result; Next resolves bindings from that same pending result, never a historic roll from another choice. The command still accepts only intent and revision, not resolved values or destination claims.

`Save.nodeInputs` is optional, server-only and bounded: `{version: 1, storyNodeId, revision, values}`. Revision is the destination entry revision, so a loop creates a fresh snapshot even when its node ID repeats. Start uses revision zero. Every entry replaces the snapshot; entering a placement without declarations removes it. Roll on the current placement leaves the snapshot unchanged. It is committed with the existing save/event/receipt transaction; reload and receipt replay reuse persisted values. The pinned edition plus entry revision and existing event identify the authored mapping; no unbounded visit history or copied binding graph is added.

Existing editions/saves without these optional fields keep their behavior. No backfill, read-time recomputation, migration, collection or security-rule change is required. Children resolve their own entry defaults and never inherit a parent's inputs. Player projections and public library content omit declarations, bindings and resolved values; a future type must explicitly declare any safe display projection. These inputs currently do not change rendering, conditions or rewards.

Private previews run the same pure resolution. Advanced JSON can save incomplete mappings; preview/publication diagnoses or suppresses unsafe connections. This does not yet provide a visual input inspector or binding editor.

## Verification and next consumers

Contract/domain checks cover bounds, duplicate/unknown inputs, type mismatch, all incoming edges, required start defaults, unsafe-path suppression, constants, Dice pass/fail, separate Roll/Next, revisits, clearing and legacy behavior. Service checks cover persisted inputs, reload/retry, forged command rejection, immutable editions and absence from player responses. Existing shared preview/player browser flows must remain valid.

Next: visual declarations/mapping controls with per-route compatibility diagnostics, then a separately specified consumer such as a typed input condition. Generic run variables, inherited input references, imports, enum values, battle modifiers and template interpolation need their own versioned contracts and disclosure decisions. A stored string such as `player-first` does not implement battle initiative.

Verification for S32: TypeScript, production build and 140 unit tests passed; the existing large-chunk build warning remains. All 57 local emulator integration tests passed, including authoritative input persistence, exact retry/reload, forged input rejection, response non-disclosure and edition immutability. Chrome checks at 1440/390 passed advanced input editing/save/reload, shared private preview, published Dice reload/Next and completion; light/dark screenshots were inspected. Physical Safari/mobile and authenticated hosted deployment were not tested. Review was self-review; independent review remains pending. No migration or production deployment was performed.

## S33 — Visual bindings and current-entry input conditions

Studio provides explicit Apply/Reset editors for bounded input declarations and each choice's route bindings. Editing declarations does not silently rewrite incoming mappings or conditions; affected references remain visible through validation. Bindings select destination inputs and compatible constants/current-Dice fields, preserving destinations, conditions, costs and effects. Stale mappings remain editable/removable instead of being silently discarded. Advanced JSON remains available.

A condition `{kind: "input", input, op, value}` reads only the current StoryNode's persisted `nodeInputs.values`. Integer values allow `gte`, `lte`, `eq`; booleans and strings allow exact `eq` only, with S32 bounds and no coercion. The source node must declare the referenced input with the same type. Validation applies recursively, including check outcomes and nested All/Any/Not. Missing optional values, absent/mismatched snapshots or wrong value types evaluate false for the leaf check; Not reverses that result normally. A default is resolved only on entry, never fabricated during evaluation. Snapshot entry revision must not exceed the current save revision; Roll may advance revision while keeping the same entry snapshot.

These conditions gate options and select check outcomes on the server, using ordinary command revisions/receipts. They cannot alter input values or award rights. Existing conservative publication still requires unconditional safe exits; all-conditional destinations are excluded. Invalid condition references/types invalidate the affected node until repaired. The isolated local publication check keeps declarations while relaxing required-entry resolution only for its synthetic entry; real start and every actual edge retain full validation.

The visual condition editor offers declared inputs with type-appropriate comparisons. Creator-only preview diagnostics show resolved values, missing optional inputs and entry revision, as well as condition evaluation. These details never enter player projections or logs. Real inputs cannot be set by preview scenario controls or player commands. Old editions/saves and Dice Roll/Next are unchanged. No new renderer, migration, collection, entitlement or public disclosure is added.

Verification must cover scalar types and boundaries, nested conditions, missing/stale inputs, all-conditional safety, forged choices/values, exact retries and reload, visual edit/reset/save/reload and shared preview/player behavior. Dynamic text, generic variables, additional result sources and combat remain deferred.

Verification for S33: pnpm check passed with 143 unit tests, TypeScript and the production build; the existing bundle-size warning remains. All 58 local emulator integration tests passed, including current-entry input-gated eligibility, false-input rejection, forged payload rejection, retry/reload and private projections. Chrome at 1440/390 passed visual input creation/edit/reset/save/reload, per-route constant binding, input condition authoring, private inspection, Dice reload/Next and published completion. The existing mixed key/stat/item condition and preview-scenario browser regression also passed. Light/dark editor screenshots were inspected. Hosted authenticated flows and physical Safari/mobile remain unverified. No production deployment or migration was performed; review is self-review, with independent review pending.

S35 specifies a future battle consumer for preemptive and bounded attack/defense bonuses, with range validation beyond S32 scalar types. It also reserves a battle-only result source for won/turns/playerHealth/enemyHealth on terminal Continue routes. Neither consumer nor source is currently accepted. See [Battle](battle.md).

S35b implements separate battle-output binding schemas and a pure terminal Continue resolver. They accept constants or battle won/turns/playerHealth/enemyHealth fields, not Dice sources; ordinary route schemas still reject battle sources. Resolution uses the validated pending result, preserves defaults and applies only the selected route at the next revision. Registration in mixed battle graphs and real commands remains deferred. See [S35b](battle.md#s35b-terminal-routing-boundary).
