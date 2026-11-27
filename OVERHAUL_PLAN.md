# Atlas Syndicate Overhaul Plan

## Working agreement

Every coherent increment is tested, committed with a conventional-commit message, and pushed to `origin/main`. This file is updated in every increment so it also serves as the resume note if work stops.

## Current state

* **Phase:** 2, title and reset increment complete.
* **Baseline commit:** `acdcf77` (v7.1.0).
* **Repository health:** clean before analysis; `origin` fetch/push configured to the GitHub repository.
* **Baseline validation:** `node tests/run-headless.js selftest` passed before this overhaul.

## Findings and design decisions

* The deterministic simulation and resource/combat rules are retainable foundations. The overhaul will not replace them merely for novelty.
* The critical problem is comprehension and pacing, not a lack of systems.
* The design centre moves to a clear local loop: establish a doctrine, activate production, turn it into fleet/expansion, then adapt to a new world.
* Pixel art stays in the world and feedback; information UI becomes cleaner, larger, and more restrained.
* The first implementation target is a pure `next move` selector plus a command-deck card. This gives every screen a focused, testable answer to “what now?” without disrupting simulation rules.

## Completed increments

| Commit | Status | What changed | Verification |
|---|---|---|---|
| `0313004` | Complete | Phase 1 audit and this persistent plan | Document review |
| Pending | Complete | Pure next-move selector, command-deck priority card, and self-test coverage | `node tests/run-headless.js selftest` |
| Pending | Complete | Staged hunger, recovery copy, FX, and regression coverage | Self-test; 5-seed economy sanity |
| Pending | Complete | Full local data reset and title-screen art direction | Self-test |

## In progress

None. The next increment begins only after confirming a clean tree.

## Next increments

1. Rewrite onboarding and replace stale browser test coverage.
2. Add discoverable action modes/click-to-preview for drill and routes.
3. Refine visual feedback, shop roles, difficulty/event pacing, and accessibility.

## Resume note

Increment 1 added `S.nextMove(run, fid)`, a pure priority selector used by the left command deck whenever no object is selected. It prioritises visible threats, food/water/fuel risk, first cash/food/military milestones, frontier expansion, and strategic freedom. It is loaded in the game, browser self-test, and Node runner; the first-cash-engine rule is covered by the deterministic self-test.

Increment 2 makes hunger a recoverable failure state. The first two missed meals reduce available staffing to 75%, visibly stopping lower-priority machinery but preserving workers. Only the third sustained missed cycle begins attrition, at a reduced rate. Restored food resets hunger and workers return through the existing regrowth loop. The self-test now proves both stages; a 5-seed economy sanity run remained clean.

The latest increment adds a two-click **RESET ALL DATA** affordance in Settings. It clears every Atlas-version key from browser storage plus fallback memory, then reloads. The title screen now has a dedicated pixel-art frontier vignette, animated freighters, more confident framing, and a clearer one-line promise while retaining a compact layout on narrow screens.

Before any next increment: run `git status --short`, then implement only the next coherent listed step, test it, update this file, commit, and push.
