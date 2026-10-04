// Step 1 placeholder. The real setup screen (§10.1) arrives in step 8.
export default function Page() {
  return (
    <main className="shell">
      <header className="masthead">
        <h1 className="wordmark">Common Ground</h1>
        <span className="kicker">v2</span>
      </header>
      <p className="standfirst" style={{ marginTop: "2rem" }}>
        I&apos;m Venn. I like math and anything that smells like it. What about you?
      </p>
      <p style={{ color: "var(--ink-faint)", fontSize: "0.85rem" }}>
        Scaffold is up. Setup, play, reveal and the Us map land in later steps.
      </p>
    </main>
  );
}
