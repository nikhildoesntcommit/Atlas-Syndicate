/* ATLAS SYNDICATE v6 — render/debug.js
   ?aidebug: for every AI faction, its current plan (target, staging system, strength needed vs gathered),
   its stocks and income, and its last ten decisions with their scores. Key D hides/shows it.
   Read-only: it looks at the same state the AI wrote, nothing more. */
(function (AS) {
  'use strict';

  const U = AS.U, S = AS.S, G = AS.G, D = AS.Draw;
  const DBG = AS.Debug = { on: false, cache: null, at: -1 };
  const TS = (ctx, s, x, y, col, align) => D.text(ctx, s, x, y, col, { shadow: false, align });

  DBG.draw = function (ctx, run) {
    if (!DBG.on || !run || run.phase !== 'play') return;
    if (!DBG.cache || G.time - DBG.at > 0.5) { DBG.cache = run.factions.map(f => (f.alive ? S.forecast(run, f) : null)); DBG.at = G.time; }
    const facs = run.factions.filter(f => f.ai);
    if (!facs.length) return;
    const cols = 3, w = Math.floor((G.W - 8) / cols), h = Math.floor((G.mapBottom() - G.HUD_H - 22) / 2);
    facs.forEach((f, i) => {
      const x = 4 + (i % cols) * w, y = G.HUD_H + 18 + Math.floor(i / cols) * h;
      D.dim(ctx, x, y, w - 3, h - 3, 0.82);
      D.frame(ctx, x, y, w - 3, 10, 1, f.col);
      ctx.drawImage(AS.Spr.factionIcon(f.icon, f.alive ? f.col : 4), x + 3, y + 3);
      TS(ctx, (f.id === 0 ? 'YOUR SLOT (AI)' : AS.PERS_NAMES[f.pers]) + '  ' + S.ownCount(run, f.id) + ' SYS  ' + S.soldiers(run, f.id) + ' SOLDIERS' + (f.alive ? '' : '  OUT'), x + 10, y + 3, 31);
      let yy = y + 13;
      const fc = DBG.cache[f.id];
      if (fc) {
        TS(ctx, 'CR ' + Math.round(f.credits) + ' (' + (fc.credits.net >= 0 ? '+' : '') + Math.round(fc.credits.net) + ')  AL ' + Math.round(f.alloy) + ' (+' + U.fmtNum(fc.alloy.in) + ')  FU ' + Math.round(f.fuel) + ' (' + (fc.fuel.net >= 0 ? '+' : '') + Math.round(fc.fuel.net) + ')  FD ' + Math.round(f.food) + ' (' + (fc.food.net >= 0 ? '+' : '') + Math.round(fc.food.net) + ')', x + 3, yy, 13);
        yy += 8;
      }
      const pl = f.ai.plan;
      if (pl) {
        const tgt = run.systems[pl.target], st = run.systems[pl.stage];
        TS(ctx, 'PLAN: ' + (pl.mode === 'raid' ? 'RAID ' : 'ATTACK ') + tgt.name + ' FROM ' + st.name, x + 3, yy, 18); yy += 7;
        const frac = U.clamp(pl.have / Math.max(1, pl.need), 0, 1);
        D.bar(ctx, x + 3, yy, 60, 5, frac, frac >= 1 ? 22 : 13);
        TS(ctx, 'GATHERED ' + pl.have + ' / NEED ' + pl.need + (pl.readyAt ? '  MASSED' : '') + (pl.fuelShort ? '  NO FUEL' : '') + '  ODDS >= ' + Math.round(pl.thr * 100) + '%', x + 66, yy, 7);
        yy += 8;
      } else { TS(ctx, 'PLAN: NONE (BUILDING / DEFENDING)', x + 3, yy, 5); yy += 8; }
      if (run.coalition) { TS(ctx, run.coalition.target === f.id ? 'COALITION TARGET' : 'IN COALITION VS ' + run.factions[run.coalition.target].short, x + 3, yy, 17); yy += 7; }
      TS(ctx, 'LAST DECISIONS (SCORE)', x + 3, yy, 5); yy += 7;
      const log = f.ai.log.slice(-10).reverse();
      for (const e of log) {
        if (yy > y + h - 10) break;
        TS(ctx, U.fmtTime(e.t), x + 3, yy, 4);
        TS(ctx, e.what.slice(0, Math.floor((w - 60) / 4)), x + 23, yy, 7);
        TS(ctx, e.u.toFixed(1), x + w - 6, yy, 12, 'right');
        yy += 7;
      }
    });
    D.text(ctx, 'AI DEBUG (D TO HIDE)', G.W - 6, G.HUD_H + 4, 13, { align: 'right', shadow: true });
  };
})(globalThis.AS = globalThis.AS || {});
