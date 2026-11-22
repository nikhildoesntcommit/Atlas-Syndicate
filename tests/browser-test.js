#!/usr/bin/env node
/* ATLAS SYNDICATE v6 — browser test (development only; the game itself has no dependencies).
   Needs Playwright:  npm i -D playwright  &&  npx playwright install chromium
   Usage: node tests/browser-test.js [--size 1366x768] [--shots docs] [--exe /path/to/chrome]
   Headless, at the given size. Plays the whole tutorial with real pointer clicks and drags: open the
   system and the home planet, place a mine, DRAG a drill down to the metal deposit, place a smelter,
   DRAG a conveyor, wait for alloy, the same for gold, DRAG a pathway to the ice planet, an ice drill
   whose conveyor goes to the PORT, a water plant on the other planet fed from its port, recruit.
   Then a battle, the upgrade shop, F9, a coalition, the end report; then ?demo, ?aidebug, ?seed=.
   Fails on any console error. */
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { try { pw = require('playwright-core'); } catch (e2) { console.log('Playwright is not installed: npm i -D playwright'); process.exit(2); } }

const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [VW, VH] = String(opt('size', '1366x768')).split('x').map(Number);
const SHOTS = opt('shots', null), EXE = opt('exe', process.env.CHROME || undefined);
const results = [];
let failed = false;
const check = (name, ok, info) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) failed = true; };

(async () => {
  const browser = await pw.chromium.launch(EXE ? { executablePath: EXE } : {});
  const errors = [];
  const newPage = async () => {
    const p = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    return p;
  };
  const shot = async (p, name) => { if (!SHOTS) return; await p.mouse.move(2, VH - 2); await p.waitForTimeout(80); fs.mkdirSync(path.resolve(SHOTS), { recursive: true }); await p.screenshot({ path: path.resolve(SHOTS, name + '.png') }); };
  const toPage = (p, x, y) => p.evaluate(([x, y]) => { const r = AS.G.canvas.getBoundingClientRect(); return { x: r.left + x * r.width / AS.G.W, y: r.top + y * r.height / AS.G.H }; }, [x, y]);
  const click = async (p, x, y) => { const q = await toPage(p, x, y); await p.mouse.click(q.x, q.y); await p.waitForTimeout(150); };
  /** A real drag through a list of game-pixel points (like a hand tracing a drill path). */
  const dragPts = async (p, pts) => {
    const q0 = await toPage(p, pts[0][0], pts[0][1]);
    await p.mouse.move(q0.x, q0.y); await p.mouse.down();
    for (let i = 1; i < pts.length; i++) { const q = await toPage(p, pts[i][0], pts[i][1]); await p.mouse.move(q.x, q.y, { steps: 2 }); }
    await p.mouse.up(); await p.waitForTimeout(200);
  };
  const button = async (p, label) => {
    const b = await p.evaluate(l => { const b = AS.G.btns.find(x => x.label === l) || AS.G.btns.find(x => x.label && x.label.indexOf(l) === 0); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; }, label);
    if (!b) return false;
    await click(p, b.x, b.y);
    return true;
  };
  const H = 'AS.G.run.systems[AS.G.run.factions[0].capital]';
  const sysPos = (p, id) => p.evaluate(i => { const s = AS.G.run.systems[i]; const q = AS.G.toScreen(s.x, s.y); return { x: q.x, y: q.y }; }, id);
  const planetPos = (p, pi) => p.evaluate(([pi]) => { const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.SysView.layout(r, s); const n = L.nodes[pi]; return [n.x, n.y]; }, [pi]);
  const freeSlotPt = p => p.evaluate(() => { const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.PlanetView.layout(r, s, AS.G.planet); const used = new Set(L.p.blds.map(b => b.slot)); const sl = L.slots.find(x => !used.has(x.i)); return sl ? [sl.cx, L.surfaceY - 8] : null; });
  const bldPt = (p, kind) => p.evaluate(k => { const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.PlanetView.layout(r, s, AS.G.planet); const b = L.p.blds.find(x => x.kind === k); if (!b) return null; const c = AS.PlanetView.bldCenter(L, b); return [c.x, c.y]; }, kind);
  /** Cell-by-cell drill trace: the cheapest route a careful player would draw around barriers. */
  const drillPts = (p, kind, res) => p.evaluate(([k, res]) => {
    const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.PlanetView.layout(r, s, AS.G.planet), f = r.factions[0];
    const b = L.p.blds.find(x => x.kind === k), dep = L.p.deposits.filter(d => d.res === res).sort((a, c) => a.depth - c.depth)[0];
    const dr = AS.S.bestDrill(r, f, L.p, b.slot, dep), c0 = AS.PlanetView.bldCenter(L, b);
    return [[c0.x, c0.y]].concat(dr.path.map(i => { const [x, y] = AS.PlanetView.cellRect(L, i); return [x + L.cs / 2, y + L.cs / 2]; }));
  }, [kind, res]);
  const portPt = p => p.evaluate(() => { const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.PlanetView.layout(r, s, AS.G.planet); const pt = L.ports[0]; return pt ? [pt.x + pt.w / 2, pt.y + pt.h / 2] : null; });
  const step = p => p.evaluate(() => AS.Tutorial.stepIndex());
  const toView = async (p, v) => { for (let i = 0; i < 4 && await p.evaluate(x => AS.G.view !== x, v); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); } };
  const build = async (p, name) => {
    // like a player: wait until it is affordable, then click the slot and the building
    await p.waitForFunction(n => { const k = Object.keys(AS.BLD).find(x => AS.BLD[x].name === n); return AS.S.canPay(AS.G.run.factions[0], AS.BLD[k].cost); }, name, { timeout: 30000 }).catch(() => {});
    const sp = await freeSlotPt(p); await click(p, sp[0], sp[1]); return button(p, name);
  };

  /* ---------- 1. the full tutorial with real input ---------- */
  const p = await newPage();
  await p.goto(URL);
  await p.waitForTimeout(1500);
  check('title screen at ' + VW + 'x' + VH, await p.evaluate(() => AS.G.mode === 'menu' && AS.G.screen === 'title'));
  await shot(p, 'title');
  await button(p, 'NEW GAME');
  await p.evaluate(() => { AS.G.screenData.seed = 4207; });
  await p.keyboard.press('2');
  await p.waitForTimeout(500);
  await p.evaluate(() => AS.G.fitView(AS.G.run));
  await p.waitForTimeout(200);
  const home = await p.evaluate(() => AS.S.homeCandidates(AS.G.run)[2]);
  const hp = await sysPos(p, home);
  await click(p, hp.x, hp.y);
  check('home chosen, tutorial running', await p.evaluate(() => AS.G.run.phase === 'play' && AS.Tutorial.active()));
  await p.evaluate(() => AS.G.fitView(AS.G.run)); await p.waitForTimeout(700);
  await shot(p, 'galaxy-start');
  await p.evaluate(h => { const s = AS.G.run.systems[h]; AS.G.focusOn(s.x, s.y, 2); AS.G.snapCam(); }, home);
  const hp2 = await sysPos(p, home);
  await click(p, hp2.x, hp2.y);
  check('tutorial 1: system opened by click', await p.evaluate(() => AS.G.view === 'system') && await step(p) >= 1);
  const pp0 = await planetPos(p, 0);
  await click(p, pp0[0], pp0[1]);
  check('tutorial 2: home planet opened by click', await p.evaluate(() => AS.G.view === 'planet' && AS.G.planet === 0) && await step(p) >= 2);
  await shot(p, 'planet-empty');
  check('tutorial 3: mine placed from the build menu', await build(p, 'MINE') && await step(p) >= 3);
  const dp = await drillPts(p, 'mine', 'metal');
  await dragPts(p, dp);
  check('tutorial 4: drill dragged down to the metal deposit', await p.evaluate(h => { const s = AS.G.run.systems[h]; return !!s.planets[0].blds.find(b => b.kind === 'mine').drill; }, home) && await step(p) >= 4);
  const sm = await build(p, 'SMELTER');
  check('tutorial 5: smelter placed', sm && await step(p) >= 5);
  await dragPts(p, [await bldPt(p, 'mine'), await bldPt(p, 'smelter')]);
  check('tutorial 6: conveyor dragged from mine to smelter', await step(p) >= 6);
  await p.keyboard.press('3');
  await p.waitForFunction(() => AS.G.run.factions[0].stats.alloyMade > 0, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400);
  check('tutorial 7: alloy arrives', await step(p) >= 7);
  const gm = await build(p, 'GOLD MINE');
  await dragPts(p, await drillPts(p, 'goldmine', 'gold'));
  await build(p, 'MINT');
  await dragPts(p, [await bldPt(p, 'goldmine'), await bldPt(p, 'mint')]);
  await p.waitForTimeout(300);
  check('tutorial 8: gold chain built by drags, minting credits', await step(p) >= 8, 'step ' + await step(p));
  await toView(p, 'system');
  await dragPts(p, [await planetPos(p, 0), await planetPos(p, 1)]);
  check('tutorial 9: pathway dragged between two planets', await p.evaluate(h => AS.G.run.systems[h].pathways.length === 1, home) && await step(p) >= 9);
  const pp0b = await planetPos(p, 0);
  await click(p, pp0b[0], pp0b[1]);
  await build(p, 'ICE DRILL');
  await dragPts(p, await drillPts(p, 'icedrill', 'ice'));
  await dragPts(p, [await bldPt(p, 'icedrill'), await portPt(p)]);
  check('ice drill conveyor dragged into the port', await p.evaluate(h => { const b = AS.G.run.systems[h].planets[0].blds.find(x => x.kind === 'icedrill'); return !!(b && b.out && b.out.p !== undefined); }, home));
  await toView(p, 'system');
  const pp1 = await planetPos(p, 1);
  await click(p, pp1[0], pp1[1]);
  await build(p, 'WATER PLANT');
  await dragPts(p, [await portPt(p), await bldPt(p, 'water')]);
  await p.waitForTimeout(400);
  check('tutorial 10: ice routed through the ports to a water plant', await step(p) >= 10, 'step ' + await step(p));
  await p.evaluate(() => { AS.G.run.cycleT = 9.7; });
  await p.waitForTimeout(700);
  await shot(p, 'ports-arriving');
  await toView(p, 'system');
  const pp0c = await planetPos(p, 0);
  await click(p, pp0c[0], pp0c[1]);
  await p.waitForTimeout(500);
  await shot(p, 'ports-leaving');
  await shot(p, 'planet-view');
  await toView(p, 'system');
  await button(p, 'RECRUIT');
  check('tutorial 11: soldiers recruited', await step(p) >= 11, 'step ' + await step(p));
  await toView(p, 'galaxy');
  await p.waitForFunction(() => !AS.Tutorial.active(), null, { timeout: 15000 }).catch(() => {});
  check('tutorial completed end to end', await p.evaluate(() => !AS.Tutorial.active() && AS.Store.get('tutorialDone', false)));
  check('no console errors during the tutorial', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* ---------- 2. a battle, the shop, F9, a coalition, the end ---------- */
  await p.keyboard.press('1');
  await p.evaluate(() => { const r = AS.G.run; r.t = Math.max(r.t, 250); const f = r.factions[0]; f.credits += 2500; f.alloy += 300; f.fuel += 200; const h = r.systems[f.capital]; h.gar.n = 60; AS.G.focusOn(h.x, h.y, 2); AS.G.snapCam(); AS.G.view = 'galaxy'; });
  await p.waitForTimeout(300);
  const tgt = await p.evaluate(() => { const r = AS.G.run, h = r.factions[0].capital; return AS.S.neighbours(r, h).find(n => r.systems[n].owner !== 0); });
  await dragPts(p, [[(await sysPos(p, home)).x, (await sysPos(p, home)).y], [(await sysPos(p, tgt)).x, (await sysPos(p, tgt)).y]]);
  check('order panel with odds and fuel after a drag', await p.evaluate(() => !!AS.G.order));
  await shot(p, 'attack-odds');
  await button(p, 'ATTACK');
  check('attack launched (fuel spent)', await p.evaluate(() => AS.G.run.armies.some(a => a.owner === 0 && a.mode === 'attack')));
  await p.waitForFunction(() => AS.G.run.battles.some(b => b.att.owner === 0), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => { const b = AS.G.run.battles.find(x => x.att.owner === 0) || AS.G.run.battles[0]; if (b) { const s = AS.G.run.systems[b.sys]; AS.G.focusOn(s.x + 20, s.y, 2); AS.G.snapCam(); } });
  await p.waitForTimeout(1700);
  check('a battle happened', await p.evaluate(() => AS.G.run.battleLog.length > 0 || AS.G.run.battles.length > 0));
  await shot(p, 'battle');
  await p.keyboard.press('u'); await p.waitForTimeout(300);
  check('upgrade shop opens', await p.evaluate(() => AS.G.screen === 'shop'));
  await button(p, 'upg:ext');
  check('an upgrade bought by click', await p.evaluate(() => AS.G.run.factions[0].up.ext === 1));
  await shot(p, 'shop');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.keyboard.press('F9');
  await p.waitForFunction(() => !AS.G.ff && AS.G.run.t >= 899, null, { timeout: 90000 }).catch(() => {});
  check('F9 jumps to 15:00', await p.evaluate(() => AS.G.run.t >= 899 && !AS.G.run.over), await p.evaluate(() => 't=' + Math.round(AS.G.run.t)));
  await p.evaluate(() => { AS.G.fitView(AS.G.run); AS.G.sel = null; });
  await p.waitForTimeout(1000);
  await shot(p, 'mid-war');
  // a coalition with a strike in progress: let the AI play on until one happens (same rules, no setup)
  const co = await p.evaluate(() => {
    const r = AS.G.run, f = r.factions[0];
    const was = f.ai; if (!was) { AS.S.AI.init(r, f); f.ai.borrowed = true; }
    const t0 = Date.now();
    while (!r.over && r.t < 1780 && Date.now() - t0 < 90000) {
      AS.S.step(r, 0.1); r.fx.length = 0;
      if (r.coalition && r.battles.some(b => r.systems[b.sys].owner === r.coalition.target && b.att.owner !== r.coalition.target)) break;
    }
    if (f.ai && f.ai.borrowed) f.ai = null;
    const b = r.coalition && r.battles.find(x => r.systems[x.sys].owner === r.coalition.target);
    if (b) { const s = r.systems[b.sys]; AS.G.focusOn(s.x, s.y, 2); AS.G.snapCam(); }
    return { found: !!b, t: Math.round(r.t) };
  });
  await p.waitForTimeout(900);
  check('a coalition strike on the leader happens in play', co.found, 't=' + co.t);
  await shot(p, 'coalition');
  await p.evaluate(() => { const r = AS.G.run; r.t = Math.max(r.t, 1799.5); AS.G.paused = false; AS.Screens.close(); });
  await p.waitForFunction(() => AS.G.screen === 'report', null, { timeout: 15000 }).catch(() => {});
  check('end report', await p.evaluate(() => AS.G.screen === 'report'));
  await p.waitForTimeout(700);
  await shot(p, 'end-report');
  check('no console errors in the full game', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* ---------- 3. ?demo, ?aidebug, ?seed= ---------- */
  const e0 = errors.length;
  const d = await newPage();
  await d.goto(URL + '?demo');
  await d.waitForTimeout(400);
  const demo0 = await d.evaluate(() => ({ battles: AS.G.demo.battles.length, view: AS.G.view }));
  let sawPlanet = false;
  for (let i = 0; i < 24 && !sawPlanet; i++) { await d.waitForTimeout(1000); sawPlanet = await d.evaluate(() => AS.G.view === 'planet'); if (i === 3) await shot(d, 'demo-battle'); }
  check('?demo opens in the galaxy on a battle', demo0.view === 'galaxy' && demo0.battles > 0, JSON.stringify(demo0));
  check('?demo cuts into a busy planet view within 25 s', sawPlanet);
  await shot(d, 'demo-planet');
  const a = await newPage();
  await a.goto(URL + '?aidebug&demo');
  await a.waitForTimeout(4000);
  check('?aidebug shows the debug overlay', await a.evaluate(() => AS.Debug.on && AS.G.demo.factions.some(f => f.ai && f.ai.log.length > 0)));
  await shot(a, 'ai-debug');
  const s = await newPage();
  await s.goto(URL + '?seed=12345');
  await s.waitForTimeout(1000);
  check('?seed=12345 opens that galaxy', await s.evaluate(() => AS.G.run && AS.G.run.seed === 12345 && AS.G.run.phase === 'home'));
  check('no console errors in ?demo, ?aidebug, ?seed', errors.length === e0, errors.slice(e0, e0 + 3).join(' | '));
  const t = await newPage();
  await t.goto('file://' + path.join(ROOT, 'tests', 'selftest.html'));
  await t.waitForTimeout(8000);
  check('in-browser self-test passes', await t.evaluate(() => document.getElementById('out').className === 'pass'));

  await browser.close();
  for (const r of results) console.log('  ' + r);
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
