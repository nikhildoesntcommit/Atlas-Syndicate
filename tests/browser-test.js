#!/usr/bin/env node
/* ATLAS SYNDICATE v5 — browser test (development only; the game itself has no dependencies).
   Needs Playwright:  npm i -D playwright  &&  npx playwright install chromium
   Usage: node tests/browser-test.js [--shots docs] [--video out.webm]
   Loads index.html headless at 1920x1080 and plays: title -> new game -> corporation -> home ->
   the tutorial with real pointer drags -> an attack with odds -> a battle -> a card draft -> F9 ->
   the end report. Then checks ?demo and ?seed=. Fails on any console error. */
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { try { pw = require('playwright-core'); } catch (e2) { console.log('Playwright is not installed: npm i -D playwright'); process.exit(2); } }

const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SHOTS = opt('shots', null), VIDEO = opt('video', null), EXE = opt('exe', process.env.CHROME || undefined);
const results = [];
let failed = false;
const check = (name, ok, info) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) failed = true; };

(async () => {
  const browser = await pw.chromium.launch(EXE ? { executablePath: EXE } : {});
  const errors = [];
  const newPage = async (ctxOpts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1920, height: 1080 } }, ctxOpts || {}));
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    return p;
  };
  const shot = async (p, name) => { await p.mouse.move(5, 1075); await p.waitForTimeout(60); if (SHOTS) { fs.mkdirSync(path.resolve(SHOTS), { recursive: true }); await p.screenshot({ path: path.resolve(SHOTS, name + '.png') }); } };
  /** game pixel -> page pixel */
  const toPage = (p, x, y) => p.evaluate(([x, y]) => { const r = AS.G.canvas.getBoundingClientRect(); return { x: r.left + x * r.width / AS.G.W, y: r.top + y * r.height / AS.G.H }; }, [x, y]);
  const click = async (p, x, y) => { const q = await toPage(p, x, y); await p.mouse.click(q.x, q.y); await p.waitForTimeout(120); };
  const drag = async (p, a, b) => {
    const qa = await toPage(p, a.x, a.y), qb = await toPage(p, b.x, b.y);
    await p.mouse.move(qa.x, qa.y); await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(qa.x + (qb.x - qa.x) * i / 8, qa.y + (qb.y - qa.y) * i / 8); await p.waitForTimeout(20); }
    await p.mouse.up(); await p.waitForTimeout(150);
  };
  const button = async (p, label) => {
    const b = await p.evaluate(l => { const b = AS.G.btns.find(x => x.label && x.label.indexOf(l) === 0); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; }, label);
    if (!b) return false;
    await click(p, b.x, b.y);
    return true;
  };
  const node = (p, idx) => p.evaluate(i => { const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.SysView.layout(r, s, AS.G.time); const n = L.node(i); return { x: n.x, y: n.y }; }, idx);
  const sysPos = (p, id) => p.evaluate(i => { const s = AS.G.run.systems[i]; const q = AS.G.toScreen(s.x, s.y); return { x: q.x, y: q.y }; }, id);

  /* ---------- 1. a full game in the browser ---------- */
  const p = await newPage();
  await p.goto(URL);
  await p.waitForTimeout(1500);
  check('title screen', await p.evaluate(() => AS.G.mode === 'menu' && AS.G.screen === 'title'));
  await shot(p, 'title');
  await button(p, 'NEW GAME');
  check('new game screen', await p.evaluate(() => AS.G.screen === 'newgame'));
  await p.evaluate(() => { AS.G.screenData.seed = 4207; });
  await p.keyboard.press('2');
  await p.waitForTimeout(600);
  check('corporation draft', await p.evaluate(() => AS.G.screen === 'corp'));
  await shot(p, 'corporation');
  await p.keyboard.press('1');
  await p.waitForTimeout(300);
  const home = await p.evaluate(() => AS.S.homeCandidates(AS.G.run)[2]);
  await p.evaluate(() => AS.G.fitView(AS.G.run));
  await p.waitForTimeout(300);
  const hp = await sysPos(p, home);
  await click(p, hp.x, hp.y);
  check('home chosen, game started', await p.evaluate(() => AS.G.run.phase === 'play' && AS.Tutorial.active()));
  await p.evaluate(() => AS.G.fitView(AS.G.run));
  await p.waitForTimeout(900);
  await shot(p, 'galaxy-start');
  // tutorial with real input
  await p.evaluate(() => { const h = AS.G.run.systems[AS.G.run.factions[0].capital]; AS.G.focusOn(h.x, h.y, 2); AS.G.snapCam(); });
  await p.waitForTimeout(200);
  const h2 = await sysPos(p, home);
  await click(p, h2.x, h2.y);
  check('tutorial 1: opened home system', await p.evaluate(() => AS.G.view === 'system'));
  const pl = await p.evaluate(() => { const s = AS.G.run.systems[AS.G.sysId]; const f = t => { let b = -1; s.planets.forEach((p, i) => { if (p.type === t && (b < 0 || p.rich > s.planets[b].rich)) b = i; }); return b; }; return { ore: f('ore'), energy: f('energy'), food: f('food') }; });
  await click(p, ...Object.values(await node(p, pl.ore)));
  await click(p, ...Object.values(await node(p, pl.energy)));
  await drag(p, await node(p, -1), await node(p, pl.ore));
  await drag(p, await node(p, pl.ore), await node(p, pl.energy));
  check('tutorial 2-5: extractors and a line, chain pays', await p.evaluate(() => AS.S.sysYield(AS.G.run, AS.G.run.systems[AS.G.sysId]).pairs > 0));
  // freighter on the line: click the line, press +
  const mid = await p.evaluate(() => { const r = AS.G.run, s = r.systems[AS.G.sysId], L = AS.SysView.layout(r, s, AS.G.time), l = s.lines[0]; const a = L.node(l.stops[0]), b = L.node(l.stops[1]); return { x: (a.x + b.x) / 2 - 1, y: (a.y + b.y) / 2 - 1 }; });
  await click(p, mid.x, mid.y);
  if (await p.evaluate(() => AS.G.sel && AS.G.sel.line !== undefined)) await button(p, '+');
  await click(p, ...Object.values(await node(p, pl.food)));
  await drag(p, await node(p, -1), await node(p, pl.food));
  await button(p, 'RECRUIT');
  await p.waitForTimeout(1200);
  check('tutorial: food linked and soldiers training', await p.evaluate(() => { const s = AS.G.run.systems[AS.G.sysId]; return s.train.q > 0 || AS.S.soldiers(AS.G.run, 0) > 12; }));
  await p.evaluate(() => { AS.G.run.cycleT = 9.6; });
  await p.waitForTimeout(800);
  await shot(p, 'system-view');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  check('back to the galaxy', await p.evaluate(() => AS.G.view === 'galaxy'));
  // jump past the protected period and attack a neighbour with a real drag
  await p.evaluate(() => { const r = AS.G.run; AS.Tutorial.skip(); r.t = 250; r.nextCard = 400; r.factions[0].credits = 2000; const h = r.systems[r.factions[0].capital]; h.gar.n = 60; AS.G.focusOn(h.x, h.y, 2); AS.G.snapCam(); });
  await p.waitForTimeout(300);
  const tgt = await p.evaluate(() => { const r = AS.G.run, h = r.factions[0].capital; return AS.S.neighbours(r, h).find(n => r.systems[n].owner !== 0); });
  await drag(p, await sysPos(p, home), await sysPos(p, tgt));
  check('order panel with odds after a drag', await p.evaluate(() => !!AS.G.order));
  await shot(p, 'attack-odds');
  await button(p, 'ATTACK');
  check('attack launched', await p.evaluate(() => AS.G.run.armies.some(a => a.owner === 0 && a.mode === 'attack')));
  await p.waitForFunction(() => AS.G.run.battles.some(b => b.att.owner === 0) || AS.G.run.systems.some(s => s.owner === 0 && s.lastCaptured > 0), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => { const b = AS.G.run.battles[0]; if (b) { const s = AS.G.run.systems[b.sys]; AS.G.focusOn(s.x + 20, s.y, 2); AS.G.snapCam(); } });
  await p.waitForTimeout(1700);
  check('a battle happened', await p.evaluate(() => AS.G.run.battleLog.length > 0 || AS.G.run.battles.length > 0));
  await shot(p, 'battle');
  // card draft
  await p.evaluate(() => { AS.G.run.nextCard = AS.G.run.t + 0.5; });
  await p.waitForFunction(() => AS.G.screen === 'draft', null, { timeout: 10000 }).catch(() => {});
  check('card draft opened', await p.evaluate(() => AS.G.screen === 'draft'));
  await p.waitForTimeout(700);
  await shot(p, 'card-draft');
  await p.keyboard.press('2');
  await p.waitForTimeout(300);
  check('card picked', await p.evaluate(() => AS.G.run.factions[0].cards.length >= 1 && AS.G.screen !== 'draft'));
  // F9 presenter jump
  await p.keyboard.press('F9');
  await p.waitForFunction(() => !AS.G.ff && AS.G.run.t >= 899, null, { timeout: 60000 }).catch(() => {});
  check('F9 jumps to 15:00', await p.evaluate(() => AS.G.run.t >= 899 && !AS.G.run.over), await p.evaluate(() => 't=' + Math.round(AS.G.run.t)));
  await p.evaluate(() => { while (AS.G.screen === 'draft') AS.Act.pickCard(AS.G.run.factions[0].drafts[0].offers[0]); AS.G.fitView(AS.G.run); AS.G.sel = null; });
  await p.waitForTimeout(1200);
  await shot(p, 'mid-war');
  // a rival massing on our border, with its warning
  const warned = await p.evaluate(() => {
    const r = AS.G.run;
    for (const s of r.systems) if (s.owner > 0 && AS.S.neighbours(r, s.id).some(n => r.systems[n].owner === 0)) {
      const tgt = AS.S.neighbours(r, s.id).find(n => r.systems[n].owner === 0);
      s.gar.n = Math.max(s.gar.n, Math.round(AS.S.defStrength(r, r.systems[tgt]) * 1.4) + 10);
      AS.G.focusOn((s.x + r.systems[tgt].x) / 2, (s.y + r.systems[tgt].y) / 2, 2); AS.G.snapCam();
      return true;
    }
    return false;
  });
  await p.waitForFunction(() => AS.G.run.warnings.some(w => w.kind === 'mass'), null, { timeout: 8000 }).catch(() => {});
  check('massing warning shown', warned && await p.evaluate(() => AS.G.run.warnings.some(w => w.kind === 'mass')));
  await p.waitForTimeout(400);
  await shot(p, 'massing-warning');
  // end of game
  await p.evaluate(() => { const r = AS.G.run; while (r.factions[0].drafts.length) AS.Act.pickCard(r.factions[0].drafts[0].offers[0]); r.t = 1799.5; r.nextCard = 99999; AS.G.paused = false; AS.Screens.close(); });
  await p.waitForFunction(() => AS.G.screen === 'report', null, { timeout: 15000 }).catch(() => {});
  check('end report', await p.evaluate(() => AS.G.screen === 'report'));
  await p.waitForTimeout(800);
  await shot(p, 'end-report');
  check('no console errors in the full game', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* ---------- 2. ?seed= and ?demo ---------- */
  const e0 = errors.length;
  const p2 = await newPage();
  await p2.goto(URL + '?seed=12345');
  await p2.waitForTimeout(1200);
  check('?seed=12345 opens that galaxy', await p2.evaluate(() => AS.G.run && AS.G.run.seed === 12345 && AS.G.screen === 'corp'));
  const p3 = await newPage(VIDEO ? { recordVideo: { dir: path.dirname(path.resolve(VIDEO)), size: { width: 1920, height: 1080 } } } : {});
  await p3.goto(URL + '?demo&from=420');
  await p3.waitForTimeout(VIDEO ? 20000 : 6000);
  check('?demo runs with the AI playing', await p3.evaluate(() => AS.G.mode === 'attract' && AS.G.demo.t > 425));
  await shot(p3, 'demo');
  if (VIDEO) { const v = p3.video(); await p3.context().close(); const vp = await v.path(); fs.renameSync(vp, path.resolve(VIDEO)); }
  check('no console errors in ?seed and ?demo', errors.length === e0, errors.slice(e0, e0 + 3).join(' | '));
  const p4 = await newPage();
  await p4.goto('file://' + path.join(ROOT, 'tests', 'selftest.html'));
  await p4.waitForTimeout(6000);
  check('in-browser self-test passes', await p4.evaluate(() => document.getElementById('out').className === 'pass'));

  await browser.close();
  for (const r of results) console.log('  ' + r);
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
