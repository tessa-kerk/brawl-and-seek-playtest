/* Brawl & Seek — AI dummy hiders. They run the exact same rule as the player:
 * travel to a spot, stand still for the (escalating) repaint time, paint in and
 * vanish; move and camo breaks. They also obey the camping rule — the score rate
 * decays where they sit, so they make the "daring run" to a new spot >= 3 tiles
 * away to bank the reposition bonus. That run is what the seeker gets to see. */
(function () {
  const T = CFG.tile;

  function make(def, tile) {
    const raw = tile.x != null ? { x: tile.x, y: tile.y } : Arena.centre(tile.c, tile.r);
    const safe = findSafe(raw) ||
      Arena.safeActorPosition?.(Arena.W / 2, Arena.H / 2, CFG.playerRadius * T) || raw;
    const c = safe;
    return {
      name: def.name, col: def, isPlayer: false,
      x: c.x, y: c.y, h: CFG.playerRadius * T, r: CFG.playerRadius * T * 1.02,
      facing: 1, vx: 0, vy: 0, speed: CFG.playerSpeed * 0.82,  // tiles/s — a touch slower than you
      still: 0, progress: 0, hidden: false, camo: null,
      found: false, foundAt: null, hideSpot: null,
      score: 0, camp: 0, rate: TUNING.hider.scoreRate, lastHideSpot: null,
      state: 'travel', dwell: 0, path: [], wp: 0, stall: 0,
    };
  }

  function findSafe(raw) {
    const r = CFG.playerRadius * T;
    // Search the whole local tile neighbourhood deterministically.  The
    // frozen collision field can leave a tile centre on a contact band even
    // though a nearby point in the same walkable area is safe; using only
    // three 8px rings made the legal pool spuriously smaller than the eight
    // hider roster.  Every returned point is still validated by the frozen
    // Arena.safeActorPosition oracle.
    const offsets = [];
    for (let n = 0; n <= 40; n += 4) {
      if (n === 0) offsets.push(0);
      else offsets.push(n, -n);
    }
    for (const d of offsets) {
      for (const e of offsets) {
        const s = Arena.safeActorPosition?.(raw.x + d, raw.y + e, r);
        if (s) return s;
      }
    }
    return null;
  }

  function pickHideTile(from, minTiles) {
    const cand = Arena.hideTiles.filter((t) => {
      const c = Arena.centre(t.c, t.r);
      return !from || AI.tileDist(from.x, from.y, c.x, c.y) >= minTiles;
    });
    return Arena.pick(cand.length ? cand : Arena.hideTiles);
  }

  const list = [];

  function reset() {
    list.length = 0;
    // Map Maker is a one-seeker sandbox; it must never attempt to construct
    // the live eight-hider roster against a tiny synthetic fixture.
    if ((window.STATE && STATE.view === 'maker') || /(?:^|[?&])view=maker(?:&|$)/.test(location.search)) return;
    const sp = Arena.spawn();
    const required = CFG.characters.dummies.slice(0, TUNING.counts.dummies).length;
    const safePool = Arena.freeTiles.map((tile) => {
      const c = Arena.centre(tile.c, tile.r);
      const safe = findSafe(c);
      return safe ? { tile, safe } : null;
    }).filter(Boolean);
    if (safePool.length < required) throw new Error('No safe hider spawn pool: ' + safePool.length);
    const farPool = safePool.filter((p) => AI.tileDist(sp.x, sp.y, p.safe.x, p.safe.y) > 2.2);
    const pool = farPool.length >= required ? farPool : safePool;
    const used = new Set();
    CFG.characters.dummies.slice(0, TUNING.counts.dummies).forEach((def) => {
      const pick = pool.find((p) => !used.has(p.tile.c + ',' + p.tile.r));
      if (!pick) throw new Error('Safe hider pool exhausted');
      used.add(pick.tile.c + ',' + pick.tile.r);
      const t = { x: pick.safe.x, y: pick.safe.y, c: pick.tile.c, r: pick.tile.r };
      const d = make(def, t);
      AI.goTo(d, pickHideTile(d, 0));
      list.push(d);
    });
  }

  // How long a dummy camps before making its run. Staggered so the pack doesn't
  // all break cover on the same frame the seeker is released.
  function dwellFor(d) { return 8 + Math.random() * 14; }

  function onHidden(d) {
    const H = TUNING.hider;
    // Dummies obey the same canon v3.3 rule: the reposition bank only counts in
    // the seek phase (nothing scores or banks during the hide phase).
    if (Round.phase === 'seek' && d.lastHideSpot && AI.tileDist(d.x, d.y, d.lastHideSpot.x, d.lastHideSpot.y) >= H.repositionMinTiles) {
      d.score += H.repositionBonus; d.camp = 0;
    }
    d.lastHideSpot = { x: d.x, y: d.y };
    d.hideSpot = { x: d.x, y: d.y };
    d.dwell = dwellFor(d);
    FX.settleRing(d.x, d.y - d.r * 0.2);
  }

  function breakCamo(d) {
    if (d.hidden || d.progress > 0.15) FX.breakBurst(d.x, d.y - d.r * 0.2);
    d.progress = 0; d.hidden = false; d.still = 0;
  }

  function update(dt) {
    const H = TUNING.hider;
    for (const d of list) {
      if (d.found) continue;
      const px = d.x, py = d.y;       // for the velocity a seeker leads its shot with

      if (d.state === 'travel') {
        if (d.progress > 0) breakCamo(d);
        const moving = AI.step(d, dt, d.speed * STATE.speedScale);
        if (d.stall > 0.7) { AI.goTo(d, pickHideTile(d, 1)); }        // route went bad
        if (!moving) { d.state = 'settle'; d.still = 0; }
      } else {
        // standing still: paint in exactly like the player does
        d.still += dt;
        d.camo = Arena.camoSurface(d.x, d.y, d.h);
        const was = d.hidden;
        d.progress = d.camo ? Math.min(d.still / STATE.repaintTime, 1) : 0;
        d.hidden = d.progress >= 1;
        if (d.hidden && !was) onHidden(d);

        if (d.hidden && Round.phase === 'seek') {
          // Score, decay and dwell only in the seek phase (canon v3.3).
          d.camp += dt;
          d.rate = Math.max(H.rateFloor, H.scoreRate * Math.pow(0.5, d.camp / H.rateHalfLife));
          d.score += d.rate * dt;
          d.dwell -= dt;
          // the daring run: bank the bonus somewhere new
          if (d.dwell <= 0) {
            breakCamo(d);
            AI.goTo(d, pickHideTile(d, H.repositionMinTiles));
            d.state = 'travel';
          }
        }
      }
      if (dt > 0) { d.vx = (d.x - px) / dt; d.vy = (d.y - py) / dt; }
    }
  }

  const alive = () => list.filter((d) => !d.found);

  window.Hiders = { list, reset, update, alive, breakCamo };
})();
