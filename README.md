# Common Ground

A cooperative Wikipedia game you play with Venn, an AI partner. You start on different Wikipedia pages, each secretly pick one link per turn, and try to land on the same page on the same turn. Venn learns how you play, game after game.

**Live demo:** [add the Vercel URL]

## How to play

1. **Tell Venn what you're into.** Type something short, like "skiing" or "jazz" (up to 30 characters). Venn turns it into one or two topics, which decide where Unlimited games start. Venn itself likes math, so it starts on a math page.
2. **Pick how much Venn hints.** Easy names the topic Venn is heading into, Normal hints at its plan, and Hard says nothing.
3. **Pick a game.** Daily is one numbered pair for everyone, playable once a day. Unlimited starts you near your interest. Your first game is a short tutorial.
4. **Each turn, click a link in your article, then press Seal my move.** Venn seals its own move before you do; the button reads "Venn is still deciding…" until it has. Both moves are revealed together.
5. **Meet Venn** by landing on the same page on the same turn.

You never see Venn's links, only its page, a one-line description, two topic tags and its hint. The closeness meter runs from Cold to Hot. "There's a page you both link to. Can you find it?" appears only when you could meet this turn.

**Step back** returns you to your previous page. It costs a move and isn't available on turn 1. **Give up** ends the game.

Your score compares your moves with the route Venn knows. That route is "known", not optimal, so beating it counts.

| Moves ÷ known route | Label |
|---|---|
| 1× or less | In sync |
| up to 2× | Finding each other |
| up to 3.3× | Drifting |
| more, or gave up | Lost each other |

Daily routes are 2 moves on Monday and Tuesday, 3 on Wednesday, Thursday and Sunday, and 4 on Friday and Saturday.

**After each reveal** you see Venn's reaction, its guess about where you'd go (✓ or ✗), whether your step brought you closer, and a check that Venn's move matched what it sealed. **What Venn considered** shows the moves it weighed and the memories it used or ignored, with reasons.

**After each game** the report shows where you met, a closeness chart, Venn's known route, the topics you visited, what you said you like next to where you actually went, and what Venn will remember. Press ✓ to keep a memory or **not me** to delete it for good. The share text has no spoilers.

**The Us page** shows a map of where you two click and where you lose each other, what Venn has learned about how you play, your learning curve, and a **Forget me** button.

### Where your memory lives

Everything Venn knows about you is stored in your browser's localStorage. The server checks it on every request but never stores it.

- It survives closing the browser.
- It's separate for each browser, browser profile and site address. `localhost:3000`, the production URL and each preview URL have their own memory.
- Private windows forget it when they close.
- **Forget me** wipes all of it.

## Run it locally

You need Node.js 22 or later. API keys are optional:

- An **Anthropic key** gives you Venn's judgment on close calls and its written reactions.
- An **OpenAI key** gives better embeddings for topics and closeness.

```sh
git clone https://github.com/VZhou07/Common-Ground.git
cd Common-Ground
npm ci
cp .env.example .env.local
```

Open `.env.local` and set at least `GAME_SECRET`. Generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For the full experience, also set `LLM_ENABLED=true`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. Then start the dev server and open [http://localhost:3000](http://localhost:3000):

```sh
npm run dev
```

Restart the server whenever you change `.env.local`.

**Without any keys** the game is still fully playable. Venn's planner makes every move, reactions come from templates, and an offline embedder stands in for OpenAI, so topics and closeness are rougher.

### Environment variables

All of these stay on the server; none are sent to the browser.

| Variable | Needed? | What it does |
|---|---|---|
| `GAME_SECRET` | For `npm start` and Vercel | 64 hex characters. Encrypts each game's state and hides Venn's sealed move. In `npm run dev` a temporary key is used, so games end when the server restarts. |
| `LLM_ENABLED` | Optional, off by default | `true` lets Claude judge close calls and write reactions. `false` is also the outage switch. |
| `ANTHROPIC_API_KEY` | With `LLM_ENABLED=true` | Claude Sonnet 5.5 (decisions) and Claude Haiku 4.5 (reactions, end-of-game memories). |
| `OPENAI_API_KEY` | Recommended | `text-embedding-3-small` embeddings. Without it the offline embedder is used. |
| `VENN_THINK_MODEL` | Optional | Default `claude-sonnet-5-5`. |
| `VENN_VOICE_MODEL` | Optional | Default `claude-haiku-4-5-20251001`. |
| `LLM_DAILY_BUDGET_USD` | Optional | Default `3`. Each server instance stops calling Claude for the day after spending this much. |
| `EMBED_PROVIDER`, `EMBED_MODEL` | Optional | `openai` or `local`. By default OpenAI is used whenever its key is set, with `text-embedding-3-small`. |
| `VENN_PAIR_MODEL` | Optional | Model used by `prepare:pairs -- --opus`. Default `claude-opus-5-5`. |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on port 3000. |
| `npm run build`, then `npm start` | Production build, then serve it. `npm start` needs `GAME_SECRET`. |
| `npm test` | Unit and self-play tests. They run with the LLM off and the offline embedder, so no keys are needed. |
| `npm run check` | Lint and typecheck. |
| `npm run smoke` | Plays a full tutorial through the real API of a running server and verifies every sealed move. It targets `http://localhost:3000` unless `BASE` is set. |
| `npm run prepare:pairs -- --check` | Re-checks every known route in `data/proposals.json` against the saved Wikipedia snapshots. |
| `npm run prepare:pairs` | Builds the pair pool from `data/proposals.json`: checks every hop, then saves page snapshots and topics. It fetches from Wikipedia. |
| `npm run prepare:pairs -- --opus` | Asks Claude Opus to propose routes instead. Needs `ANTHROPIC_API_KEY`. |
| `npm run prepare:pairs -- --embed` | Rebuilds the saved embeddings in `data/embeddings.*`. Needs `OPENAI_API_KEY`. |
| `npm run core:index` | Regenerates the code walkthrough in [docs/CORE.md](docs/CORE.md). |

## Deploy to Vercel

1. Push the repo to GitHub. On [vercel.com](https://vercel.com), go to **Add New → Project** and import it. The framework (Next.js) and build settings can stay on their defaults.
2. Under **Settings → Environment Variables**, add `GAME_SECRET`, `LLM_ENABLED=true`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` for Production, and Preview if you want preview links.
3. Deploy. The pages are served as static files, and the routes in `src/app/api` run as Node.js functions with the `data/` folder bundled in. There's no separate backend or database.
4. Check the live site:
   - Type an interest. If topic chips appear, OpenAI is working.
   - Play a few turns. "What Venn considered" should sometimes say "A close call: Venn deliberated with Claude", which shows Anthropic is working.
   - Optionally, run `BASE=https://your-app.vercel.app npm run smoke`. In PowerShell: `$env:BASE="https://your-app.vercel.app"; npm run smoke`.
5. Set monthly spend limits in the Anthropic and OpenAI consoles. If a provider has an outage or you hit your budget, set `LLM_ENABLED=false` and redeploy; the game keeps working.

## Troubleshooting

- **Port 3000 is already in use:** run `npm run dev -- -p 3001`.
- **`npm start` stops with "Set GAME_SECRET…":** production needs a valid 64-hex `GAME_SECRET` in `.env.local` or in Vercel.
- **Every interest says "No stated interest", or games fail on new pages:** the OpenAI key is missing credit or invalid. Fix it, or remove it to fall back to the offline embedder.
- **Venn never deliberates:** "The planner decided on its own" on clear turns is normal. If no turn ever says "A close call: Venn deliberated with Claude", check `LLM_ENABLED=true` and `ANTHROPIC_API_KEY`, then restart the server.
- **"Venn is still deciding…" shows an error:** press **Retry Venn's turn** and check the server terminal.
- **Your history is gone:** you're probably on a different browser, site address or private window. Memory is stored per browser and per site.

## How it works

- **Code owns the rules and facts; the LLM makes judgment calls and writes words.** Every model output is checked, and there's always a deterministic fallback, which is why the game also works with the LLM off.
- **Each turn,** Venn reads the playable links in both articles, predicts your click with a model it learns from your play, and scores each of its own links. The score combines meeting you now, getting close to where you're likely to go, its taste for math (which fades as you drift apart), and the route it knows. After three diverging turns in a row it stops following and leads you back.
- **Clear choices are made instantly by the planner.** On close calls, Claude Sonnet 5.5 picks from a shortlist the code has already checked. It sees up to six memories, chosen by how much each would change the decision, and can only cite memories it was actually shown. If it disagrees with the predictor about where you're heading, it has to cite a memory that backs it up.
- **Venn seals its move before you move.** The move is locked inside an encrypted game token, and your browser gets a SHA-256 hash of it up front. At the reveal, your browser checks that the revealed move matches that hash.
- **After each reveal,** Venn updates its models: your click predictor, per-topic ratings of where you click and where you lose each other, its own blind spots, and what you say you like against where you actually go. Claude Haiku 4.5 writes a one-line reaction, which is checked before it's shown. At the end of a game, repeated patterns become memories you can keep or reject.
- **Privacy:** your interest text is only ever sent to the embeddings API, never to an LLM. Identity topics (religion, health, gender and similar) are never profiled.

The [code walkthrough](docs/CORE.md) indexes the important lines, in reading order. The source layout:

```
src/app          pages (/, /play, /us) and API routes (api/game/start, think, move; api/interest)
src/components   the reader, Venn's card, the meter, the reveal, the end report, the Us map
src/lib          game rules and sealing, the agent (perceive, planner, deliberate, reflect),
                 context selection, learned models, closeness, embeddings, topics, Wikipedia, voice
data             the pair pool, Wikipedia snapshots, topic tags and embeddings
scripts          pair generator, smoke test, walkthrough index
tests            node:test suites
```

Article text and links come from Wikipedia under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); each article links to its source.
