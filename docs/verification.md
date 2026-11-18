# Verification record (v4.0.0)

All numbers below come from `node tests/run-headless.js all --seeds 10 --fuzz 40`, which drives the same
simulation files the browser loads. Result: **PASS**.

## Self-test
- 300 generated systems: each has a capital, ice and ore in the starting area, a gas world as the first discovery, and a megaproject site.
- All 8 charters initialise and simulate cleanly; share codes round-trip and reject garbage.
- Reference skilled run: megaproject unlocked 18:00, completed 27:31, no invariant failures.
- Same seed + same actions reproduce the same state hash; save at 4:00 + resume equals an uninterrupted run.
- A player who does nothing loses (42:00 on the reference seed).

## Determinism
Three seeds: the recorded action log replayed with no bot gives an identical state hash, and save/load mid-run gives identical state.

## Fuzz
40 runs, 26,778 random (often invalid) player actions, 338,755 simulation steps, 140 save/load round trips mid-run.
Invariants (stock and population ranges, route and map consistency, freighter loads, NaN scan) checked every 20 steps. **0 failures.**

## Balance: 8 charters x 10 seeds, 45-minute limit, built-in player at three skill levels

| Player | Runs | Reached megaproject | Completed it | Median completion | Lost | Median time of loss |
| --- | --- | --- | --- | --- | --- | --- |
| Skilled | 80 | 96% | 79% | 27.0 min (range 20.7-42.8) | 20% | 23 min |
| Casual (slow, fewer and worse decisions) | 80 | 85% | 3% | 33 min | 98% | 22.5 min |
| Idle (does nothing) | 80 | 0% | 0% | - | 100% | 27 min |

Skilled player by charter (reached / completed / lost / median completion):
standard 90/90/10% 27.0 min, lean 100/80/20% 33.5, frontier 90/80/20% 28.0, volatile 100/80/20% 29.1,
hazard 100/70/30% 28.3, veins 100/60/40% 31.9, austerity 100/90/0% 26.7, taxed 90/80/20% 25.4.

The bot is a stand-in for real players: "skilled" plays steadily but not perfectly, "casual" acts every 6 s,
never takes contracts and picks perks at random. Human playtesting has not been done.

## Browser checks (Playwright, headless)
- Chromium: onboarding (4 steps by real clicks and a real drag), a full quarter and review, F9 to the megaproject, F9 fill, finale, report: 0 console errors or warnings.
- Firefox: the same flow, 0 errors. WebKit (Safari) has not been tested yet.
- Title, settings, achievements, how to play, leaderboard, code entry, charter, `?seed=`, `?demo`, phone-sized viewport with touch taps: 0 errors.
- Save and resume: closing the tab mid-run autosaves; reopening offers CONTINUE at the same time and state.
- Performance at 1920x1080 in a late game at 3x speed: steady 16.7 ms frames, about 1-2 ms CPU per frame (Chromium), about 4 ms (Firefox).
