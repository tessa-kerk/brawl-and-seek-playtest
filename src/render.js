/* Brawl & Seek — entity rendering. The M1 paint fill is a SIGNED-OFF regression
 * surface: the player's look must stay pixel-identical, so character colours are
 * explicit light/body/dark triples rather than computed tints. Dummy hiders run
 * the exact same paint-fill visual; seekers are drawn distinctly (visor + health).
 * All world-space except drawSpotted(), which is a screen-space stamp. */
(function () {
  const P = CFG.palette;

  // ---- shared silhouette ------------------------------------------------
  function bodyPath(ctx, cx, cy, r) {
    const w = r * 1.72, h = r * 2.02;
    Arena.roundRect(ctx, cx - w / 2, cy - h / 2, w, h, r * 0.86);
  }

  function drawNormal(ctx, cx, cy, r, facing, col, opts = {}) {
    const baseAlpha = ctx.globalAlpha;
    ctx.fillStyle = col.dark;
    ctx.beginPath(); ctx.ellipse(cx - r * 0.45, cy + r * 0.92, r * 0.34, r * 0.24, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.45, cy + r * 0.92, r * 0.34, r * 0.24, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, col.light); g.addColorStop(1, col.body);
    bodyPath(ctx, cx, cy, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = r * 0.17; ctx.strokeStyle = P.ink; ctx.stroke();
    ctx.globalAlpha = baseAlpha * 0.5; ctx.fillStyle = '#FFF0B0';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.32, r * 0.42, -0.4, 0, 7); ctx.fill();
    ctx.globalAlpha = baseAlpha;
    const ex = facing * r * 0.16;
    for (const s of [-1, 1]) {
      ctx.fillStyle = P.chalk;
      ctx.beginPath(); ctx.ellipse(cx + ex + s * r * 0.34, cy - r * 0.18, r * 0.22, r * 0.3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.ink;
      ctx.beginPath(); ctx.arc(cx + ex + s * r * 0.34 + facing * r * 0.05, cy - r * 0.12, r * 0.12, 0, 7); ctx.fill();
    }
    if (opts.visor) {   // seekers get a hunting brow so they read instantly
      ctx.fillStyle = P.ink;
      Arena.roundRect(ctx, cx - r * 0.62, cy - r * 0.46, r * 1.24, r * 0.22, r * 0.1); ctx.fill();
    }
  }

  function drawCamo(ctx, cx, cy, r, color, extraAlpha) {
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * CFG.camoAlpha * extraAlpha;
    bodyPath(ctx, cx, cy, r); ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = baseAlpha * CFG.camoAlpha * extraAlpha * 1.3;
    ctx.lineWidth = r * 0.1; ctx.strokeStyle = 'rgba(9,16,36,.8)'; ctx.stroke();
    ctx.globalAlpha = baseAlpha;
  }

  // ---- hiders (player + dummies share the paint fill) --------------------
  function drawHider(ctx, e, t, isPlayer) {
    if (e.found && !isPlayer) return;               // found dummies are now seekers
    const cx = e.x, cy = e.y, r = e.r, p = e.progress, col = e.col;
    const localBush = isPlayer && Arena.bushCellsForBody && Arena.bushCellsForBody(e.x,e.y,e.h).length > 0;
    const bushAlpha = localBush && !e.hidden ? .58 : 1;
    ctx.save();

    const shadowAlpha = 0.4;
    ctx.globalAlpha = (1 - p) * 0.28 * shadowAlpha; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.12, r * 0.8, r * 0.3, 0, 0, 7); ctx.fill();

    if (e.hidden && !e.found) {
      if (!isPlayer) { ctx.restore(); return; }
      drawCamo(ctx, cx, cy, r, (e.camo && e.camo.color) || P.navy, 1);
      if (isPlayer) FX.youAreHere(ctx, cx, cy + r * 0.1, t);
      ctx.restore();
      return;
    }

    const left = cx - r * 1.12, right = cx + r * 1.12;
    const inBush = isPlayer && Arena.isBush(Math.floor(cx / Arena.T), Math.floor(cy / Arena.T));
    const sweepX = left + p * (right - left);
    if (p <= 0 || e.found) {
      ctx.globalAlpha = bushAlpha;
      drawNormal(ctx, cx, cy, r, e.facing, col);
    } else {
      ctx.save(); ctx.beginPath(); ctx.rect(sweepX, cy - r * 2, right - sweepX + r, r * 4); ctx.clip();
      drawNormal(ctx, cx, cy, r, e.facing, col); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(left - r, cy - r * 2, sweepX - left + r, r * 4); ctx.clip();
      drawCamo(ctx, cx, cy, r, (e.camo && e.camo.color) || P.navy, 0.55 + 0.45 * p); ctx.restore();
      drawWetEdge(ctx, sweepX, cy, r, t);
    }
    ctx.globalAlpha = 1;
    if (p > 0 && p < 1) drawRing(ctx, cx, cy, r, p);
    drawNameTag(ctx, cx, cy, r, e.name, 1 - p, e.found ? 0 : 1);
    ctx.restore();
  }

  function drawSeeker(ctx, s, t) {
    const cx = s.x, cy = s.y, r = s.r;
    const ghost = s.state === 'spectator';
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.28;
    ctx.globalAlpha *= 1; ctx.fillStyle = '#000';
    ctx.globalAlpha = ghost ? 0.1 : 0.28;
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.12, r * 0.8, r * 0.3, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = ghost ? 0.28 : 1;

    if (s.flash > 0) {   // wrong tag — it cost health
      ctx.strokeStyle = 'rgba(255,79,109,.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r * (1.4 + (0.35 - s.flash) * 3), 0, 7); ctx.stroke();
    }
    drawNormal(ctx, cx, cy, r, s.facing, s.col, { visor: true });
    // health bar
    const w = r * 1.5, hh = r * 0.22, bx = cx - w / 2, by = cy - r * 1.75;
    Arena.roundRect(ctx, bx, by, w, hh, hh / 2); ctx.fillStyle = 'rgba(9,16,36,.85)'; ctx.fill();
    const frac = Math.max(0, s.health) / TUNING.seeker.health;
    Arena.roundRect(ctx, bx + 1, by + 1, (w - 2) * frac, hh - 2, (hh - 2) / 2);
    ctx.fillStyle = frac > 0.5 ? '#3BD16B' : frac > 0.25 ? P.yellow : '#FF4F6D'; ctx.fill();
    // mistake pips — the 3-miss tag budget, so a depleting threat is legible
    // mid-chase (v12): filled red = a wrong tag spent, hollow = budget left.
    if (!ghost) {
      const pr = r * 0.14, gap = r * 0.44, py2 = by - r * 0.42;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx - gap + i * gap, py2, pr, 0, 7);
        if (i < s.mistakes) { ctx.fillStyle = '#FF4F6D'; ctx.fill(); }
        else { ctx.fillStyle = 'rgba(9,16,36,.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(246,244,239,.65)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
    }
    ctx.restore();
  }

  function drawWetEdge(ctx, x, cy, r, t) {
    const wob = STATE.reduceMotion ? 0 : Math.sin(t * 12) * r * 0.05;
    ctx.save();
    ctx.shadowColor = P.magenta; ctx.shadowBlur = 12; ctx.fillStyle = P.magenta;
    Arena.roundRect(ctx, x - r * 0.16, cy - r * 1.15 + wob, r * 0.32, r * 2.25, r * 0.16); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#FF8CC6';
    Arena.roundRect(ctx, x - r * 0.06, cy - r * 1.05 + wob, r * 0.12, r * 2.05, r * 0.06); ctx.fill();
    if (!STATE.reduceMotion) {
      ctx.fillStyle = P.magenta; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(x, cy + r * 1.2 + (t * 40 % 12), r * 0.12, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawRing(ctx, cx, cy, r, p) {
    const rad = r * 1.62;
    ctx.save();
    ctx.globalAlpha = p < 0.9 ? 0.9 : (1 - p) * 9;
    ctx.strokeStyle = 'rgba(23,27,51,.55)'; ctx.lineWidth = r * 0.2;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = P.magenta; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawNameTag(ctx, cx, cy, r, label, alpha, showHealth) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha = alpha;
    const fs = r * 0.62;
    ctx.font = `${fs}px 'Lilita One', sans-serif`;
    const tw = ctx.measureText(label).width;
    const padX = r * 0.34, boxW = tw + padX * 2, boxH = fs * 1.34;
    const bx = cx - boxW / 2, by = cy - r * 2.35;
    if (showHealth) {
      const hbW = boxW * 0.92, hbX = cx - hbW / 2, hbY = by - r * 0.4, hbH = r * 0.24;
      Arena.roundRect(ctx, hbX, hbY, hbW, hbH, hbH / 2); ctx.fillStyle = 'rgba(9,16,36,.85)'; ctx.fill();
      Arena.roundRect(ctx, hbX + 1.5, hbY + 1.5, hbW - 3, hbH - 3, (hbH - 3) / 2); ctx.fillStyle = '#3BD16B'; ctx.fill();
    }
    Arena.roundRect(ctx, bx, by, boxW, boxH, boxH * 0.32);
    ctx.fillStyle = 'rgba(20,23,43,.9)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(246,244,239,.25)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.18, by + boxH); ctx.lineTo(cx + r * 0.18, by + boxH); ctx.lineTo(cx, by + boxH + r * 0.24);
    ctx.closePath(); ctx.fillStyle = 'rgba(20,23,43,.9)'; ctx.fill();
    ctx.fillStyle = P.chalk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, by + boxH / 2 + fs * 0.06);
    ctx.restore();
  }

  // ---- end-of-round stamp (screen space) --------------------------------
  // Display type, tilted ~8°, the locked motif. A stamp family: SPOTTED! is
  // yellow-on-magenta (a hider found); TAGGED OUT! is its mirror (ink-on-teal,
  // the hiders-win colour) — the hiders turn the Tag back on the seekers.
  function drawStamp(ctx, w, h, age, label, bg, fg) {
    const k = STATE.reduceMotion ? 1 : Math.min(1, age / 0.22);
    const scale = STATE.reduceMotion ? 1 : 1.6 - 0.6 * easeOut(k);
    ctx.save();
    ctx.globalAlpha = Math.min(1, age / 0.12);
    ctx.translate(w / 2, h * 0.42);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.scale(scale, scale);
    const fs = Math.min(w * 0.14, label.length > 11 ? 58 : 86);  // shrink only a long label; the stamp family (SPOTTED! / TAGGED OUT!) stays full size
    ctx.font = `${fs}px 'Lilita One', sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + fs * 0.7, bh = fs * 1.5;
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    Arena.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, fs * 0.22);
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 5; ctx.strokeStyle = P.ink; ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, fs * 0.06);
    ctx.restore();
  }
  const drawSpotted = (ctx, w, h, age) => drawStamp(ctx, w, h, age, 'SPOTTED!', P.magenta, P.yellow);
  const drawTaggedOut = (ctx, w, h, age) => drawStamp(ctx, w, h, age, 'TAGGED OUT!', P.teal, P.ink);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  window.Render = {
    drawPlayer: (ctx, t) => drawHider(ctx, Player, t, true),
    drawHider, drawSeeker, drawSpotted, drawTaggedOut, drawStamp, drawNormal, bodyPath,
  };
})();
