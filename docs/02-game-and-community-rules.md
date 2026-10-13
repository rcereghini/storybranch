# Storybranch game and community rules

These rules separate account progression, saved adventures, story authorship, and community prominence. All numerical balancing and policies identified as proposed are configurable defaults, not fixed product promises.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Story | A creator owned work with identity, metadata, drafts, and published versions. |
| Version | An immutable published graph and its rules. |
| Node | A video scene, combat encounter, or ending in a version. |
| Choice | A player action with conditions, effects, and an explicit destination or success and failure destinations. |
| Key | A namespaced narrative flag, scoped to a playthrough. |
| Playthrough | One saved execution of a pinned story version. |
| Branch location | A stable attachment point on an original story node where community side quests may begin. |
| Community branch | A separately authored story linked to a branch location and source version. |
| Featured placement | The exclusive right to nominate the community branch prominently presented at a location, subject to publication and moderation rules. |
| Credits | Purchased or promotional units spent on creation services. They are separate from RPG gold and XP. |

## Player stats and levels

Proposed shared stat IDs are strength, agility, intellect, resolve, and charisma. A story may rename their display labels for its setting but cannot change their meanings or IDs. The initial tuning proposal is a base value of 5 per stat, a maximum of 20, and one allocation point per account level after level 1. Prototype progression reaches level 20 at most; unspent allocations may remain when a cap is reached.

The account owns its persistent level, XP, and allocated base stats. A new root playthrough takes a snapshot of that profile, tagged with a ruleset version. Existing playthroughs keep their starting profile so a later level increase cannot unexpectedly change a saved choice. Temporary bonuses, health, inventory, and story rewards live in the playthrough. An explicit future migration could refresh a profile snapshot; no automatic refresh is assumed.

This is the proposed interpretation of stats shared across games: the same character profile and stat definitions start every story, while live story state remains isolated. If fully live cross-story stat changes are desired, replace this decision explicitly before implementing progression.

For prototype tuning, XP required to move from level L to L+1 is 100 × L. Account XP is awarded only for platform validated milestones, once per account and stable reward ID. Unreviewed creators can award local story XP and local achievements but cannot mint account XP. A new story version does not reset a claimed account reward. Reward eligibility and abuse controls must precede public progression.

## Keys and inventory

Keys use stable identifiers such as `glass-harbor:harbor-pass`; their display names can change. A key is a boolean flag in the initial ruleset. Do not use a key for an item quantity, a credit balance, or a stat value. An item definition has a story namespace, quantity rules, and optional equipment modifiers. Story items and RPG gold stay in the current playthrough.

Shared stat definitions do not make all items or flags universal. An author cannot inspect private keys from unrelated stories. Imported keys and items for a side quest must appear in an explicit entry contract. Credit balances are never available to story conditions.

## Choices and state transitions

Each choice can have an availability condition and a separate outcome check. Availability failures show a locked choice and a useful reason by default. An author may mark a choice hidden for a narrative secret. Outcome checks permit attempts that can fail, with both routes fully authored. For example, Escape has no availability condition, but `agility >= 8` selects the escape clip; lower agility selects the capture clip.

Conditions are structured data with `all`, `any`, `not`, stat comparisons, key presence, and item quantity comparisons. Effects are an allowlisted set: grant or remove a key, adjust local items, adjust bounded local stats, adjust health, record a local milestone, or move to a destination. There is no arbitrary JavaScript in stories.

The server evaluates availability and outcome against the pre-transition state, checks costs, then applies costs and outcome effects in a single committed transition. It records the selected destination and increments a state revision. Duplicate requests return the previous result. Conflicting requests from two tabs reject the stale revision and reload the current state.

Node entry effects have explicit once-per-playthrough semantics in the first ruleset. They run on first entry and are tracked by stable effect IDs. Looping through a scene cannot repeatedly mint rewards. Cycles are allowed, but graph validation warns about loops with no reachable ending or exit. Random checks are deferred outside combat; the first story check system is deterministic.

Failure may end a story, lead to a new scene, or offer a retry from a checkpoint. Checkpoint restoration restores the saved local state; it never rewinds account rewards, purchases, placements, or trades. Published rules define the checkpoint policy.

## Community side quests

An open story exposes explicit branch locations. Multiple authors may publish a branch at a location. Each branch preserves source story, node, location, version, attribution, and the permission receipt under which it was created. Proposed v1 branches attach to base stories only; nested community branches are deferred.

Starting a branch creates a child playthrough with `parentPlaythroughId` and the parent's current revision. It snapshots effective shared stats and only the entry contract's allowlisted narrative state. Keys remain namespaced. Child mutations never write to the parent. Returning navigates to the saved parent, even if it has advanced in another tab. Completing the child may grant an idempotent platform achievement, but proposed v1 has no automatic item, stat, or key merge into the parent.

Starting a side quest and authoring a side quest are separate actions. Playing an existing branch does not spend generation credits. Creating videos for a branch does. Branch creation can begin from a player's current location without altering that player's save.

## Featured placement

Each location has at most one holder and one nominated eligible published branch. Base story choices always remain visible and precede community choices. Proposed v1 presents one clearly attributed featured entry option; the holder controls its wording and linked side quest within author and moderation constraints. Multiple injected options may be added later, but cannot replace base choices or apply hidden effects to the parent.

All other eligible branches appear in the secondary community list, sorted initially by most recently published with optional genre and duration filters. A missing or suspended featured branch does not suppress this list. Placement selection is separate from story publication.

Proposed initial allocation: a verified creator with a published eligible branch can claim an unheld location in an atomic first-commit-wins operation. A prototype account may hold up to three placements. There is no speculative reservation of empty locations and no paid bidding in v1. Limits, inactivity reclamation, and creator curation remain pre-release decisions because scarce prominence invites hoarding.

Location IDs persist across story versions when the narrative location persists. A new publication does not mint a second featured slot. An author may retire a location from future versions; old saved versions keep their graph, while safety policy can suppress unsafe community links. Placement holders receive a visible retired status. Retirement does not transfer the slot to a new node implicitly.

The current featured selection is loaded separately from the immutable story graph. On side quest launch, the server resolves and pins its published version. A later placement change affects future launches, not a child already in progress.

## Trading

The proposed first trade system supports a direct swap of two featured placements or a gift of one placement. It excludes credits, cash, RPG items, and copyright transfers. The proposer chooses the placements and the recipient. The recipient explicitly accepts; the server rechecks both current owners, eligibility, moderation, placement revisions, account limits, and expiry before transferring all rights atomically.

Each new holder may nominate only a branch they own at that location. A swap may leave a placement unfilled until its new holder has an eligible branch. An unfilled holding is subject to the future inactivity policy. The transaction clears the former nomination rather than transferring another person's story. A stale, expired, revoked, or already accepted offer cannot execute again.

Neither a trade nor a featured claim changes licensing, source attribution, the community list, or saved playthroughs. All transfers receive audit records. Automatic marketplace valuation and cash settlement are out of scope.

## Community permissions

Confirmed: free accounts default to community branching enabled when publishing. Proposed: show this setting clearly during publication and allow an explicit opt-out until the user decides whether openness is mandatory. Paid accounts may choose open or closed. Do not silently turn default into mandatory.

An author may close new branching later, but the proposed policy preserves previously authorized, compliant branches under their original permission receipt. Existing users keep access to published source dependencies unless moderation or a rights removal requires blocking them. Upgrading or downgrading a subscription does not retroactively erase branches. Final derivative permissions and removal terms require a product policy decision before public launch.

## Combat

Combat is an optional node type with an intro clip, an encounter definition, and required win and loss destinations. The first version is a solo hero versus one to three enemies using a command menu: Attack, Skill, Item, and Defend. A Flee command is optional and requires an explicit destination. Use original artwork and UI; the inspiration is command based pacing and clear party status.

Proposed prototype: one action per living combatant per round, agility descending for turn order with stable actor ID as a tie break. Physical damage is `max(1, floor(attack * skillMultiplier) - defense)`. Defend halves incoming damage with a minimum of 1 until the defender's next turn. HP and skill resources are bounded integers. No critical hits or status ailments are needed in the first ruleset. Attack, defense, max HP, and skill resources derive from a versioned encounter ruleset, not client supplied values.

The server validates turn ownership, resources, and target; resolves the action and enemy response; and commits the new battle state. If all enemies are defeated the encounter wins; if player HP reaches zero it loses. Simultaneous defeat resolves as a loss in the prototype. A terminal battle routes once and grants rewards once. Reloading resumes the committed turn rather than rerolling it. Battle failure and scene failure share the same checkpoint framework.
