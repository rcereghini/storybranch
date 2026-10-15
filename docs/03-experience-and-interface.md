# Storybranch experience and interface

The interface should feel like a cinematic game library with a readable RPG layer. Use spacious video presentation, strong cover art, dark surfaces, and restrained retro accents. Avoid recreating another service's branding or burying narrative choices in a dense game HUD.

## Navigation and catalogue

Desktop navigation: Discover, My Adventures, Create, and Profile, with search and credit balance nearby. On mobile, use a four destination bottom navigation and place detailed account controls in Profile. The authenticated landing route is Discover. Returning players see a Continue playing row near the top of the catalogue.

October 14, 2026 implementation: signed-in players land on a dashboard (continue playing, progress, recommendations, endings) and the catalogue moved to Discover. Navigation is Dashboard, Discover, My adventures and Create; profile editing lives on the dashboard. This is proposal P16 in the [decision register](10-decisions-and-open-questions.md) and awaits confirmation because it changes C07. See [Player dashboard](18-player-dashboard.md).

Catalogue rows include Featured stories, New adventures, Short sessions, genre rows, and Community side quests. Story cards show poster, title, creator, approximate duration, content rating, and community status. Duration is an authored estimate or observed range because branching paths differ. Use explicit Play and Resume actions on the detail screen. Do not autoplay sound while browsing.

The first catalogue supports title prefix search and genre, rating, language, and duration filters. Full-text relevance and recommendations are later features, not capabilities assumed from the database. Empty rows collapse; a new account receives a useful editorial selection.

## Story and creator pages

Story detail contains a trailer or poster, synopsis, creator attribution, content warnings, play or resume, community status, and share controls. Creator pages provide a public library containing only published public stories and approved profile details. Private drafts, balances, and personal play history never appear there.

Use stable links `/s/{storyId}/{optionalSlug}` and `/u/{publicHandle}`. The ID remains authoritative when titles change. Unlisted stories require a link and stay outside catalogue queries; unlisted does not mean access-controlled. Sharing uses the platform share surface when supported, a copy link fallback, and tested social compose links. Preview metadata must be rendered for crawlers at the canonical public URL. Never rely on client-only metadata for social cards.

## Player layout

The October 12, 2026 player direction uses landscape 16:9 on larger screens and authored portrait 9:16 renditions at small breakpoints (prototype: 700 CSS pixels and below). Narration and choice buttons overlay the paused scene on a dark gradient: two columns on desktop, stacked on mobile. Opening the player offers Start story with sound, called directly from the tap. After that, committing a choice attempts playback automatically on the same video element. Playing fades the decision overlay and surrounding story controls while preserving native playback controls and captions; pause, end, or Skip to choices restores the interface. If browser autoplay policy blocks playback, show Play scene without treating it as a broken clip. Full transcripts and collapsible character details remain outside the frame. Layout may expand for long text rather than clip controls. Never crop essential content to force portrait playback; when no portrait rendition exists, contain the original video.

Social clip distribution favors a separate 9:16 MP4 export with authored captions/hooks inside placement-specific safe zones. The interactive overlay is not burned into the scene file. A teaser should invite viewers into the story; it must not imply that rendered choices are tappable on another platform. The prototype offers a six-second portrait teaser download with synthesized ambience and a public story link; no social publishing integration or user-generated clip editor is implemented. See [media direction and evidence](13-responsive-video-and-sharing.md).

The persistent player chrome shows story title, chapter or scene label, saved status, and a Story log control. A child playthrough adds a clear Side quest label and Return to main adventure action. Returning does not require completing or abandoning the side quest.

Choices use large text buttons with short action labels. A locked option shows the missing stat, key, or item unless it is an authored secret. An attempted check can display its requirement when the creator intends transparency; failure remains a meaningful authored route. An optional detail disclosure shows effects and resource costs without forcing players to inspect formulas.

Featured community content sits after original choices, labeled Community side quest with its author. More community stories opens the secondary list at the same location. The featured holder does not receive misleading original-author attribution.

Video end reveals or emphasizes choices, but accessibility controls allow users to skip or read the scene transcript. Missing video shows a retry action and authored transcript/poster fallback. Slow connections must not spend credits or reset progress. Preload only a limited next asset after the choice resolves; do not download every branch.

## Creator workspace

Use a desktop graph canvas with an outline alternative, scene inspector, video preview, and validation panel. The original design named Scene, Combat and Ending nodes; Creator Studio now authors the five page types in [Story and Page model](16-story-pages.md), and combat is still deferred. A branch location is a property of a Scene; it is not a separate kind of save state. Creation begins from a small starter graph with an opening, a choice, two routes, and endings.

The inspector edits title, transcript/captions, uploaded or generated media, choices, conditions, effects, and checkpoint settings. A condition builder offers stat/key/item fields and operators. A test player can simulate starting stat profiles and keys without editing the real account.

Generation controls show prompt, reference assets, permitted model/configuration options, estimated credits, and a deliberate Generate action. Model capability differences control the form. A job panel survives navigation, shows progress states, and lets users compare outputs before attaching one to a scene. Finishing a job never silently overwrites a newer scene edit.

Publishing shows errors, warnings, visibility, community permissions, attribution, content rating, and a playable preview. Publication blocks missing destinations, invalid conditions, absent required combat routes, missing ready media or approved fallback, and unacknowledged permissions. The creator explicitly publishes a frozen version; autosave affects the draft only.

On mobile, support scene list navigation, text/choice edits, media review, generation status, and preview. Advanced graph positioning can be desktop-first. The outline must remain sufficient to understand links without dragging tiny canvas targets.

## Profile and community screens

My Adventures separates active main stories, side quests, and completed stories. Profile contains account level, shared stats, achievements, and privacy controls. The story log shows timestamped decisions, discovered endings, combat outcomes, and parent/child relationships. Spoilers stay hidden by default on public views.

The community page at a location shows the featured branch, the rest of the list, and Create a side quest when allowed. Placement management shows current ownership, nominated branch, eligibility, and pending trades. Trade review spells out exactly which placement is given and received and that stories and saves stay with their existing owners.

## Accessibility and interface states

Target WCAG 2.2 AA as a design goal, with keyboard-operable choices and graph alternatives, visible focus, adequate contrast, reduced motion, screen-reader status messages, and captions/transcripts. Use at least 44 CSS pixel touch targets as a product target. Color cannot be the only indicator of locked, selected, win, or loss states.

Every core screen needs loading, empty, error, permission-denied, and offline presentations. A stale save conflict should say progress changed on another device and offer Reload current progress. A paid job in an uncertain state should say Checking generation status, not Invite another purchase. Offline reading of cached scenes is optional; authoritative choices, trades, generation, and payments require connectivity.

## Proposed visual tokens

Use charcoal backgrounds, warm near-white body text, electric teal for primary action, muted violet for community content, and amber for credit costs. These are starting directions to test for contrast, not final brand colors. Use a modern sans-serif for reading and a restrained pixel or monospace accent for small labels. Keep body copy and subtitles out of pixel fonts. Motion should suggest a game menu through short focus transitions rather than persistent flashing effects.
