# Storybranch implementation rules

Read `docs/16-story-pages.md` before changing stories, page types, rendering, routing or save contracts. It is the current Story/Page architecture contract; older node-only design notes are historical.

- Every page renderer MUST be a child of the shared `Page` component and run within a `Story` context. Do not introduce stand-alone screens that bypass the Page lifecycle.
- Every new page type MUST declare its typed input, completion trigger, and output destinations before implementation. Document these in the page-type table in `docs/16-story-pages.md` and validate the shape in the portable contracts/domain layer.
- Output routing, conditions, dice and future battle results MUST be validated by the server. Renderers emit intent; they cannot supply trusted destinations, stats, or random outcomes.
- Text: Next clicks its single output. Video: completion OR Next triggers its single output. Options: only a chosen option triggers its selected output. Dice: Roll persists/displays a result; a separate Next follows Pass or Fail. Never silently collapse dice back to immediate routing.
- A page resolves to another page, or closes its story/branch. Closed branches return to their parent; closed stories offer replay and other-story recommendations. Starting another story creates separate context/save state. No terminal dead ends.
- Story owns context and receives an explicit user projection (stats, achievements, save references); account credentials and SDK objects do not belong in portable contracts.
- Keep domain/contracts free of React, Firebase, browser and Node APIs. Preserve idempotent commands, immutable published editions, version-pinned saves, and isolated side quests.
- Do not retain obsolete page types or implicit video fallbacks for prototype compatibility. Publish a new edition when a manifest changes; never rewrite an immutable edition or delete user data as a shortcut.
- New types require domain checks for output routing, server checks for authority/retry/persistence, and a browser flow through the shared Page wrapper. Document any verification limits. Future turn-based RPG battles follow this same contract; combat is not implemented yet.
