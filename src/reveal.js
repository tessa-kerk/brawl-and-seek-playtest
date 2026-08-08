/* Brawl & Seek — the end-of-round reveal. The map opens up and shows where every
 * hider spent the round: a SPOTTED! chip over each find, a survived chip over
 * each escape, with survival times. This screen is the share moment — every
 * round ends by generating its own advert. */
(function () {
  const P = CFG.palette;
  let panelShown = false;

  // A stamp state (SPOTTED! / TAGGED OUT!) holds before the reveal map.
  const delay = () => (Round.result && (Round.result.reason === 'spotted' || Round.result.reason === 'tagged-out') ? 1.5 : 0.6);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---- the map (world space, over a dimmed arena) ------------------------
  function draw(ctx, t) {
    const res = Round.result; if (!res) return;
    ctx.save();
    ctx.fillStyle = 'rgba(23,27,51,.66)'; ctx.fillRect(0, 0, Arena.W, Arena.H);

    for (const row of res.rows) {
      const r = CFG.playerRadius * Arena.T;
      // Presentation-only clamp: keep the complete token, chip, name and
      // survival line inboard without mutating the scored world position.
      const padX = r * 1.35, padTop = r * 2.35, padBottom = r * 1.9;
      const x = Math.max(padX, Math.min(Arena.W - padX, row.x));
      const y = Math.max(padTop, Math.min(Arena.H - padBottom, row.y));
      // a muted token of the brawler where they hid
      ctx.globalAlpha = 0.9;
      Render.drawNormal(ctx, x, y, r * 0.78, 1, row.col);
      ctx.globalAlpha = 1;

      // the chip: SPOTTED! (magenta) or SURVIVED (teal), tilted like the stamp
      const found = row.found;
      const label = found ? 'SPOTTED!' : 'SAFE';
      ctx.save();
      ctx.translate(x, y - r * 1.9);
      ctx.rotate((-8 * Math.PI) / 180);
      const fs = 15;
      ctx.font = `${fs}px 'Lilita One', sans-serif`;
      const tw = ctx.measureText(label).width, bw = tw + 14, bh = fs * 1.45;
      Arena.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 5);
      ctx.fillStyle = found ? P.magenta : P.teal; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = P.ink; ctx.stroke();
      ctx.fillStyle = found ? P.yellow : P.ink;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1);
      ctx.restore();

      // name + survival time beneath
      ctx.font = `12px 'Lilita One', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = row.isPlayer ? P.yellow : P.chalk;
      ctx.fillText(row.name, x, y + r * 1.25);
      ctx.font = `11px 'Nunito Sans', sans-serif`;
      ctx.fillStyle = 'rgba(246,244,239,.72)';
      ctx.fillText(fmt(row.survived), x, y + r * 1.25 + 14);
    }
    ctx.restore();
  }

  // ---- the summary panel (DOM, crisp text) ------------------------------
  function showPanel() {
    if (panelShown) return; panelShown = true;
    const res = Round.result, el = document.getElementById('endpanel');
    const title = document.getElementById('end-title');
    const sub = document.getElementById('end-sub');
    const board = document.getElementById('end-board');

    // One title + sub-line per end state (Concept Brief v3.4 — four ways to end).
    const TITLES = {
      spotted:    ['SPOTTED!', 'spotted', 'The seeker found you.'],
      'all-found':['ALL FOUND', 'spotted', 'The seekers cleared the map.'],
      timeout:    ['YOU SURVIVED', 'safe', 'You outlasted the clock — hiders win.'],
      'tagged-out':['TAGGED OUT!', 'safe', 'The seekers spent their tags — hiders win.'],
    };
    const [ttl, cls, tail] = TITLES[res.reason] || TITLES.timeout;
    title.textContent = ttl; title.className = cls;

    sub.innerHTML = `${tail}<br>Score <b>${res.playerScore.toLocaleString()}</b> · survived <b>${fmt(res.playerTime)}</b>` +
      ` · ${res.rows.filter((r) => r.found).length}/${res.rows.length} found`;

    board.innerHTML = res.rows.map((r, i) => `
      <li class="${r.isPlayer ? 'me' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="dot" style="background:${r.col.body}"></span>
        <span class="nm">${r.name}</span>
        <span class="st">${r.found ? 'spotted' : 'safe'} ${fmt(r.survived)}</span>
        <span class="sc">${r.score.toLocaleString()}</span>
      </li>`).join('');

    el.hidden = false;
  }
  function hidePanel() { panelShown = false; const el = document.getElementById('endpanel'); if (el) el.hidden = true; }

  function frame(ctx, t) {
    if (Round.phase !== 'over') { if (panelShown) hidePanel(); return; }
    if (Round.overT >= delay()) { draw(ctx, t); showPanel(); }
  }

  window.Reveal = { frame, draw, showPanel, hidePanel, delay, fmt };
})();
