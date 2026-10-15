# Responsive video and social sharing

October 12, 2026. User preference: landscape is the favored player design, portrait must work at smaller breakpoints, and clips should be shareable to social media.

## Evidence and decision

[This Way Up: The Effectiveness of Mobile Vertical Video Marketing](https://www.sciencedirect.com/science/article/pii/S1094996820301420) reports improved interest and engagement for vertical mobile video ads. Its advertising context does not establish which orientation improves interactive-story completion or satisfaction.

[TikTok's in-feed specifications](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads?lang=en) recommend 9:16 and provide safe-zone guidance. [Meta's Reels guidance](https://www.facebook.com/business/ads/facebook-instagram-reels-ads) favors 9:16 creative with audio and key messages inside safe zones. Meta's comparisons combine creative attributes, so they do not isolate orientation as the causal factor. [YouTube's Shorts guidance](https://support.google.com/youtube/answer/15424877?hl=en) classifies eligible square/tall uploads as Shorts; it is a format rule, not an engagement study.

Decision: target 9:16 for mobile/social delivery and retain 16:9 for the desktop cinematic player. This matches distribution surfaces without treating ad performance as proof that all players prefer vertical. Future experiments should compare story completion, meaningful choices, sharing and return-to-story conversion, not only views.

## Implemented behavior

- `ScenePlayer` uses an authored portrait rendition at viewport widths ≤700px; larger screens use the landscape rendition. Video uses contain, never cover. A missing portrait descriptor falls back to the original video without destructive cropping.
- Story entry attempts playback automatically. Browser denial shows a prominent centered Start story with sound action that invokes play inside its click handler. Subsequent pages reuse the same media element. Native controls are disabled; custom play/pause, skip/next, mute, captions and fullscreen remain accessible. Loading announcements are visually hidden during gameplay; the fixed-aspect stage does not resize with page copy. Long option content scrolls within the overlay. A retained frame covers source loading, and choices remain hidden while saving/buffering. Reduced motion disables fades. Network gaps can still occur; this is not gapless streaming. Physical Safari behavior remains unverified.
- The layout grows when copy needs more room, so text, locked reasons and controls are not truncated. Breakpoint changes affect only presentation, not save revision or selected story routes.
- The API returns an optional `media` descriptor alongside the existing node. Runtime validation lives in `packages/contracts/media.ts`, while the emulator fixture resolver maps the published landscape asset to new uniquely named rendition files. It does not edit any v1 graph, hash, receipt or save. A future asset service can replace this fixture resolver.
- A separately composed 1080×1920, six-second H.264 MP4 serves the phone player. A second downloadable MP4 adds a centered teaser hook and prototype label, with no private save data, stat checks, choices, endings, or local URL burned into it. It is an original placeholder with synthesized harbor wash and three bell notes, not a finished social campaign. Copy is kept away from the edges and bottom; a real exporter must verify the target platform's current safe-zone templates.
- Share story invokes the browser's share sheet when available, with explicit Copy story link and MP4 download alternatives. It shares `/s/<storyId>` for any catalogue story, never `/play/{privateSaveId}`. No external posting happens automatically. Side quests have no share control until their own public detail routes exist.

## Sharing update (October 14, 2026)

- **Ending cards.** On an ending page the panel becomes **Share your ending**: a card ("I reached *The light returns* in The Glass Harbor") with Share ending, Copy ending link and Copy story link. The link is `/s/<storyId>/ending/<pageId>`; it opens that story's page with a note that a friend reached the ending. The dashboard's Endings collection offers the same link per ending. A quiz result uses the same link and card, worded as a result: **Share your result**, "MY RESULT", and "I got *The Keeper* in …".
- **Teaser to the share sheet.** Where the browser can share files (most phones), **Share teaser video** passes the vertical MP4 itself to the native sheet; elsewhere only the download is offered.
- **Story pages.** `/s/<storyId>` shows that story (cover, description, Start a new journey); The Glass Harbor keeps its hero. Unknown or unavailable stories show a message instead of the wrong story.
- **Link previews.** `scripts/metadata.ts` writes a static page per catalogue story and per ending (`scripts/share-pages.ts`) with Open Graph and Twitter tags, absolute URLs from `SITE_URL` (else Vercel's production URL, else `https://www.storybranch.com`), and a 1200×630 image from `apps/web/public/og/`. Regenerate the images with `pnpm exec tsx scripts/generate-og.ts` after adding a seeded story. Stories published from Studio have no static page yet and unfurl with the generic Storybranch card; they still open correctly. `vercel.json` routes story and ending paths to these pages.
- Verified on a Vercel preview: story, ending, legacy `/s/glass-harbor/the-glass-harbor` and unknown-story paths return the expected preview titles, and the images are served. Real unfurls in iMessage, Discord, X and Slack have not been checked yet.

## Media workflow and limits

### Audio playback readiness

The initial sound-start button is intentional: authentication and save requests can outlive browser user activation. A direct click starts the existing video element; subsequent choices replace its source without replacing the element, preserving native volume/mute state. The UI fades on `playing`, not on a playback attempt, and returns during buffering, pause, completion or failure. Browser refusal still offers Play scene. No silent-audio unlock loop or browser-policy bypass is used. Reloading or opening another adventure creates a new player and requires the initial tap again.

`pnpm test:audio` now plays the actual H.264/AAC clips served by the app. New audio rendition IDs preserve the original published assets and story graphs. `pnpm test:media` decodes all three shipped MP4 audio tracks and checks their signal level and headroom. It checks an explicit initial tap, unmuted playback after a 6.5-second server delay, media-element identity and volume retention across choices and a portrait breakpoint. Chrome runs with engagement exemptions disabled. `pnpm test:audio --webkit` uses the separately installed Playwright WebKit engine on Windows. Automation is not proof of Safari's shipping autoplay behavior, audible speaker output, or iOS lifecycle handling.

Before declaring audio UX production-ready, test a fresh iPhone Safari session with sound-bearing MP4 assets: first start, several delayed choices, mute/unmute, background/foreground, device lock/unlock, and resume after reload. Also test a social app's embedded browser. One tap per player entry followed by ordinary choice taps is the target; if physical-device tests repeatedly need an extra tap per choice, revisit the media integration before expanding the web product.

October 12 audio verification: Chrome passed the generated sound-bearing clip and delayed-transition checks. The full seven-width player suite, TypeScript, eight domain/foundation tests and production build passed. Windows Playwright WebKit installed and reported codec support, but the app audio run stalled after creating its page and was stopped; it is **not a passing Safari result**. Physical iPhone/Safari and embedded social browsers remain unverified. The normal demo clips have since been upgraded to audible ambience; narration remains a placeholder.

`pnpm media:portrait` generates the original silent portrait renditions using local Chrome's H.264 MediaRecorder encoder. It requires a browser with H.264 MP4 recording support and fails explicitly if unavailable. Generated fixture assets are checked in; normal development and CI do not need to regenerate them. Treat these v1 rendition paths as immutable once delivered; future edits need new IDs. The source SVG is independently composed for portrait rather than a crop of the 16:9 harbor art.

This is a teaser download, not a general clip editor or automatic social integration. Platform upload acceptance, device-native share sheets, finished sound design, real scene clips, clip rights/moderation, transcoding, platform-specific safe zones and hosted public URLs require later delivery. Production exports should add authored audio/captions and a public deep link in the post/caption where the platform supports it.

## Verification

Continuous-player update: `pnpm test:transitions` measures stage position/height on animation frames during delayed choice and media responses at 1440px/390px, asserts the same video element and no native controls, and checks custom mute/pause. It passed alongside the full seven-width player suite, mixed-page suite, delayed audio check, build and 23 unit/domain tests. Automatic playback is attempted on entry; simulated browser denial verified the centered gesture fallback. These Chrome results do not guarantee gapless network delivery or physical Safari autoplay.

Scene variance verification: TypeScript, production build and 21 unit/domain/fixture tests passed. All 23 audio-bearing MP4s (20 new scene renditions plus the three original renditions) decoded non-silent audio without clipping. Chrome verified five consecutive source changes at 1440px and 390px, automatic playback on the same video element, and unmuted playback after a 6.5-second server delay. Physical Safari/iPhone remains unverified.

The browser suite checks widths 320, 390, 700, 701, 768, 1024 and 1440, actual video dimensions, overlay bounds, explicit initial sound start and automatic playback after a choice, natural completion, pause/skip, hidden choice accessibility, simulated autoplay refusal and manual recovery, public-link clipboard contents and MP4 download signature, in addition to the existing save/choice/retry/side-quest flow. The foundation suite verifies distinct local rendition references. Physical phones and uploads to TikTok, Reels or Shorts are not verified by these checks.


Scene variance update: all ten Glass Harbor and side-quest nodes now have distinct `*-mock-v1` landscape and portrait MP4s. Each six-second placeholder uses a numbered scene title, a distinct color/symbol, animated rings and playback progress, plus a different three-note bell pitch over synthesized ambience. These are diagnostic motion graphics, not finished story footage or narration. The original harbor social teaser is unchanged. A story/version/node presentation map selects these assets without modifying published manifests or saved state. Generate with `pnpm media:scenes`; included assets do not need regeneration during normal setup. `pnpm test:media` checks audio across all renditions and `pnpm test:scenes` checks five consecutive scene changes in landscape and portrait on the same authorized video element.


