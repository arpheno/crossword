import { useEffect, useState } from 'react';

type SolveClockProps = {
  activeMs: number;
  lastClockAtMs: number;
  lastInteractionAtMs: number;
  paused: boolean;
};

function format(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = minutes.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${seconds}` : `${mm}:${seconds}`;
}

const INACTIVITY_LIMIT_MS = 30_000;

/**
 * The visible clock is a leaf: it ticks on its own state so a second can
 * never re-render the grid or clue spines (docs/plans/06 §11). The session
 * snapshot stays authoritative; this is a live estimate that mirrors the
 * domain's active-time rule (paused or idle past the limit => frozen).
 */
export function SolveClock({ activeMs, lastClockAtMs, lastInteractionAtMs, paused }: SolveClockProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  void tick;
  const now = Date.now();
  const inactive = now - lastInteractionAtMs > INACTIVITY_LIMIT_MS;
  const displayed = paused || inactive ? activeMs : activeMs + Math.max(0, now - lastClockAtMs);

  return (
    <time className="solve-clock" dateTime={format(displayed)} role="timer" aria-label="Active solve time">
      {format(displayed)}
    </time>
  );
}
