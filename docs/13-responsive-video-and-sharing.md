# Responsive video and social sharing

October 12, 2026. User preference: landscape is the favored player design, portrait must work at smaller breakpoints, and clips should be shareable to social media.

## Evidence and decision

[This Way Up: The Effectiveness of Mobile Vertical Video Marketing](https://www.sciencedirect.com/science/article/pii/S1094996820301420) reports improved interest and engagement for vertical mobile video ads. Its advertising context does not establish which orientation improves interactive-story completion or satisfaction.

[TikTok's in-feed specifications](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads?lang=en) recommend 9:16 and provide safe-zone guidance. [Meta's Reels guidance](https://www.facebook.com/business/ads/facebook-instagram-reels-ads) favors 9:16 creative with audio and key messages inside safe zones. Meta's comparisons combine creative attributes, so they do not isolate orientation as the causal factor. [YouTube's Shorts guidance](https://support.google.com/youtube/answer/15424877?hl=en) classifies eligible square/tall uploads as Shorts; it is a format rule, not an engagement study.

Decision: target 9:16 for mobile/social delivery and retain 16:9 for the desktop cinematic player. This matches distribution surfaces without treating ad performance as proof that all players prefer vertical. Future experiments should compare story completion, meaningful choices, sharing and return-to-story conversion, not only views.

## Implemented behavior

- `ScenePlayer` uses an authored portrait rendition at viewport widths ≤700px; larger screens use the landscape rendition. Video uses contain, never cover. A missing portrait descriptor falls back to the original video without destructive cropping.
- A paused poster/scene shows narration and choices over a contrast gradient. Opening the player (including resume or another adventure) offers Start story with sound. That button invokes playback directly inside the click handler. Subsequent committed choices reuse the same media element and attempt playback after server validation. The decision overlay fades out over 350ms and becomes inert; surrounding story controls dim, recovering on hover or keyboard focus. Native video controls and captions remain available. Pause/end/Skip to choices restores choices, with no mandatory watch timer. Browser autoplay refusal displays a Play scene fallback. Reduced-motion preferences disable the fades. The full transcript remains keyboard accessible outside the overlay, and stats are collapsible.
- The layout grows when copy needs more room, so text, locked reasons and controls are not truncated. Breakpoint changes affect only presentation, not save revision or selected story routes.
- The API returns an optional `media` descriptor alongside the existing node. Runtime validation lives in `packages/contracts/media.ts`, while the emulator fixture resolver maps the published landscape asset to new uniquely named rendition files. It does not edit any v1 graph, hash, receipt or save. A future asset service can replace this fixture resolver.
- A separately composed 1080×1920, six-second H.264 MP4 serves the phone player. A second downloadable MP4 adds a centered teaser hook and prototype label, with no private save data, stat checks, choices, endings, or local URL burned into it. It is an original placeholder with synthesized harbor wash and three bell notes, not a finished social campaign. Copy is kept away from the edges and bottom; a real exporter must verify the target platform's current safe-zone templates.
- Share story invokes the browser's share sheet when available, with explicit Copy story link and MP4 download alternatives. It shares `/s/glass-harbor`, never `/play/{privateSaveId}`. On localhost the interface explains that recipients cannot reach it from other computers. No external posting happens automatically. Side quests have no share control until their own public detail routes exist.

## Media workflow and limits

### Audio playback readiness

The initial sound-start button is intentional: authentication and save requests can outlive browser user activation. A direct click starts the existing video element; subsequent choices replace its source without replacing the element, preserving native volume/mute state. The UI fades on `playing`, not on a playback attempt, and returns during buffering, pause, completion or failure. Browser refusal still offers Play scene. No silent-audio unlock loop or browser-policy bypass is used. Reloading or opening another adventure creates a new player and requires the initial tap again.

`pnpm test:audio` now plays the actual H.264/AAC clips served by the app. New audio rendition IDs preserve the original published assets and story graphs. `pnpm test:media` decodes all three shipped MP4 audio tracks and checks their signal level and headroom. It checks an explicit initial tap, unmuted playback after a 6.5-second server delay, media-element identity and volume retention across choices and a portrait breakpoint. Chrome runs with engagement exemptions disabled. `pnpm test:audio --webkit` uses the separately installed Playwright WebKit engine on Windows. Automation is not proof of Safari's shipping autoplay behavior, audible speaker output, or iOS lifecycle handling.

Before declaring audio UX production-ready, test a fresh iPhone Safari session with sound-bearing MP4 assets: first start, several delayed choices, mute/unmute, background/foreground, device lock/unlock, and resume after reload. Also test a social app's embedded browser. One tap per player entry followed by ordinary choice taps is the target; if physical-device tests repeatedly need an extra tap per choice, revisit the media integration before expanding the web product.

October 12 audio verification: Chrome passed the generated sound-bearing clip and delayed-transition checks. The full seven-width player suite, TypeScript, eight domain/foundation tests and production build passed. Windows Playwright WebKit installed and reported codec support, but the app audio run stalled after creating its page and was stopped; it is **not a passing Safari result**. Physical iPhone/Safari and embedded social browsers remain unverified. The normal demo clips have since been upgraded to audible ambience; narration remains a placeholder.

`pnpm media:portrait` generates the original silent portrait renditions using local Chrome's H.264 MediaRecorder encoder. It requires a browser with H.264 MP4 recording support and fails explicitly if unavailable. Generated fixture assets are checked in; normal development and CI do not need to regenerate them. Treat these v1 rendition paths as immutable once delivered; future edits need new IDs. The source SVG is independently composed for portrait rather than a crop of the 16:9 harbor art.

This is a teaser download, not a general clip editor or automatic social integration. Platform upload acceptance, device-native share sheets, finished sound design, real scene clips, clip rights/moderation, transcoding, platform-specific safe zones and hosted public URLs require later delivery. Production exports should add authored audio/captions and a public deep link in the post/caption where the platform supports it.

## Verification

Scene variance verification: TypeScript, production build and 21 unit/domain/fixture tests passed. All 23 audio-bearing MP4s (20 new scene renditions plus the three original renditions) decoded non-silent audio without clipping. Chrome verified five consecutive source changes at 1440px and 390px, automatic playback on the same video element, and unmuted playback after a 6.5-second server delay. Physical Safari/iPhone remains unverified.

The browser suite checks widths 320, 390, 700, 701, 768, 1024 and 1440, actual video dimensions, overlay bounds, explicit initial sound start and automatic playback after a choice, natural completion, pause/skip, hidden choice accessibility, simulated autoplay refusal and manual recovery, public-link clipboard contents and MP4 download signature, in addition to the existing save/choice/retry/side-quest flow. The foundation suite verifies distinct local rendition references. Physical phones and uploads to TikTok, Reels or Shorts are not verified by these checks.


Scene variance update: all ten Glass Harbor and side-quest nodes now have distinct `*-mock-v1` landscape and portrait MP4s. Each six-second placeholder uses a numbered scene title, a distinct color/symbol, animated rings and playback progress, plus a different three-note bell pitch over synthesized ambience. These are diagnostic motion graphics, not finished story footage or narration. The original harbor social teaser is unchanged. A story/version/node presentation map selects these assets without modifying published manifests or saved state. Generate with `pnpm media:scenes`; included assets do not need regeneration during normal setup. `pnpm test:media` checks audio across all renditions and `pnpm test:scenes` checks five consecutive scene changes in landscape and portrait on the same authorized video element.


