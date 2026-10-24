# Example stories and context flows

Status: design examples, not new fixtures or published stories. These diagrams illustrate [StoryNodes](story-nodes.md), [type contracts](page-types.md), [contexts](architecture.md) and [keys](keys.md). Current wire names differ from target conceptual names where noted.

## Video, options, dice and endings

The requested example starts with a linear video, then a text page with a header image and two options. Option 0 leads to one defeat; option 1 asks for a d20 roll of at least 16. Dice Roll displays its result, and **Next** follows the stored branch. Both defeat branches and victory lead to explicit leaves.

```mermaid
flowchart TD
  Start([Start new run]) --> Intro[Video: introduction, auto]
  Intro -->|branch 0 / next| Choice[Text with header image and two options]
  Choice -->|branch 0 / surrender| DefeatA[Video: defeated at the gate]
  Choice -->|branch 1 / risk| Dice[DiceRoll: d20, threshold 16]
  Dice --> Roll[Roll: server stores result; stay on page]
  Roll --> Next[Player clicks Next]
  Next -->|stored fail: below 16 / branch 0| DefeatB[Video: defeated on the bridge]
  Next -->|stored pass: at least 16 / branch 1| Victory[StoryLeaf: victory]
  DefeatA -->|next| LeafA[StoryLeaf: gate defeat]
  DefeatB -->|next| LeafB[StoryLeaf: bridge defeat]
  LeafA --> Shell[Completion shell: replay, return or other stories]
  LeafB --> Shell
  Victory --> Shell
```

| Node | Input/config | Stable output ID and display ordinal | Destination |
| --- | --- | --- | --- |
| `intro` | Video asset; auto advance | `next` / 0 | `choice` |
| `choice` | Header image and body | `surrender` / 0; `risk` / 1 | `defeat-gate`; `roll-bridge` |
| `roll-bridge` | Sides 20, threshold 16 | `fail` / 0; `pass` / 1 | `defeat-bridge`; `victory` |
| `defeat-gate` | Defeat video | `next` / 0 | `gate-leaf` |
| `defeat-bridge` | Different defeat video | `next` / 0 | `bridge-leaf` |
| Each leaf | Ending presentation and story completion | None in the story graph | Shared completion shell |

For current implementation, Text with Options is `text-options`, DiceRoll is `dice`, the threshold is `outcome.target`, and leaves map to eligible `kind: "ending"` pages. Defeat video and leaf may be one ending Video placement when no separate post-video screen is needed. Named target result bindings are not yet supported by today's `lastRoll`-only model.

### Concrete run traces

1. Roll **14**: Roll persists `{value: 14, sides: 20, threshold: 16, passed: false}` on the dice visit. Reload still shows 14. Next selects `fail`, plays the bridge-defeat video, then closes at its leaf.
2. Roll **16**: The threshold is inclusive. Next selects `pass` and enters the victory leaf.
3. Roll **20**: Same pass branch. The result remains 20 if the following node explicitly binds to it; it is not replaced by branch number 1.
4. Choose **surrender**: No roll occurs. The gate-defeat video and leaf complete that branch.
5. Retry a timed-out Roll: Reuse its key and get the stored result. Retry Next: Reuse its key and do not skip a second node.

The numbers 14/16/20 are deterministic test inputs, never browser-supplied outcomes in real play.

## Passing a result into a future battle

```mermaid
flowchart TD
  Roll[Dice visit produces trusted scouting result] --> Confirm[Next confirms stored pass/fail]
  Confirm -->|pass output binding| Advantage[Battle input: player-first, scout buff]
  Confirm -->|fail output binding| Normal[Battle input: normal initiative]
  Stats[Run party, HP and allowed items] --> Battle[TurnBasedBattle]
  Advantage --> Battle
  Normal --> Battle
  Battle --> Actions[Validated actions and persisted turns]
  Actions --> Result[Stored win, loss or configured escape]
  Result --> Continue[Player clicks Continue]
  Continue -->|win| Win[Victory leaf]
  Continue -->|loss| Loss[Defeat leaf]
  Continue -->|escape| Escape[Retreat leaf]
```

The edition declares the mapping from the scouting result to initiative and the registered buff. The browser sends an action/target intent. It cannot invent `preemptive: true`, a buff magnitude, a damage total or `won: true`. A visit resumed mid-battle restores its current turn, resources and accepted input. Turn-limit exhaustion has an authored terminal disposition. This is a target example; combat remains unimplemented.

## Sequel and account context

```mermaid
flowchart TD
  User[User account] --> One[Story one run]
  One --> Local[Local key: captain rescued]
  Local --> End[Completion with approved export]
  End --> Fact[Account fact with source completion receipt]
  User --> Select[Choose source run for sequel continuity]
  Fact --> Import[Server validates declared import]
  Select --> Import
  Import --> Two[New sequel PlayerContext with snapshot]
  Two --> Gate[Condition: captainHelped]
  Gate -->|true| Ally[Ally scene or validated battle buff]
  Gate -->|false| Solo[Solo route]
  Ally --> Leaf[StoryLeaf]
  Solo --> Leaf
```

The sequel receives only `captainHelped` plus provenance needed for validation. It does not inherit all keys/items or mutate the original run. An optional missing import can default false; a required missing import prevents start with an explanation. A subscription check remains a separate live permission and cannot be substituted by this narrative snapshot.

## Child branch and parent return

```mermaid
flowchart LR
  Parent[Parent run at market] --> Child[Start isolated side-story run]
  Child --> Local[Child-only keys and inventory]
  Local --> Leaf[StoryLeaf closes branch]
  Leaf --> Return[Return reloads parent authoritative state]
  Return --> Parent
```

The parent run ID and entry revision are references, not an invitation to overwrite the parent's current save. If another device advanced the parent, return uses its newer state. Child inventory is not merged. An unavailable parent still leaves replay/discovery exits.

## Invalid graphs that publication must explain

| Invalid case | Why it fails | Safe correction |
| --- | --- | --- |
| Empty draft published | No playable entry or leaf | Save it as a draft; add nodes before publishing |
| Video option points to a deleted page | Dangling output | Reconnect explicitly or remove the option |
| Every option requires a key the run cannot have | Conditional dead end despite structural leaf reachability | Add a usable fallback or correct eligibility |
| Auto video A → B → A forever | Automatic cycle with no finite completion policy | Add a bounded exit leading to a leaf |
| Dice roll auto-routes immediately | Violates result/confirmation lifecycle | Persist/display Roll, then route on Next |
| Battle input accepts only a roll but one incoming edge is Text | Incompatible input on one predecessor | Add explicit mapping/default or change the graph |
| Ad provider unavailable with no exit | External dependency traps the story | Bind unavailable/skip fallback |
| Creator key named premium grants paid access | Namespace label lacks issuer authority | Use verified entitlement projection |
