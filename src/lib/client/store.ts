"use client";
// Everything Venn knows about you lives here, in this browser (§9).
// The raw interest text never leaves the browser except to be embedded.
import type { Profile } from "../model/profile";

const KEY = "cg.v2.profile";
const INTEREST = "cg.v2.interest";
const SETTINGS = "cg.v2.settings";
const DAILY = "cg.v2.daily";

export type Settings = { difficulty: "easy" | "normal" | "hard"; mode: "daily" | "unlimited" };
export type Interest = { text: string; buckets: { id: string; label: string }[]; setAtGame: number };

const read = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

export const loadProfile = () => read<Profile>(KEY);
export const saveProfile = (p: Profile) => write(KEY, p);
export const loadInterest = () => read<Interest>(INTEREST);
export const saveInterest = (i: Interest) => write(INTEREST, i);
export const loadSettings = (): Settings => read<Settings>(SETTINGS) ?? { difficulty: "normal", mode: "unlimited" };
export const saveSettings = (s: Settings) => write(SETTINGS, s);
// Which daily you've finished, so the setup screen can say so.
export const loadDailyDone = () => read<{ day: string; label: string; share: string }>(DAILY);
export const saveDailyDone = (d: { day: string; label: string; share: string }) => write(DAILY, d);

export function forgetMe() {
  for (const k of [KEY, INTEREST, SETTINGS, DAILY]) localStorage.removeItem(k);
}

export const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The browser checks Venn's commitment itself: SHA-256 of [move, nonce].
export async function verifyCommitment(r: { move: string; nonce: string; commitment: string }, expected: string): Promise<boolean> {
  if (r.commitment !== expected) return false;
  const bytes = new TextEncoder().encode(JSON.stringify([r.move, r.nonce]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === expected;
}

export async function api<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: "The server sent a bad response." }));
  if (!response.ok || (data as { error?: string }).error) throw new Error((data as { error?: string }).error ?? "Request failed.");
  return data as T;
}
