# Story naming and compatibility

Status: implemented naming boundary in this PR. The user expanded the original documentation task to rename code, UI, files, stored fields and API routes while preserving behavior, and explicitly authorized compatibility for existing data. This does not implement StoryTrunk authoring, branch suppression, combat, new rewards or new context behavior.

## Canonical names

Use `StoryNode`, `StoryNodeInput`, `StoryNodeOutput`, `StoryNodeContent`, `LibraryStoryNode` and `storyNodeSchema`. The shared renderer is [StoryNode.tsx](../../apps/web/src/StoryNode.tsx); it remains inside the existing `Story` provider. When importing both the type and component, use a local `StoryNodeData` type alias.

Story graphs use `storyNodes`, `entryStoryNodeId`, `storyNodeType`, `targetStoryNodeId` and `sourceStoryNode`; saves and roll references use `storyNodeId`. Studio layout uses `storyNodePositions`. Canonical library endpoints are `/api/story-nodes` and `/api/shared-story-nodes/{id}/{revision}`. New public preview links use `/story-nodes/{id}/{revision}`.

Clients send `X-Story-Contract: story-nodes-v1` on shared API routes to request the canonical representation. The renamed library endpoints inherently use it. The API client supplies this header; it is format negotiation, not authentication or authorization.

## Existing data and clients

[The portable compatibility module](../../packages/contracts/legacy-story-format.ts) owns the legacy field, collection, receipt and URL names. Its tests may use those literal spellings to verify interoperability. External browser/HTML/provider APIs retain required protocol names. These are explicit boundary exceptions; do not spread legacy vocabulary back into domain logic, UI or new documentation.

- Read existing saves, pending rolls, draft layouts, conditions, receipts and library content into the canonical shape. Preserve identifiers used as dictionary keys and reject conflicting old/new aliases. Every ID-keyed map must be listed in `storyDictionaries`; the naming test walks the contract schemas and fails when one is missing. A stored record that cannot be translated on the way out is reported as a logged `UNAVAILABLE` service error with a correlation ID, not as a client validation error.
- New save/draft writes use canonical fields. Reads alone do not change a record, and transition/claim semantics remain unchanged.
- Read an immutable edition from the collection identified by its stored manifest format. Never rewrite its manifest, hash, content or version ID merely to rename fields. New publications use the canonical format; republishing an unchanged legacy draft recognizes its existing hash.
- New reusable-content writes use `storyNodeLibrary`. Reads fall back to the legacy collection for pinned revisions; listing merges both stores by ID with canonical records taking precedence. Pagination uses the same ordered ID cursor and does not duplicate entries.
- Existing unversioned clients and old library URLs keep their prior response format. Requests normalize before the ordinary strict schemas and authority checks. Retried commands retain their original receipt identity/fingerprint; a vocabulary change cannot execute the action twice.
- Old public preview links open the canonical shared renderer. They retain their existing content revision and access checks.

This is compatibility on read and canonical writing during normal mutations, not a bulk rewrite. No live migration, deployment, deletion or remote data modification is performed by this PR. A future removal of legacy support requires an inventory of remaining records/clients and a separately reviewed migration plan.

The retired earlier prototype format remains unsupported; accepting renamed fields does not reintroduce its schemas or fallback renderers. Fixture publications use a new edition identifier. Seeding may promote only known fixture pointers, while old editions and their pinned saves remain available.

## Verification

Verify complete edition round-trips, dictionary IDs matching old field names, nested roll conditions, pending results, alias conflicts, old/new API responses, legacy shared links, mixed-store pagination, revision ownership, retry receipts and immutable-record preservation. Run the existing domain/unit suite, integration suite and shared renderer/Studio browser flows to check that the rename preserves behavior. Record actual results and limits in [the review record](current-state-review.md).
