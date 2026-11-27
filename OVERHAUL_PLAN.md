# Atlas Syndicate Overhaul Plan

## Working agreement

Every coherent increment is tested, committed with a conventional-commit message, and pushed to `origin/main`. This file is updated in every increment so it also serves as the resume note if work stops.

## Current state

* **Phase:** 1 complete; Phase 2 begins next.
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
| Pending | Complete | Phase 1 audit and this persistent plan | Document review; commit/push next |

## In progress

None. The next increment begins only after confirming a clean tree.

## Next increments

1. Create a pure next-move selector with priority rules for initial economy, shortages, military readiness, and expansion. Add tests.
2. Render the selector as the top command-deck card, keeping contextual build/inspection cards first when selected.
3. Rework starvation into warning → reduced output → attrition, with an emergency recovery affordance.
4. Rewrite onboarding and replace stale browser test coverage.
5. Add discoverable action modes/click-to-preview for drill and routes.
6. Refine visual feedback, shop roles, difficulty/event pacing, and accessibility.

## Resume note

The analysis is intentionally broad but grounded in the current codebase. Before any code increment: run `git status --short`, then implement only the next coherent listed step, test it, update this file, commit, and push.
