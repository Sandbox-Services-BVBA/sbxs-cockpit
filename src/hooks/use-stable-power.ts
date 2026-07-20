"use client";

import { useEffect, useRef, useState } from "react";

// Hysteresis + hold-timer for a power reading that hunts around zero (e.g.
// the battery balancing the grid CT to ~0, see GRID_DEADBAND in
// energy-format). `raw` should already have a magnitude deadband applied (0 =
// inside the band). Re-entering the deadband snaps to 0 immediately —
// "balans" is never a surprising thing to show — but leaving it only commits
// once the same sign has held for `holdMs`, so noise that flips sign or dips
// back through zero every tick never reaches the display.
export function useStablePower(raw: number, tick: number, holdMs: number): number {
  const [display, setDisplay] = useState(raw);
  const confirmedSign = useRef(Math.sign(raw));
  const pending = useRef<{ sign: number; since: number } | null>(null);

  useEffect(() => {
    const sign = Math.sign(raw);

    if (sign === 0) {
      pending.current = null;
      confirmedSign.current = 0;
      // Depends on wall-clock time across renders (hold timer), so this can't
      // be derived during render — the effect is the state, not a mirror of it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(0);
      return;
    }

    if (sign === confirmedSign.current) {
      pending.current = null;
      setDisplay(raw);
      return;
    }

    if (pending.current?.sign === sign) {
      if (Date.now() - pending.current.since >= holdMs) {
        confirmedSign.current = sign;
        pending.current = null;
        setDisplay(raw);
      }
    } else {
      pending.current = { sign, since: Date.now() };
    }
  }, [raw, tick, holdMs]);

  return display;
}
