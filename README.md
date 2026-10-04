# Common Ground v2

A cooperative Wikipedia game with Venn. You each seal a link move, reveal together, and try to arrive on the same page on the same turn. Venn learns how you play across games in this browser.

## Run locally

Requires Node 22 or later.

```sh
npm ci
cp .env.example .env.local
# Set GAME_SECRET to 64 random hex characters in .env.local.
npm run dev
```

`LLM_ENABLED=false` is fully playable. Without `OPENAI_API_KEY`, embeddings use a deterministic local fallback. With `LLM_ENABLED=true` and `ANTHROPIC_API_KEY`, Sonnet 5.5 judges close calls and Haiku 4.5 writes checked reaction lines; code decides every other turn. The API key stays on the server.

## Verify

```sh
npm test
npm run check
npm run build
```

For an HTTP playthrough, run `npm start` after the build in one terminal, then `npm run smoke` in another. The smoke script verifies the commitment hash and completes the tutorial. The pair generator is `npm run prepare:pairs`; `npm run prepare:pairs -- --check` only validates route proposals. `npm run core:index` refreshes [the code walkthrough](docs/CORE.md).

## Deploy

Deploy the Next.js app to Vercel with `GAME_SECRET` set to 32 random bytes encoded as 64 hex characters. Set `LLM_ENABLED=false` for a no-key demo, or provide `ANTHROPIC_API_KEY` and set `LLM_ENABLED=true` for live deliberation and voice. `OPENAI_API_KEY` enables OpenAI embeddings. With that key available locally, run `npm run prepare:pairs -- --embed` before deployment to produce the pinned int8 embedding file.

There are 20 checked pool entries: one tutorial, twelve interest buckets, and seven weekday dailies. Three dailies reuse a checked Unlimited route; Friday and Saturday have distinct four-move extensions. Pinned Wikipedia snapshots make their known routes reproducible. Live pages use Wikipedia when players leave the pinned pool.

The browser stores the profile and raw interest text in localStorage. The server validates the profile on every request and does not store it. The raw interest is sent only to the embeddings endpoint; model prompts receive topic labels. The [spec](AGENTS.md) records the full design and [submission draft](docs/SUBMISSION.md) covers the demo and interview story.
