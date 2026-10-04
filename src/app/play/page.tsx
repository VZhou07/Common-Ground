import { Suspense } from "react";
import { Game } from "@/components/game";

export default function PlayPage() {
  return (
    <Suspense fallback={<main className="shell"><p className="muted">Setting up two pages…</p></main>}>
      <Game />
    </Suspense>
  );
}
