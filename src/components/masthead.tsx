import Link from "next/link";

export function Masthead() {
  return (
    <header className="masthead">
      <Link href="/" className="wordmark">Common Ground</Link>
      <nav className="nav" aria-label="Main">
        <Link href="/">New game</Link>
        <Link href="/how">How to play</Link>
        <Link href="/us">Us</Link>
      </nav>
    </header>
  );
}
