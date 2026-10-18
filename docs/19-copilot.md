# Copilot

Copilot is a chat assistant that works alongside a signed-in user: it explains Storybranch, takes them where they need to go, and (in later phases) co-authors stories and drives image and video generation. It runs on the Claude API with tool use. It is app-shell UI, not a story page type, so it does not appear in the page-type table in `16-story-pages.md`.

## Principles

- **Copilot is a client, not an authority.** Every tool runs server-side as the signed-in user, through the same functions and validation as the app's own routes. It cannot read or change anything the user could not, and it never receives elevated credentials.
- **Intent, not effects, for UI.** Navigation is returned to the browser as an action the app performs; the server never drives the UI.
- **People approve changes.** Anything that edits a draft, publishes, shares or spends money (generation) is proposed, shown to the user, and applied only when they approve it. Read-only tools run freely.
- **Append-only history.** Each thread stores the full assistant content blocks, never rewritten, so retries and thinking blocks stay valid.
- **No layout shift.** The panel is a fixed drawer over the page; opening, streaming and errors never move page content.

## Phases

| Phase | Scope | Tools | Status |
|---|---|---|---|
| 1. Navigate and explain | Read-only help in the dashboard, Discover, Adventures, Studio and Assets | `navigate`, `list_catalogue`, `list_my_adventures`, `list_my_drafts`, `get_draft`, `list_my_assets` | Built |
| 2. Co-author | Proposes story, page, choice and quiz changes in Studio; the user applies them through Studio's normal save (revision-checked) | adds `propose_draft_change` | Planned |
| 3. Generate | Writes image and video prompts from story context and reference images; the user approves each job, which runs through `/api/generation` (fal) and its daily limit | adds `propose_generation` | Planned, after the model test below |

Copilot is not available during play (`/play/`, `/p/`): it could reveal routes, conditions or endings.

## Request contract

`POST /api/copilot/threads/{threadId}` with `{ idempotencyKey, text, context: { path } }` streams newline-delimited JSON events:

- `{ "type": "text", "text": "..." }` — a fragment of the reply.
- `{ "type": "tool", "name": "..." }` — a tool started (shown as a status line, never in reserved page space).
- `{ "type": "action", "action": { "kind": "navigate", "path": "/studio" } }` — the server has already checked the path against the allowed routes (`copilotRoute`); the browser performs it with the app's normal navigation, including the unsaved-Studio confirmation.
- `{ "type": "done" }` or `{ "type": "error", "code": "...", "message": "..." }` — always the last line.

`GET /api/copilot` returns `{ enabled }`, so the app only offers Copilot to accounts that can use it. `GET /api/copilot/threads/{threadId}` returns the visible transcript (user text and assistant text only). A retried request with the same idempotency key returns the stored reply instead of running again; a different body with a used key is an `IDEMPOTENCY_CONFLICT`.

## Storage

- `users/{uid}/copilot/{threadId}` — `{ messages, turns, createdAt, updatedAt }`. `messages` holds the Claude API message history (full content blocks). A thread is capped at 40 user turns; the user then starts a new one.
- `users/{uid}/receipts/{hash}` — command receipts, kind `copilot`, with the usual expiry.
- `copilotQuotas/{hash(uid)}-{day}` — daily message count.

## Access and limits

- `STORYBRANCH_COPILOT_UIDS` (comma-separated) allows accounts in production; everyone is allowed in emulator mode. Missing `ANTHROPIC_API_KEY` disables Copilot with a clear message.
- 100 messages per account per day; at most 8 model turns per message; 2,000 characters per message.
- Model `claude-opus-5-5` at low effort, which suits chat and keeps replies quick. Server-side refusal fallback (`fallbacks: "default"`) is on, so a declined request is retried on Anthropic's recommended fallback model.

## Image and video generation

fal remains the generation provider (`services/api/generation.ts`); Claude writes and refines prompts but does not generate images. Before phase 3:

1. **Model test.** Run 2–3 scenes from a real story through Kling, Veo and Seedance on fal with the same reference images, and compare quality, character consistency, speed and cost per clip. This settles the default models and the clip-length question in `10-decisions-and-open-questions.md`.
2. **Swappable provider.** Model IDs move into configuration behind our own generation commands, so a later provider change touches neither Copilot nor the UI.
3. **Reference images.** Stories keep a small set of character and location images that every generation includes, for consistency across scenes.

## Verification

Phase 1 is covered by `tests/copilot.test.ts` (contracts and allowed routes); an integration test on the emulator with Claude replaced by a scripted fake (access, tool rounds, refused routes, ownership, idempotent replay, append-only history, failure recovery, turn cap and daily quota); and `scripts/copilot-check.ts`, run by CI, which fakes the Copilot API in the browser and checks the drawer, streaming, navigation, retry with the same key, no layout shift, and that play pages never offer it. It was also run end to end against the live API on the emulator. Not covered in CI: real model replies, which vary and cost money.
