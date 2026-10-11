import type { GithubCiState } from "../types/dashboard";

// Worst state wins: one failure fails the whole, then anything still running
// makes it pending, and only an all-green set passes. A null input is "no
// signal" (no runs, no statuses) and is ignored; null comes back only when
// nothing had a signal at all, so callers can tell "no CI" from "passing".
export function combineCiStates(
  states: (GithubCiState | null)[],
): GithubCiState | null {
  const signals = states.filter((state) => state !== null);
  if (signals.includes("failing")) {
    return "failing";
  }
  if (signals.includes("pending")) {
    return "pending";
  }
  if (signals.includes("passing")) {
    return "passing";
  }
  return signals.includes("none") ? "none" : null;
}
