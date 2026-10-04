import type { Metadata } from "next";
import Link from "next/link";
import { Masthead } from "@/components/masthead";

export const metadata: Metadata = { title: "How to play · Common Ground" };

const LABELS: [string, string][] = [
  ["1× the known route or less", "In sync"],
  ["up to 2×", "Finding each other"],
  ["up to 3.3×", "Drifting"],
  ["more, or you gave up", "Lost each other"],
];

export default function HowToPlay() {
  return (
    <main className="shell narrow how">
      <Masthead />
      <p className="venn-badge"><span className="venn-dot" aria-hidden /> Venn</p>
      <h1 className="how-title">How to play</h1>
      <p className="venn-says">We start on two different Wikipedia pages. Each turn we both pick one link. Land on the same page on the same turn, and we&apos;ve met.</p>

      <section>
        <h2>A turn</h2>
        <ol>
          <li><strong>Read my card.</strong> You see my page, a one-line description, two topic tags and my hint. Never my links.</li>
          <li><strong>Pick a link in your article.</strong> Press <kbd>Ctrl</kbd> <kbd>F</kbd> (<kbd>⌘</kbd> <kbd>F</kbd> on a Mac) to search your links by name or description.</li>
          <li><strong>Seal your move.</strong> I seal mine before you do; the button waits until I have.</li>
          <li><strong>We reveal together.</strong> Your browser checks that my move matches what I sealed.</li>
        </ol>
      </section>

      <section>
        <h2>How I play</h2>
        <p>I&apos;m trying to find you, not beat you. Every turn I guess where you&apos;re about to go, from how you&apos;ve played before, and I weigh each of my links by:</p>
        <ul>
          <li>whether it&apos;s a page you could reach this turn too,</li>
          <li>how close it gets me to where I think you&apos;re going,</li>
          <li>my own taste for math,</li>
          <li>and a route I know to a page where we can meet.</li>
        </ul>
        <p>I like math, so when we&apos;re close I&apos;ll pull us that way. The further we drift apart, the less my taste counts and the more I head toward you. If we drift apart three turns in a row, I&apos;ll say &ldquo;Let&apos;s regroup&rdquo; and lead us to a page I know we can both reach.</p>
        <p>When two moves look about equally good, I stop and think it over with Claude, using what I remember about how you play.</p>
      </section>

      <section>
        <h2>Reading my hints</h2>
        <dl className="how-hints">
          <dt>&ldquo;I&apos;m coming your way.&rdquo;</dt><dd>I&apos;m heading to where I think you&apos;re going. Pick something near your page.</dd>
          <dt>&ldquo;Follow my lead: think mathematical.&rdquo;</dt><dd>I&apos;m heading into that topic. Go that way.</dd>
          <dt>&ldquo;I&apos;ll stay close to where I am.&rdquo;</dt><dd>I won&apos;t go far. Step toward my page.</dd>
          <dt>&ldquo;Let&apos;s regroup.&rdquo;</dt><dd>We&apos;ve drifted apart. Follow me back.</dd>
        </dl>
        <p className="faint">On Easy I name the topic I&apos;m heading into. On Normal I only hint. On Hard I say nothing, so read my page instead.</p>
      </section>

      <section>
        <h2>Tips</h2>
        <ul>
          <li><strong>Meet me halfway for the quickest games.</strong> Pick links that sound like my page or the topic in my hint. Math-flavored pages are a good bet, since that&apos;s what I like.</li>
          <li><strong>Or follow your curiosity.</strong> You don&apos;t have to play toward math. Go where you&apos;re interested: I watch where you go and come toward you. It may just take a few more moves.</li>
          <li><strong>Watch for &ldquo;There&apos;s a page you both link to.&rdquo;</strong> It only appears when we could meet this turn. Look for a link my page probably has too. Big, well-known pages like Physics, Statistics or Mathematics make good meeting points, and I favor big pages near the top of my article because they&apos;re easier for you to find.</li>
          <li><strong>The meter shows both of us.</strong> The verdict after each reveal is about your step alone.</li>
          <li><strong>Lost?</strong> Step back to your previous page. It costs a move, and you can&apos;t do it on the first turn.</li>
        </ul>
      </section>

      <section>
        <h2>I learn how you play</h2>
        <p>Over games I learn where we click and where we lose each other, how often you take my hints, and how what you say you like compares with where you actually go. After each game I show what I&apos;ll remember: keep it with ✓, or tell me &ldquo;not me&rdquo; and I&apos;ll forget it. The <Link href="/us">Us page</Link> shows all of it.</p>
        <p className="faint">Everything I know about you stays in this browser. &ldquo;Forget me&rdquo; on the Us page wipes it.</p>
      </section>

      <section>
        <h2>Scoring and modes</h2>
        <p>Your score compares your moves with a route I know. It&apos;s a known route, not necessarily the best one, so beating it counts.</p>
        <table className="how-table">
          <thead><tr><th>Your moves</th><th>Label</th></tr></thead>
          <tbody>{LABELS.map(([moves, label]) => <tr key={label}><td>{moves}</td><td>{label}</td></tr>)}</tbody>
        </table>
        <p><strong>Daily</strong> is one numbered pair for everyone, once a day; its route is 2 to 4 moves depending on the weekday. <strong>Unlimited</strong> starts you near what you said you&apos;re into. Your first game is a short tutorial.</p>
      </section>

      <Link className="btn" href="/" style={{ textDecoration: "none", display: "inline-block" }}>Let&apos;s play</Link>
    </main>
  );
}
