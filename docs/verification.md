# Verification (v5.0.0)

Everything below was measured by `node tests/run-headless.js all --games 210 --seeds 40 --fuzz 30` and `node tests/browser-test.js`, on the shipped code. Numbers are reported as measured, including the targets that were missed.

## 1. AI tournament: 210 full games of six AI factions

Each game: 24-system galaxy from a fresh seed, five rival personalities plus the player's slot played by the same AI with the `balanced` personality at Normal skill. 70 seeds per difficulty (Easy, Normal, Hard). Difficulty applies to the five rivals only. Then the **same 210 games with leader pressure switched off** (A/B).

| Run | Games | Length mean / median (min) | In 20–30 min | Ended by timer | Wins %: your slot (AI) | Merchant | Turtle | Opportunist | Raider | Warlord |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 210 | 27.2 / 30 | 94% | 52% | 35 | 23 | 15 | 12 | 10 | 5 |
| easy | 70 | 26.6 / 30 | 90% | 57% | 47 | 7 | 23 | 13 | 9 | 1 |
| normal | 70 | 27.4 / 30 | 96% | 50% | 39 | 27 | 6 | 16 | 10 | 3 |
| hard | 70 | 27.6 / 30 | 96% | 50% | 19 | 34 | 16 | 9 | 13 | 10 |
| leader pressure OFF | 210 | 26.9 / 30 | 91% | 53% | 40 | 27 | 7 | 7 | 13 | 6 |

| Run | First attack, any (min) | First attack on player slot, mean / median (min) | Attacks on player warned ≥4 s ahead | …with a massing warning ≥8 s ahead | Games where someone reached 35% | That leader went on to win | Share of attacks aimed at the leader | Snowball unopposed* | Factions alive at end |
|---|---|---|---|---|---|---|---|---|---|
| all | 4.7 | 7.2 / 6.1 | 87% | 70% | 94% | 74% | 60% | 60% | 2.6 |
| easy | 4.9 | 7.4 / 6.8 | 82% | 66% | 100% | 64% | 62% | 37% | 2.41 |
| normal | 4.6 | 7.5 / 6.1 | 89% | 70% | 93% | 74% | 57% | 79% | 2.51 |
| hard | 4.5 | 6.5 / 5.4 | 91% | 76% | 89% | 85% | 59% | 64% | 2.89 |
| leader pressure OFF | 4.7 | 7.2 / 6 | 88% | 72% | 95% | 80% | 56% | 63% | 2.42 |

\* Snowball unopposed = the winner never lost a single system after first reaching 35% of the galaxy.

**Against the targets**
- Game length 20–30 min: **met** (94% of games; mean 27.2 min).
- No personality above ~30%: **met for the five rival personalities** (highest: Merchant 23% overall, 34% on Hard). **Missed for the AI in the player's slot**: 35% overall, 39% on Normal. Most of its Easy share (47%) is by design (Easy weakens only the rivals). On Normal the edge looks structural: slot 0 picks its home first and the rivals then spread out from it. Adjusting its weights did not fix it (a weaker variant scored 39%), so it is reported, not hidden.
- First real attack on the player by minute 6–8: **met on average** (mean 7.2 min, median 6.1 min; Hard is earlier, median 5.4).
- Readable intent: 87% of attacks on the player's side were preceded by a warning at least 4 s ahead; 70% by a "forces gathering" warning at least 8 s ahead.
- Leader pressure **works, modestly**: with it, attacks aimed at a 35% leader rise from 56% to 60%, that leader wins 74% instead of 80%, and more factions survive to the end (2.6 vs 2.42). The "snowball unopposed" rate is about the same (60% vs 63%).
- Performance: about 171 ms of CPU per full 30-minute game for all six AIs together; each faction thinks on its own staggered timer (every 2.5–9 s), so no frame does more than one or two thinks.

## 2. Player slot: scripted average player (`tests/average-player.js`)

A deliberately simple rule-based player (not the game AI): builds ORE+ENERGY then FOOD chains, keeps salaries near half of income, reacts to warnings, attacks the easiest neighbour at ≥70% odds (rival capitals at ≥60%), buys a neighbour or warships when rich. One decision every 5 s. 40 seeds per difficulty.

| Difficulty | Survived past 10:00 | Won | Top two | Eliminated | Systems at end (mean) | First attack on it (median) | Attacks warned |
|---|---|---|---|---|---|---|---|
| Easy | 100% | 23% | 60% | 18% | 6.8 | 7.5 min | 84% |
| Normal | 100% | 18% | 43% | 30% | 4.6 | 7.9 min | 92% |
| Hard | 98% | 23% | 40% | 40% | 3.9 | 9.1 min | 92% |

**Against the targets**: survives past minute 10 on Normal in most seeds — **met** (100%); loses sometimes — **met** (eliminated in 30%, loses 83%). On Easy it should usually win — **missed**: it wins 23% and finishes in the top two in 60%. The difficulty curve is visible in elimination rates (18% → 30% → 40%) and systems held, but the win rate is flat because a winner on any difficulty is whichever faction takes rival capitals, and the simple bot rarely does.

## 3. Fuzz test

30 full games driven by random (often invalid) player actions — 29,862 actions, 251,243 simulation steps, 82 mid-game save/load round trips. Every 50 steps: a scan for NaN/Infinity anywhere in the state and 1 invariant checker (owners, garrisons, freighter assignment, line stops, durability ranges, battle links, army paths, capitals). **Failures: 0.**

## 4. Determinism

Three seeds (Easy, Normal, Hard): the average player's recorded action log replayed into a fresh game reproduces the final state hash exactly; a game saved at 10:00, reloaded from JSON and continued matches an uninterrupted game exactly. **All passed.**

## 5. F9 presenter jump

20 seeds: F9 hands the player's slot to the AI until 15:00. 19/20 landed in a playable mid-war state (player alive with 2+ systems, 3+ factions alive).

## 6. Browser test (`tests/browser-test.js`, headless Chromium at 1920×1080)

Title → new game → corporation → home → the tutorial with real pointer clicks and drags (extractors, a line, freighters, food, recruiting) → back to the galaxy → a real drag onto a neighbour opens the order panel with odds → attack → battle → card draft (keyboard) → F9 to 15:00 → a massing warning → the end report. Then `?seed=12345`, `?demo` and `tests/selftest.html`. **21/21 checks passed, zero console errors.** It also writes the screenshots in this folder.

## 7. Self-test

27 rule checks (galaxy constraints over 60 seeds, chains, salaries, odds, protected period, capture, elimination, save/load, a short all-AI game). **All passed**, in Node and in the browser.

## Not tested

- Real touch devices and phone browsers (touch handling is shared with v4's pointer code, but no device was used).
- Firefox and Safari (only headless Chromium).
- Audio output (WebAudio runs, but nobody listened in a test).
- Human playtests of v5: all balance numbers come from AI and scripted players.
- The GitHub Pages deployment itself (the workflow was updated, not run).
