# Design system

The app has one design language in two themes, light and dark. Players choose Light, Dark or System in the account menu; the choice is a per-browser preference (`apps/web/src/theme-mode.ts`) applied before first paint by a script in `apps/web/index.html`.

## Tokens

All colors, fonts, radii and shadows come from `packages/design-tokens/tokens.css`. Components use the semantic names, never raw colors:

| Token | Use |
|---|---|
| `--bg`, `--surface-1/2/3` | Page background, cards, tiles and inputs, pressed or active fills |
| `--border`, `--border-strong` | Dividers; outlines on buttons and inputs |
| `--text`, `--text-body`, `--muted` | Headings and labels; running text; secondary text |
| `--primary` / `--on-primary`, `--primary-hover` | Main actions (indigo) |
| `--primary-soft` / `--primary-soft-text` | Selected states, chips, active nav |
| `--link` | Links and accent text |
| `--coral` / `--on-coral`, `--coral-text` | Highlights: progress, kickers, creative actions |
| `--success`, `--warning`, `--danger` (+ `-soft`) | Status |
| `--overlay`, `--header-bg`, `--shadow-sm/--shadow/--shadow-lg` | Dialog backdrop, sticky header, elevation |
| `--font-ui`, `--font-display`, `--font-story` | Figtree for the interface, Bricolage Grotesque for headings, Fraunces for story titles and story text |

Light is the default; `<html data-theme="dark">` or a dark system setting (with no explicit choice) switches every token. Surfaces that stay dark in both themes, such as the video stage, add the `theme-dark` class, which applies the dark tokens to everything inside. Art-backed surfaces (the Discover hero, video previews) use fixed light text because their background is always dark. The legacy names `--panel`, `--line`, `--teal`, `--accent`, `--on-accent`, `--violet` and `--amber` alias the semantic tokens for older styles; new code uses the semantic names.

Fonts are bundled with the app (`@fontsource-variable/*`), so no request goes to a font service.

## Components and layout

- **Shell** (`shell.css`): sticky header with the main sections (Home, Discover, Adventures, Create), Copilot and the account menu (profile, Assets, Admin, appearance, sign out). Below 801px the sections move to a bottom tab bar; the story player keeps a compact header with a way back.
- **Buttons**: `.btn` with `.btn-primary`, `.btn-secondary`, `.btn-coral`, `.btn-small`, and `.btn-link` for text actions. Touch targets are at least 44px tall on phones.
- **Pages** use a 1240px max width with 32px side padding (16px on phones), cards with `--radius-lg` and `--shadow`, and headings in `--font-display`.
- **Studio editor** (`studio.css`, `story-graph.css`): a full-window workspace with its own bar and three panes (pages, map, settings) that scroll independently with thin theme-colored scrollbars; one pane at a time at 1100px and below. The map is a pan-and-zoom canvas with floating tools, so nothing on it uses page scrolling. Editor notices sit at the bottom center and clear after eight seconds; AI suggestions cover the field they would change.
- **Story covers** (`StoryCover`): shipped art where it exists, otherwise the title on a color field from `cover-palette.ts` (thumbnails show the first letter).
- **No layout shift**: status lines and loading placeholders reserve their space; notices replace each other rather than push content (see `AGENTS.md`).

## Checking a page

Every page is checked in both themes at 390px and 1440px for horizontal overflow, contrast and layout; CI's browser checks cover the player at 320–1440px, the Copilot drawer and the admin dashboard.
