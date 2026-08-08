/* Brawl & Seek — the universal Tag, as a fired PROJECTILE (Concept Brief v3.2).
 *
 * Single-target, range ~3 tiles, ~2x base move speed, thin hitbox, 0.75s between
 * shots. WALLS BLOCK IT, so a spotted hider can play cover on the run. Hitting
 * any brawler — camouflaged or visibly running — is the find. A tag that hits
 * nothing, or a wall, is the wrong tag and costs the seeker 30 health. The miss
 * economics are identical whether you shot a suspicious wall or whiffed a chase,
 * so seekers commit to shots instead of spraying. */
(function () {
  const T = CFG.tile;
  const P = CFG.palette;
  const list = [];

  // 2x the seeker's base MOVE speed — including the global pace scale, so the tag
  // stays exactly 2x however fast everyone is moving (ratio preserved).
  const speed = () => TUNING.seeker.baseSpeed * TUNING.tag.speedMult * STATE.speedScale * T;   // world px/s

  // Every hider still in play (seekers are never valid targets).
  function targets() {
    const out = Hiders.alive();
    if (!Player.found) out.push(Player);
    return out;
  }

  function reset() { list.length = 0; }

  function fire(owner, angle) {
    list.push({
      x: owner.x, y: owner.y - owner.r * 0.15,
      dx: Math.cos(angle), dy: Math.sin(angle),
      travelled: 0, maxDist: TUNING.tag.range * T,
      owner, dead: false,
    });
    FX.spark(owner.x + Math.cos(angle) * owner.r, owner.y + Math.sin(angle) * owner.r);
  }

  // Line of sight for the bot's fire decision: walls block the tag.
  function los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const steps = Math.ceil(d / 5);
    for (let i = 1; i <= steps; i++) {
      const x = x0 + (dx * i) / steps, y = y0 + (dy * i) / steps;
      const t = Arena.tileOf(x, y);
      if (Arena.isWall(t.c, t.r)) return false;
    }
    return true;
  }

  function onHit(p, h) {
    p.dead = true;
    FX.breakBurst(h.x, h.y - h.r * 0.2);
    if (window.STATE && STATE.view === 'maker') Maker.onTagged(h);   // sandbox: no round to end
    else Round.onFound(h, p.owner);
  }
  function onMiss(p) {
    p.dead = true;
    FX.spark(p.x, p.y);
    Seekers.wrongTag(p.owner);       // hit nothing, or a wall -> the 30
  }

  function update(dt) {
    if (Round.phase === 'over') { list.length = 0; return; }
    const hitDist = (TUNING.tag.hitRadius + TUNING.tag.projRadius) * T;
    for (const p of list) {
      if (p.dead) continue;
      let remaining = speed() * dt;
      while (remaining > 0 && !p.dead) {
        const s = Math.min(6, remaining);            // substep: never tunnel a wall or a body
        p.x += p.dx * s; p.y += p.dy * s; p.travelled += s; remaining -= s;

        const t = Arena.tileOf(p.x, p.y);
        if (Arena.isWall(t.c, t.r)) { onMiss(p); break; }

        let hit = null;
        for (const h of targets()) {
          if (Math.hypot(p.x - h.x, p.y - (h.y - h.r * 0.15)) <= hitDist) { hit = h; break; }
        }
        if (hit) { onHit(p, hit); break; }
        if (p.travelled >= p.maxDist) { onMiss(p); break; }   // ran out of range
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  }

  function draw(ctx) {
    for (const p of list) {
      const tail = 13;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,79,109,.38)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(p.x - p.dx * tail * 1.6, p.y - p.dy * tail * 1.6); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = '#FF4F6D'; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(p.x - p.dx * tail, p.y - p.dy * tail); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = P.chalk; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x - p.dx * tail * 0.55, p.y - p.dy * tail * 0.55); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.restore();
    }
  }

  window.Tags = { list, fire, update, draw, reset, los, speed };
})();
