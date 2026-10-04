# Submission draft

Fill in the demo and Loom links, play ten real games, record actual time spent, and verify the live model path before sending. This file is a draft, not a claim that those steps happened.

**Demo:** [add Vercel URL]

**Loom:** [add link, 3 minutes maximum]

**Actual time:** v1 about 4.5 hours on Saturday; v2 [record actual hours] on Sunday/Monday.

## Short write-up

Common Ground is a cooperative Wikipedia game I wanted to return to. I start on one article and Venn, my AI partner, starts on another. We each secretly choose a link, seal our moves, and reveal together. We meet by landing on the same page on the same turn. Venn has a mathematical taste, but its real job is to read how I navigate and make itself a better partner over games.

The first version highlighted shared links. That made the game a map optimization problem: the agent could learn the graph but learned little about its partner. In v2 I hid Venn's links. The player sees its current article, topic tags, and a difficulty-dependent hint. A closeness meter gives feedback without exposing the answer. There is a tutorial, twelve interest-led Unlimited starts, and a numbered daily with a checked known route. The score compares moves with that route, never claiming it is optimal.

Venn is a real player. Code parses playable prose links, predicts my next click with an online conditional logit, scores legal moves for meeting probability, future closeness, taste and rescue, then seals one before I move. The predictor has a random-click rate and shrinks toward an average-player prior. Topic Elo estimates where I navigate well and where Venn misreads me; a separate Dirichlet model compares stated interests with the topics I actually enter. Venn's taste fades if we drift apart, and after three diverging turns it leads toward its known route. Clear turns need no model call.

For close calls, Claude Sonnet 5.5 judges a shortlist of moves already checked by code. The interesting part is which memory reaches it. Each structured memory is scored by how much applying it changes the predicted click distribution or top move, plus situation match, reliability and novelty. A six-item budget skips redundant, contradicted or stale items. Venn may recall two more items read-only, then must choose a shortlist ID and cite any memory used to override the predictor. Bad output or a timeout falls back to the planner. Claude Haiku 4.5 writes short checked reaction lines and selects end-of-game memory candidates by ID; those words are display-only and never enter a later prompt. I used OpenAI `text-embedding-3-small` at 256 dimensions for semantic similarity when configured; the no-key fallback keeps the game playable. Route proposals came from AI assistance, and code checked every Wikipedia hop, policy, and route length before pinning snapshots. I used Codex for implementation and tests. [Adjust this paragraph to match the actual deployed model configuration.]

I made memory visible. The reveal shows what Venn considered, including memories it used and ignored with reasons. The “Us” page shows where we click, where we lose each other, blind spots, a learning curve, and stated versus revealed interests. I can reject a memory with “not me” or erase the whole local profile. Sensitive topics never contribute to profiling. Wikipedia and browser data are untrusted; prompts use delimited, capped descriptions, and every model choice and line is checked. The game works with `LLM_ENABLED=false`, so an outage or budget cap does not stop play.

Next I would compare no memory, all memory, and selected memory on recorded games; add aggregate crowd statistics, a cross-device memory link, live pair generation with “Surprise me,” more personas, and a two-human mode where Venn helps them meet.

## Loom run of show

1. **0:00–0:20 — Hook.** “We both click Wikipedia links, secretly and together. The game is whether we can read each other well enough to meet.”
2. **0:20–1:20 — Live game.** Show a user profile after ten real games. Call out the hint and closeness meter, seal one move, open the reveal and Venn's read. Show the browser's commitment check.
3. **1:20–2:00 — Us.** Show the topic map, a blind spot, and stated versus revealed interests.
4. **2:00–2:40 — How it decides.** Open “What Venn considered.” Explain the predictor and planner, the close-call gate, decision-impact memory selection, and checked LLM judgment. Show one used and one ignored item.
5. **2:40–3:00 — Fresh player and next.** Show the first-game setup and tutorial. Mention the memory-selection experiment. Say “I played 10 games over the weekend before recording” only after doing so.

## Final checks

- [ ] Set production `GAME_SECRET` and decide whether production uses live Anthropic and OpenAI keys.
- [ ] Verify live close-call deliberation and reaction with those keys, including fallback behavior.
- [ ] Deploy and check `/`, `/play`, `/us`, and one complete game on the public URL.
- [ ] Play ten real games and inspect the “Us” page and remembered items.
- [ ] Record Loom at 3 minutes or less; add both URLs and actual time above.
- [ ] Send the final materials before Monday, October 5, 2026 at noon Eastern (target 10am).
