import { spawn } from "node:child_process";

/**
 * Wake the Mac's display when an event worth seeing arrives.
 *
 * `caffeinate -u -t N` asserts "user is active" for N seconds: the display
 * turns on immediately (and stays on at least that long), exactly as if
 * someone touched the mouse. Requires no permissions.
 *
 * NOTE: this can only wake the *display*. If the whole machine system-sleeps,
 * the bridge can't even receive the event — on the kiosk Mac mini disable
 * system sleep once with:  sudo pmset -a sleep 0   (display sleep can stay).
 *
 * Disable with TAMACLAW_WAKE=off. Seconds tunable via TAMACLAW_WAKE_SECS.
 */

const enabled = process.platform === "darwin" && process.env.TAMACLAW_WAKE !== "off";
const holdSecs = Math.max(1, Number(process.env.TAMACLAW_WAKE_SECS ?? 15) || 15);

let holdUntil = 0;

export function wakeDisplay(): void {
  if (!enabled) return;
  const now = Date.now();
  if (now < holdUntil - 2_000) return; // an assertion is already active — don't spam
  holdUntil = now + holdSecs * 1_000;
  spawn("caffeinate", ["-u", "-t", String(holdSecs)], {
    stdio: "ignore",
    detached: true,
  })
    .on("error", () => {})
    .unref();
}
