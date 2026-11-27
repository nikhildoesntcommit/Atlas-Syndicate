# Atlas Syndicate Overhaul Analysis

## Scope and evidence

This review covers the current `main` branch at `acdcf77` (v7.1.0), its commit history, the complete runtime structure under `js/`, the canvas UI, configuration, procedural art/audio, and the headless test suite. Assumptions are called out where player telemetry is not available; no external player research is being represented as repository evidence.

## 1. Executive summary

Atlas Syndicate has a capable strategy simulation hidden behind an uninviting first experience. It already has several good foundations: deterministic seeded runs, a coherent resource graph, readable combat arithmetic, procedural audio, touch-capable input, autosave, and a substantial simulation test harness. The planet cross-section is the most distinctive visual and mechanical asset.

The game fails as a game of decisions, however. It asks a new player to operate a galaxy map, a solar-system map, a grid-like excavation view, conveyors, paths, five stocks, workforce starvation, fuel efficiency, a market, a unit shop, events, coalitions, and six personalities before they can feel competent. The opening is work before reward. The time limit and AI pressure turn learning into punishment. Most choices are correct supply-chain chores rather than trade-offs with different tactical identities.

The opportunity is to make the planet the emotional centre: **claim a world, establish one of several viable industrial doctrines, see it visibly come alive, turn that output into a fleet, and make a legible expansion decision.** The galaxy then becomes a consequence of an interesting local engine rather than a second game competing for attention.

## 2. Critical flaw inventory

| Area | Severity | Finding | Why it matters |
|---|---|---|---|
| Gameplay | Blocker | The first meaningful action chain requires drilling, processing, farming, selling, buying, and navigation before the player receives a satisfying payoff. | High cognitive load occurs before mastery or reward. |
| Gameplay | High | Buildings mostly form mandatory linear chains; planet type bonuses are small and do not create a recognisable strategic identity. | The optimal move is usually obvious once understood, so complexity does not create agency. |
| Gameplay | High | The 30-minute global timer and a four-minute protection period produce dead time for skilled players and anxiety for new ones. | Both flow states suffer: waiting is dull; learning under eventual attack is stressful. |
| Gameplay | High | Food starvation removes workers and stops machines, creating a compounding failure spiral early. | A novice error can turn into a non-recoverable session without a clear recovery path. |
| Gameplay | Medium | Combat arithmetic is admirably deterministic but unit purchases are primarily price/per-power choices. | The shop has three labels but weak battlefield roles. |
| UX | Blocker | Important information is distributed across top HUD, scrollable side panel, planet labels, tooltips, bottom toast, modal shop, and tutorial overlay. | Players cannot form a single answer to “what should I do now?” |
| UX | High | Planet interaction depends on several drag gestures that are not discoverable from the world alone. | The core mining loop can fail before it starts, particularly on touchpads and touch screens. |
| UX | High | The side panel can become a long scroll of dense all-caps microcopy. | Critical action is often below the fold; text hierarchy is weak. |
| UX | Medium | Modal shop pauses visual context but not time. | Players are punished while reading an already dense economic interface. |
| Visuals | High | The industrial palette and generated sprites are coherent, but too many labels, borders, meters and tiny glyphs compete at once. | Pixel art becomes noise rather than a visual reward. |
| Visuals | Medium | All-caps text at small pixel sizes is thematically consistent but less scannable than mixed-case UI language. | Accessibility and quick parsing suffer. |
| Technical/mechanics | High | `tests/browser-test.js` is explicitly a v6 scenario and references obsolete systems/terms. | The only end-to-end UI test no longer validates the current game. |
| Technical/mechanics | Medium | State is globally coupled through `AS` and immediate-mode rendering reads simulation state directly. | Fast iteration is easy, but isolated UI/system tests and future content work are risky. |
| Technical/mechanics | Medium | Difficulty primarily changes AI cadence/quality rather than teaching cadence and economic forgiveness. | Difficulty feels like opponents acting faster, not a tailored learning curve. |
| Performance | Low | Canvas is appropriately lightweight; however, repeated `sysFlow` computation is called by several rendering paths each frame. | Fine at current scale, but unnecessary allocation limits scalability. |
| Accessibility | High | There is no keyboard-equivalent action flow for drag-only drilling/conveyors, no reduced-motion control, and palette meaning is often colour-first. | A school-club project should be usable with keyboard, touch, colour-vision variance, and motion sensitivity. |
| Maintainability | Medium | Documentation describes older versions alongside v7 code and the source has large multi-purpose modules. | Future contributors cannot confidently change behaviour or trust docs. |

## 3. Internal mechanics audit

| Mechanic | Intended purpose | Current behaviour | Flaw / risk | Recommended fix |
|---|---|---|---|---|
| Game loop | Expand through industry and conquest | Build chains, buy units, take systems before 30:00 | Local and galaxy loops compete instead of reinforcing a short repeated loop | Organise play into clear contracts: establish, specialise, deploy, claim. |
| State management | Keep browser game simple | One global namespace and mutable `run` state | UI and simulation concerns are coupled | Retain the simple runtime but add pure selectors and a `run.ui`/view-model boundary where new features need it. |
| Scoring/win | Determine galaxy winner | Most systems at a hard timer; eliminations also matter | Victory progress is hard to feel minute to minute | Add visible campaign progress and endgame countdown tied to clear milestones. |
| Progression | Create midgame depth | More systems/buildings/upgrades and hostile AI | No explicit phase goals; content arrives all at once | Gate complexity through a short contract track and unlock contextual actions at first use. |
| Difficulty | Suit different skills | AI thinking speed, target margins, income | New players need forgiveness, not merely weaker rivals | Easy: longer safety, softer upkeep, guided recovery; Hard: stronger reactions/events. |
| RNG | Replayable galaxies | Seeded simulation; unseeded presentation FX/audio | Deterministic simulation tests are good | Preserve seeded mechanics; label visual randomness as cosmetic and avoid it in game-state paths. |
| Collision/pathing | Make drilling tactile | Cell-by-cell valid drill paths and barriers | Input precision is high and path cost is discovered while dragging | Add click-to-preview/autopath and a visible confirmation before spending. |
| Input handling | Mouse/touch play | Pointer gestures, keyboard shortcuts, pinch zoom | Drag-only core actions lack accessible alternate input | Add explicit action mode, click targets, keyboard focus, and input legend. |
| Feedback loops | Explain production and danger | Tooltips, status lights, notifications, toasts | Feedback is plentiful but fragmented and wordy | Build a single “next payoff / next problem” presentation with animated product trails. |
| Balancing | Fair AI and economy | Strong headless checks, fair starts | Tests verify invariants more than player enjoyment / time-to-delight | Add first-five-minute scenario tests and economy pacing thresholds. |
| Save/load | Preserve a live run | Versioned localStorage serialize/deserialize | Version bumps discard older saves; errors are silently ignored | Keep current safety; add a visible save state and migration policy only when schemas actually change. |
| Performance | Run offline on modest hardware | Canvas, baked terrain/backgrounds, fixed timestep | Per-frame flow re-evaluation and all-canvas text may grow expensive | Cache flow once per simulation/render frame and profile before larger content changes. |
| Event handling | Add variety | Timed storms, gold rush, arms surplus, lane collapse, pirates | Events can interrupt comprehension before base loop is learned | Introduce events after first expansion with concise choice cards and explicit counterplay. |
| Asset pipeline | Maintain offline pixel identity | Code-generated sprites/fonts/audio | Fast and portable but art direction lacks a reusable specification | Define a sprite grid, palette roles, animation budget, and UI component rules. |
| Architecture | Keep deployment simple | Classic script order, single namespace, no build step | Easy to start, difficult to refactor safely | Preserve no-build deployment; modularise by pure rules/view-models and document script contracts. |
| Testability | Detect regressions | Excellent deterministic headless tests; stale browser test | UI and onboarding regressions escape | Replace the v6 browser journey with v7 onboarding, accessibility, and resize smoke tests. |
| Maintainability | Support school-club contributors | Comments are often detailed | Version drift and very large files make ownership unclear | Update docs, introduce design tokens/selectors, and give each new system a short contract comment. |

## 4. Fun and engagement analysis

### Why the current build feels less fun than it is

The current design contains systems, not a hierarchy of satisfactions. A player sees all five resources before understanding the first conversion. Drilling is tactically interesting only after learning an input gesture, but its reward arrives on a ten-second cycle and then asks for a separate conveyor action. The market, military, and map expansion are mechanically connected but psychologically remote.

This means the MDA chain is inverted: mechanics are introduced in bulk, dynamics remain opaque, and the intended aesthetics (frontier industry, tension, expansion) do not arrive soon enough. Good strategy games such as *Into the Breach* make state and consequence visible before adding options; *Mini Metro* begins with one clear connection and layers complexity; *Against the Storm* repeatedly frames a short-term objective within longer progression. Atlas should borrow those principles, not their content.

### Target core loop

1. **Read the contract:** a world offers one visible opportunity and one need.
2. **Choose a doctrine:** cash, sustenance, or fuel/force—not all at once.
3. **Place and activate:** one clear action produces an immediate animated result and a near-term payout.
4. **Cash in / deploy:** turn output into a clear expansion or defence choice.
5. **Claim and adapt:** a new world changes what is valuable, creating the next contract.

Meaningful choice comes from opportunity cost: a gold-focused start buys ships sooner but risks crew pressure; a food-focused start grows a resilient workforce and upgrades; a fuel-focused start supports a more mobile fleet. The player should be able to recover through market purchases or a simple emergency policy, not collapse silently.

## 5. UX and visual overhaul plan

### Information architecture

* **Top bar:** only session clock, credits, four compact resource chips, fleet power/fuel, speed/pause. No dense forecasts.
* **Left command deck:** first card is always `NEXT MOVE`, followed by alerts, selected planet/system detail, economy. Contextual build choices temporarily replace `NEXT MOVE` at the top.
* **World:** the planet view owns the screen. Ports, deposits, buildings, and active routes use visual labels; explanatory prose moves to selected-card detail.
* **Bottom:** temporary reward/error toasts only; no persistent third bar.

### Onboarding and feedback

The first session should begin directly on a selected home world with a three-step guided contract: `Mine gold → sell it → choose food or fleet`. The player sees “why” before a control gesture. Add a visible suggested action button and click-to-preview paths, while preserving drag as the expressive expert control.

Every production action needs a small, visible payoff: extraction pulses, product packets travel, stock chips tick, and a compact “+gold / +water / crew fed” toast lands. Warnings must name both the problem and its one best immediate remedy.

### Visual direction

Keep the industrial space-western identity, but apply visual restraint: near-black space, slate panels, one warm gold reward colour, one cool water/food colour, and red reserved for urgent loss. Use texture and silhouette for planets/buildings; do not put texture behind text. Use generous empty sky around the cross-section to make machinery and incoming ports read as a scene.

### Responsive and accessible behaviour

At small widths, resource chips collapse to icon/value; the command deck uses explicit pages rather than an unbounded scroll. Each interactive object must expose a high-contrast selected state and a text/icon status. Add reduced motion and input preference settings. Keyboard actions need an accessible substitute for every build, drill, and route action.

## 6. Pixel art policy

Pixel art is suitable for the world and feedback because the game benefits from instantly legible silhouettes, compact offline assets, and animated industrial motion. It is **not** suitable as a reason to make text tiny or controls ornate. The UI should be clean, panel-based pixel typography only at readable logical sizes, with normal browser accessibility labels retained where possible.

Rules:

1. Use a fixed logical pixel grid; no smoothing, fractional sprite placement, or anti-aliased scaling.
2. World sprites use bold 1–2 colour-value clusters and recognisable silhouettes at 16–32 logical pixels.
3. UI surfaces use flat steel panels, at most one texture treatment per component, and at least 4:1 perceived contrast for essential text.
4. Palette roles are semantic: gold = value/reward, cyan = water/food/healthy, orange = fuel/action, red = danger only, neutral steel = inactive.
5. Animation budget: idle 2–4 frames or procedural pulses; production/impact 6–10 frames maximum. Motion communicates state, never decoration alone.
6. All statuses combine colour with icon/shape/text. A clean flat/vector-like information diagram is preferred for build chains, market math, and combat previews where pixel texture would obscure relationships.

## 7. Redesigned game

### Core systems

* **World contracts:** each owned system presents a short, contextual objective and reward; contracts teach one system at a time.
* **Industrial doctrines:** the first planetary commitment gives a modest but meaningful temporary specialisation bonus. Later worlds broaden the engine.
* **Soft failure:** low food reduces output and triggers an actionable emergency purchase/recovery route before workers die; only sustained neglect causes loss.
* **Fleet roles:** ships are flexible scouts/claim escorts, destroyers are efficient line power, cannons are stationary defensive power. Their power arithmetic stays deterministic and visible.
* **Expansion rhythm:** a clear `ready to claim` state occurs after each local engine milestone. Every capture offers a distinct planet/resource opportunity.

### Difficulty curve

* **0–3 min:** protected, two production contracts, one satisfying purchase, no surprise events.
* **3–10 min:** first expansion, first enemy border, optional pathways, one event with a clear counterplay.
* **10–22 min:** competing specialisations, defensive trade-offs, coalitions only after the player has fielded a viable economy.
* **22–35 min:** clear endgame race around capitals and system count.

### Juice

Use small high-frequency confirmations: powered machinery glows, product packets move along routes, stock increases pop from the relevant building, purchase builds materialise with a short construction animation, and a battle preview shows power subtraction before launch. Keep combat without dice; certainty is a selling point.

## 8. Prioritized implementation roadmap

| Order | Increment | Impact | Effort | Validation |
|---|---|---:|---:|---|
| 0 | Record this audit and living plan | High | Low | Docs committed/pushed |
| 1 | Add a canonical `next move` selector/card and concise alerts | Very high | Medium | Selector tests; manual first-minute run |
| 2 | Replace starvation cliff with staged shortage/recovery messaging | Very high | Medium | Economy/self-test cases |
| 3 | Rebuild onboarding around the contract loop and direct action language | Very high | Medium | New browser journey; tutorial state tests |
| 4 | Make planet operations discoverable with action modes/click-to-preview | High | High | Input unit/smoke tests |
| 5 | Give systems/buildings clearer visual production feedback and panel hierarchy | High | Medium | Screenshot/manual responsive checks |
| 6 | Redesign military/shop into visible role and deterministic-outcome cards | High | Medium | Combat tests; manual flow |
| 7 | Tune early pacing, difficulty forgiveness, and event timing | High | Medium | Deterministic five-minute simulations |
| 8 | Replace stale v6 browser test and update documentation | Medium | Medium | Playwright when installed; headless tests |
| 9 | Add reduced motion, contrast/state redundancy, keyboard alternatives | High | High | Keyboard/responsive manual matrix |
| 10 | Profile/cached flow selectors and finish visual polish | Medium | Medium | Frame-time profiling; full test suite |

## 9. Acceptance criteria

The overhaul is accepted when:

1. A new player can complete their first economic loop and buy their first fleet power within three minutes without reading a long help screen.
2. At every normal game state, the command deck presents one concise, actionable next move or explicitly says the player is free to choose.
3. No essential action relies exclusively on a hidden drag gesture or colour alone.
4. A food/fuel shortfall warns early, names its consequence, and offers a recoverable response before irreversible loss.
5. The planet view is visibly the primary play surface, with animated production, legible ports/routes, and minimal competing UI.
6. Combat previews show exact deterministic consequence (attacker, defender, survivor power, fuel modifier) before commitment.
7. Easy/Normal/Hard differ in learning and strategic pressure, while all remain deterministic and fair for a seed.
8. Headless simulation, save/replay, fuzz, and a current UI onboarding smoke test pass; no old-version test remains presented as current coverage.
9. The game remains fully offline, responsive from 400px logical width upward, and project documentation reflects the shipped systems.
