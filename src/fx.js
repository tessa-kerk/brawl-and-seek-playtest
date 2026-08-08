/* Brawl & Seek — lightweight canvas FX. Two motifs from the locked visual
 * system show up here: the paint (magenta break-burst when camo cracks off) and
 * the proximity ripple (teal — used as the camo-settle ring and the you-are-here
 * pulse). All transform/opacity only, and all suppressed under reduce-motion. */
(function () {
  const P = CFG.palette;
  let bursts = [];   // magenta paint specks
  let rings = [];    // expanding teal/magenta rings

  function reduce() { return !!(window.STATE && STATE.reduceMotion); }

  // Camo just broke — fling a few paint specks off the body.
  function breakBurst(x, y) {
    if (reduce()) return;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
      bursts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: 3 + Math.random() * 3, life: 0, max: 0.34 });
    }
  }

  // Camo just completed — one soft teal ring settles outward.
  function settleRing(x, y) {
    if (reduce()) return;
    rings.push({ x, y, r0: 8, r1: 46, life: 0, max: 0.55, color: P.teal, w: 3 });
  }

  /* THE TELL. Someone moved within a short radius of a hidden brawler, so the
   * camo ripples for a moment. This is the seeker's only clue — slow down and
   * watch and you see it; sprint past and you don't. Static ring under
   * reduce-motion so it still reads. */
  function tell(x, y) {
    rings.push({ x, y, r0: 4, r1: reduce() ? 20 : 34, life: 0, max: reduce() ? 0.9 : 0.42, color: P.teal, w: 2.5 });
  }

  // A fired Tag leaving the barrel, or slapping into a wall / empty air.
  function spark(x, y) {
    rings.push({ x, y, r0: 2, r1: reduce() ? 10 : 17, life: 0, max: 0.22, color: '#FF4F6D', w: 3 });
  }

  function update(dt) {
    for (const b of bursts) { b.life += dt; b.vy += 260 * dt; b.x += b.vx * dt; b.y += b.vy * dt; }
    bursts = bursts.filter((b) => b.life < b.max);
    for (const r of rings) r.life += dt;
    rings = rings.filter((r) => r.life < r.max);
  }

  function draw(ctx) {
    for (const b of bursts) {
      const k = 1 - b.life / b.max;
      ctx.globalAlpha = k; ctx.fillStyle = P.magenta;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.6 + k * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    for (const r of rings) {
      const k = r.life / r.max;
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The persistent "you are here" pulse under a fully-hidden player. Drawn every
  // frame (not queued) so the player never loses their own position. Static ring
  // under reduce-motion.
  function youAreHere(ctx, x, y, t) {
    ctx.save();
    if (reduce()) {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = P.teal; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.stroke();
    } else {
      const ph = (t % 2) / 2;                 // 2s loop
      ctx.globalAlpha = (1 - ph) * 0.55; ctx.strokeStyle = P.teal; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 12 + ph * 28, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = P.teal; ctx.fill();
    }
    ctx.restore();
  }

  window.FX = { breakBurst, settleRing, tell, spark, update, draw, youAreHere };
})();
