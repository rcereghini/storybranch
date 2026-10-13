# Storybranch product requirements

Storybranch lets people play, create, and expand video based choose your own adventure stories. Its defining experience is a cinematic story with meaningful RPG choices, plus community side quests that preserve the player's original adventure.

## Confirmed requirements

| ID | Requirement |
| --- | --- |
| R01 | Build a web application using React and TypeScript, with an architecture that supports mobile use and later native clients. |
| R02 | Use Firebase for authentication and database services, and Netlify for web hosting. |
| R03 | Provide a creator for video based branching stories and shareable story and creator library links. Include social sharing controls. |
| R04 | Support generic stats shared across games and story specific keys or flags that affect choices. Stat checks can route a choice to a failure video. |
| R05 | Integrate a video generation provider such as Higgsfield, with an in-app currency to pay for generation. |
| R06 | Permit community branching when the original creator opens a story. Published stories from non-paid accounts default to community branching enabled. |
| R07 | Open a community side quest in a separate story instance so players can return to their core playthrough. |
| R08 | Allow one exclusive featured placement at a branch location. Its holder's options appear in the base story; other branches appear in a less prominent fan-fiction style list. Support trading the placement. |
| R09 | Provide optional turn based combat inspired by the command driven feel of Final Fantasy VI, with win and loss story routes. |
| R10 | Make the public story catalogue the logged-in home screen, with a Netflix-like browsing experience and a restrained retro gaming identity. |
| R11 | Include player achievements, a story log, and player levels. |

R08 incorporates the user's clarification: exclusivity concerns prominence at a location, not the right to create the only branch there. The precise trade and selection policy remains a proposed default.

## Audiences and primary loops

Players browse a catalogue, start a story, make decisions, earn progress, and resume across devices. They can explore community branches without losing their place.

Creators outline a graph, attach uploaded or generated videos, configure conditions and outcomes, preview different player states, and publish an immutable edition. Creators retain attribution when others extend their work.

Community creators find an open location, create an attributed side quest, publish it to the community list, and optionally acquire that location's featured placement. Featured placement is distinct from authorship of both the original story and the side quest.

## Product boundaries

Video provides the narrative presentation; deterministic game rules determine outcomes. Generative models do not decide wallet balances, player rewards, combat outcomes, or placement ownership. Initial gameplay uses prepared videos and authored choices, not live generated video for every player action.

The player experience should work comfortably on a phone. The full graph authoring workspace can prioritize desktop initially, with mobile scene editing and linear outline navigation. A native app is a later client of the same game and API contracts.

## Proposed release scope

The first internal slice proves a complete story with uploaded clips, stat and key checks, login, saving, and a responsive player. The creator alpha adds graph editing, publishing, the catalogue, and sharing. The community alpha adds independent side quests, featured placements, and swaps. A monetized beta adds real generation and credit purchases only after accounting and recovery tests pass. Combat and validated progression complete the planned beta feature set. See the delivery plan for dependencies.

Deferred features include real-time multiplayer, voice chat, player-to-player cash sales, creator payouts, auctions, procedurally generated combat rules, native storefront purchases, collaborative simultaneous editing, and a general-purpose scripting language. These are not required to establish the requested experience.

## Product goals and measurement

Track story starts that reach a meaningful choice, start-to-completion rate, return-to-main success after side quests, creator draft-to-publish conversion, generation success and delivered cost, and community branch discovery. Treat these as learning metrics rather than predetermined growth targets.

Collect the minimum events necessary to answer those questions. Segment by story length and release version; a five minute story and a two hour story should not have the same completion expectations. Never optimize success metrics by charging for accidental generation or hiding failure costs.

## End to end example

A player starts The Glass Harbor. Their agility allows a rooftop escape; a harbor pass unlocks another route. At the market, one featured community option appears below the original choices. The player starts that side quest in a child playthrough. The core story stays at the market. The child has its own inventory and keys, and the player can return to the core story at any time. Another author's branch at the market remains accessible through More community stories.

The side quest author may trade the featured placement with another eligible author. Existing playthroughs remain pinned to the side quests they already started. The trade never transfers the original story, generated media ownership, private player saves, or copyright.
