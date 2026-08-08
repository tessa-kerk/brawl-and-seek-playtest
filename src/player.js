/* Brawl & Seek — the player hider and the one rule that carries the mode:
 * stand still against a surface and, over `repaintTime`, you paint in and vanish
 * (name tag + health fade with the fill); move and the camo breaks instantly and
 * the timer resets. State here; the paint-fill *look* lives in render.js. */
(function () {
  const T = CFG.tile;

  const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,                     // world px/s — smoothed so free-walking isn't jerky
    h: CFG.playerRadius * T,          // collision half-extent
    r: CFG.playerRadius * T * 1.02,   // draw radius
    speed: CFG.playerSpeed * T,       // world px / s
    facing: 1,                        // 1 right, -1 left (for the little face)

    still: 0,                         // seconds held still on a valid surface
    progress: 0,                      // 0..1 paint-fill
    hidden: false,                    // progress === 1
    camo: null,                       // {type,color} being matched
    lastMoving: false,

    // round state
    isPlayer: true, name: 'YOU', col: CFG.characters.player,
    found: false, foundAt: null, hideSpot: null,

    reset() {
      const raw = Arena.spawn();
      const s = Arena.safeActorPosition?.(raw.x, raw.y, this.h)
        || Arena.safeActorPosition?.(Arena.W / 2, Arena.H / 2, this.h)
        || raw;
      this.x = s.x; this.y = s.y; this.vx = 0; this.vy = 0;
      this.still = 0; this.progress = 0; this.hidden = false;
      this.found = false; this.foundAt = null; this.hideSpot = null;
      this.camo = Arena.camoSurface(this.x, this.y, this.h);
    },

    update(dt) {
      // Frozen once spotted or the round is over.
      if (this.found || (window.Round && Round.phase === 'over')) { this.vx = this.vy = 0; return; }
      const v = Input.vector();                 // {x,y}, |v| = direction × speed factor
      // "Commanding movement" gates the repaint — key/stick engagement, NOT
      // displacement. So pushing into a wall (where displacement can be zero)
      // can never start a hide; only a genuinely idle stick does.
      const hasInput = Math.hypot(v.x, v.y) > 0.001 || Input.engaged();

      // Ease velocity toward intent — fast to start (punchy), quick to stop.
      // STATE.speedScale is the global pace multiplier (M4 speed pass).
      const sp = this.speed * STATE.speedScale;
      const tvx = v.x * sp, tvy = v.y * sp;
      const a = 1 - Math.exp(-dt / (hasInput ? 0.04 : 0.06));
      this.vx += (tvx - this.vx) * a;
      this.vy += (tvy - this.vy) * a;

      // Integrate with per-axis tile collision; kill velocity into a blocked axis
      // so it never accumulates against a wall (which would feel like sticking).
      const rx = this.vx * dt, ry = this.vy * dt;
      const p = Arena.collide(this.x, this.y, rx, ry, this.h);
      const blockedX = Math.abs((p.x - this.x) - rx) > 0.01;
      const blockedY = Math.abs((p.y - this.y) - ry) > 0.01;
      if (blockedX) this.vx = 0;
      if (blockedY) this.vy = 0;
      this.x = p.x; this.y = p.y;
      if (hasInput && v.x) this.facing = v.x > 0 ? 1 : -1;

      // Telemetry for the ?debug=1 overlay (intended vs applied velocity + blocks).
      this.dbg = { tvx, tvy, vx: this.vx, vy: this.vy, blockedX, blockedY, hasInput, in: v };

      if (hasInput) {
        if (this.progress > 0) breakCamo(this);  // intent to move breaks camo at once
        this.still = 0;
      } else {
        this.still += dt;
        this.camo = Arena.camoSurface(this.x, this.y, this.h);
        const wasHidden = this.hidden;
        // No qualifying surface here (a Map Maker toggle can switch one off) —
        // you can stand still forever and never paint in.
        this.progress = this.camo ? Math.min(this.still / STATE.repaintTime, 1) : 0;
        this.hidden = this.progress >= 1;
        if (this.hidden && !wasHidden) FX.settleRing(this.x, this.y - this.r * 0.2);
      }
      this.lastMoving = hasInput;
    },

    // Derived read-outs for HUD.
    nameAlpha() { return 1 - this.progress; },
    state() { return this.hidden ? 'hidden' : (this.progress > 0 ? 'hiding' : 'exposed'); },
  };

  function breakCamo(pl) {
    if (pl.hidden || pl.progress > 0.15) FX.breakBurst(pl.x, pl.y - pl.r * 0.2);
    pl.progress = 0; pl.hidden = false;
  }

  window.Player = player;
})();
