# Verification (v6.0.0)

Everything below was measured on the committed code, using `node tests/run-headless.js <mode>` (Node, macOS) and `tests/browser-test.js` (headless Chromium). Missed targets are reported as missed.

## Summary

| Target (from the v6 brief) | Result | |
|---|---|---|
| Coalition leader wins ≤ ~55% | 63% (78% with coalitions off) | **MISSED** |
| Leader loses systems after reaching 35% in most games | 61% | met |
| ≥ 50% of games end by elimination | 42% overall: Normal 57%, Hard 51%, Easy 19% | **MISSED overall** |
| Every personality wins 10–30% | 7–31% (Raider 7%, Merchant 31%) | **MISSED (narrowly)** |
| Average player wins ≥ 55% on Easy | 18% | **MISSED** |
| Average player wins 25–40% on Normal | 3% | **MISSED** |
| Average player wins 10–20% on Hard | 0% | **MISSED** |
| Production matches what buildings claim (50 seeds) | 0 mismatches in 31,488 cycle checks | met |
| No AI building idle > 3 min | 186 cases in 50 games (~3.7 of ~323 buildings per game) | **MISSED** |
| Every resource is used | credits, alloy, fuel and food are all spent | met |
| Fuzz, determinism, save/load incl. planet actions | 0 failures; replay and resume identical | met |
| Browser test at 1366×768 and 1920×1080, zero console errors | 31/31 checks at both sizes | met |

## 1. AI tournament: 210 full games of six AI factions (`tournament`)

70 games each on Easy, Normal and Hard. In the tournament all six seats play at the game's difficulty. (In the real game seat 0 is the human; when the AI borrows it for F9 or `?demo`, it plays at Normal.) Then the same 210 games run again with coalitions switched off, as an A/B comparison.

| | All | Easy | Normal | Hard | Coalitions OFF |
|---|---|---|---|---|---|
| Ended by elimination | 42% | 19% | 57% | 51% | 57% |
| Mean length (min) | 28.3 | 29.5 | 27.6 | 27.7 | 27.3 |
| A faction reached 35% | 100% | 99% | 100% | 100% | 99% |
| …and that leader won | **63%** | 48% | 67% | 74% | **78%** |
| …and lost systems afterwards | **61%** | 87% | 57% | 39% | 61% |
| Coalitions / coalition strikes per game | 2.2 / 4.4 | 2.5 / 6.7 | 1.9 / 3.9 | 2.2 / 2.6 | 0 / 0 |
| Survivors at the end | 2.5 | 3.1 | 2.0 | 2.3 | 1.8 |
| First attack (min) | 4.7 | 5.2 | 4.5 | 4.3 | 4.7 |
| Attacks on seat 0 that were warned first | 86% | 86% | 85% | 88% | 87% |

Wins by personality (all 210 games): Balanced 19%, Warlord 10%, Merchant 31%, Turtle 21%, Opportunist 13%, Raider 7%. By difficulty: on Easy the Turtle wins 40%, because slow rivals rarely crack its chokepoints. On Hard the Merchant wins 41%.

**What the coalition A/B shows:** coalitions cut the leader's win rate from 78% to 63%, add about 0.6 survivors per game and make games a minute longer. They work, but not enough to reach the ≤55% target. A coalition also ends when fewer than three factions are left, so once a leader has eliminated enough rivals, it usually can't be stopped.

## 2. Player slot: scripted average player (`player`, `tests/average-player.js`)

The average player is a deliberately simple script, not the game AI. It:

- builds the tutorial's chains (metal, gold, ice, fuel), plus more of whatever the top bar shows running short
- buys a free neighbour when it can afford one
- attacks only at the odds the order panel shows: 70% for independent systems, 78% for rivals, 60% for a capital
- reacts to warnings
- spends spare alloy on platforms and warships

It played 40 games per difficulty.

| | Won | Top two | Eliminated | Survived past 10:00 | Systems at end | Attacks warned |
|---|---|---|---|---|---|---|
| Easy | **18%** | 38% | 53% | 98% | 4.2 | 84% |
| Normal | **3%** | 13% | 80% | 100% | 0.7 | 86% |
| Hard | **0%** | 10% | 93% | 100% | 0.1 | 86% |

All three targets are missed. The scripted player is much weaker than the AI at the planet economy: by 10:00 it has built roughly a third as many buildings. For comparison, in an earlier run of the same tournament, an AI-quality player (the Balanced AI in seat 0 at Normal, against five Easy rivals) won 70% of Easy games. So a good economy can beat Easy, but this script can't yet. No human has played v6.

## 3. Economy sanity (`economy`): 50 seeds, all-AI games to 20:00

- **Claims match production.** At every cycle payout, the test compared the alloy, fuel and food each faction received with what its buildings' panels claimed one tick earlier. The claims come from `S.sysFlow`, the same function the planet view, the AI and the forecast use. Credits were compared with the levy included. **0 mismatches in 31,488 checks.** 516 ticks were skipped because something was built, broken or captured, or an event began, inside that exact tick (the claim was out of date, not wrong).
- **Idle buildings.** Over 50 games, there were 186 cases of an AI building staying idle or blocked for more than 3 minutes. Captured systems are excluded for their first 3 minutes. That is about 3.7 per game, out of about 323 buildings. The usual causes are an extractor whose processor is full with no free slot, or a processor whose deposit ran dry. The AI now handles both:
  - it builds chains whole or not at all
  - it reconnects extractors to processors with room, or adds a second processor
  - it drills or clears extractors that have no drill
  - it clears anything stuck for more than 2–2.5 minutes

  On Normal, though, it takes only two economy steps per think, so some fixes wait. Target **missed**.
- **Every resource is used.** Average per game, made / spent: credits 88,670 / 102,657 (spending includes levies), alloy 10,191 / 9,785, fuel 4,828 / 2,601, food 8,150 / 6,839.

## 4. Fuzz test (`fuzz`)

30 full games of random actions from seat 0; half of them also have the scripted player. The random actions cover building in random slots, drilling random paths, conveyors and port links, pathways, demolishing, repairs, recruits, moves, buys, upgrades, ships and platforms. In total: 59,064 actions (7,790 accepted), 395,414 steps and 132 save/load round trips, with invariant and finite-number checks throughout. **0 failures.**

## 5. Determinism (`replay`)

Three seeds (Normal, Hard, Easy). Each plays a full game with the scripted player; a fresh run then replays only the recorded actions (126, 125 and 85 actions, including drills, conveyors and ports). Both runs end with an **identical state hash**. Separately, an all-AI game saved and resumed at 10:00 stays **identical** to the uninterrupted game through 15:00.

## 6. F9 presenter jump (`f9`)

16 of 20 jumps land in a playable mid-war state at 15:00: player alive with 2+ systems and 8+ buildings, and 3+ factions left. In the other 4, the AI playing your slot had been knocked down to one system.

## 7. Browser test (`tests/browser-test.js`, headless Chromium, 1366×768 and 1920×1080)

The run, in order:

1. Title → new game → choose a home.
2. **The whole tutorial with real pointer input:**
   - click the system, then the home planet
   - click a slot and the MINE button
   - **drag a drill** cell by cell down to the metal deposit
   - place a smelter and **drag a conveyor** to it, then wait for alloy
   - the same for gold
   - **drag a pathway** between two planets
   - build an ice drill and **drag its conveyor into the port**
   - build a water plant on the other planet, **fed from its port**
   - recruit
3. Drag onto a neighbour (order panel with odds and fuel) → attack → battle.
4. Upgrade shop: buy an upgrade by clicking.
5. F9 to 15:00, then play on until a coalition strikes the leader → end report.
6. `?demo` (opens on a battle and cuts to a busy planet within 25 s), `?aidebug`, `?seed=12345` and `tests/selftest.html`.

**31/31 checks passed at both sizes, with zero console errors.** The test saved the screenshots in this folder, including:

- `planet-view.png`: the home planet with drills, conveyors, deposit amounts and its port
- `ports-other-planet.png`: the linked planet receiving 2.1 ice per cycle through its port into a water plant
- `ai-debug.png`: the `?aidebug` overlay
- `coalition.png`: a coalition strike on the leader, with the truce and strike clock

## 8. Self-test (`selftest`, and `tests/selftest.html` in a browser)

26 rule checks, **all passed** in Node and in the browser:

- **Galaxy:** galaxy shape and connectivity; equal distances between homes and to the core; identical home planets; every deposit reachable from a surface slot; deterministic generation.
- **Planet:** one building per slot; drills must end in a matching deposit; drill cost matches the shown price; a blocked extractor reports its reason; conveyors only join matching resources; mine > smelter makes alloy.
- **Flow and logistics:** the cycle pays what the buildings claim and depletes the deposit; opening a pathway; a port with nothing on the far side is blocked; ice travels through a pathway to a water plant; a broken processor stops the chain and reports why; repair costs credits and alloy.
- **Upgrades and armies:** upgrade effects apply; moving an army costs fuel; no fuel, no move.
- **Integrity:** invariants hold; save/load round trips are exact.
- **AI:** coalition members can't attack each other; 6 minutes of all-AI play with no invariant or NaN failures; every AI builds a real planet economy.

## Not tested

- Human playtests of v6: every balance number comes from AI and scripted players.
- Real touch devices, phone browsers, Firefox and Safari (only headless Chromium was used).
- Audio output: WebAudio runs, but nobody listened during a test.
- The UI scale setting snaps to whole-pixel scales, so on some screens 125% and 150% look the same.
