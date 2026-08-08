/* Brawl & Seek — input. One normalised move vector out.
 *   WASD / Arrow keys on desktop (full speed).
 *   Touch: a thumb-stick, in one of two modes (query-selectable):
 *     fixed  (default, 18-07-2026)  — a standard fixed base bottom-left,
 *                                generous dead-zone, NO re-anchor. This is
 *                                real Brawl's own joystick language (Concept
 *                                Brief rule 3g/3h UI split: only Brawl's own
 *                                control chrome sits inside the play frame),
 *                                so it's now the default, not the debug mode.
 *     float  (?joystick=float)  — a floating stick that anchors where you
 *                                first touch. Kept as a comparison affordance.
 *
 * iOS-Safari hardening (07-07-2026, after two mobile playtests where the sim
 * passed but the device didn't):
 *   - Listeners live on the #stage ELEMENT with {passive:false} (element-level
 *     listeners are reliably non-passive, so preventDefault actually stops
 *     iOS page-pan / pinch / double-tap-zoom stealing the touch).
 *   - State is rebuilt from the authoritative `event.touches` EVERY event, so a
 *     dropped touchend / reused identifier can't leave a stale anchor.
 *   - Telemetry (Input.debug()) drives the ?debug=1 overlay — the device
 *     recording is now the ground truth, not a scripted sim. */
(function () {
  const keys = new Set();
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  addEventListener('keydown', (e) => { const d = KEYMAP[e.code]; if (d) { keys.add(d); e.preventDefault(); } });
  addEventListener('keyup', (e) => { const d = KEYMAP[e.code]; if (d) { keys.delete(d); e.preventDefault(); } });
  addEventListener('blur', () => keys.clear());

  const MODE = new URLSearchParams(location.search).get('joystick') === 'float' ? 'float' : 'fixed';

  /* Capability-aware portrait coordinate remap (Concept Brief rule 3l —
   * no rotate prompt; #stage itself renders rotated via CSS only for a
   * portrait coarse/no-hover primary pointer, see main.css).
   * Touch events keep reporting RAW physical clientX/clientY regardless of
   * any CSS transform on an ancestor — the browser does NOT rotate touch
   * coordinates for you, only the pixels it paints. Every touch coordinate
   * used for game logic must be converted into #stage's OWN rotated-box
   * space to match what game.js's cssW/cssH (stage.clientWidth/Height,
   * unaffected by the transform) already assume.
   * Derived from the exact mobile CSS transform (rotate(90deg)
   * translateY(-100%), transform-origin:top left) on a box sized width=innerHeight,
   * height=innerWidth: inverting that transform gives
   *   gameX = physicalClientY
   *   gameY = innerWidth − physicalClientX
   * innerWidth here is the PHYSICAL viewport width (the box's own height,
   * i.e. the translateY(-100%) distance) — always call remap() with the
   * live window.innerWidth, never a cached value, since orientation can
   * change mid-session. isRotated() mirrors the exact CSS media query. */
  function isRotated() { return matchMedia('(orientation: portrait) and (pointer: coarse) and (hover: none)').matches; }
  function stage() { return document.getElementById('stage'); }
  function geometry() {
    const el = stage();
    const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
    return { rect, width: el ? el.clientWidth : innerWidth, height: el ? el.clientHeight : innerHeight };
  }
  function gameW() { return geometry().width; }
  function gameH() { return geometry().height; }
  function remap(x, y) {
    const g = geometry();
    if (!isRotated()) return { x: x - g.rect.left, y: y - g.rect.top };
    return { x: y - g.rect.top, y: g.rect.right - x };
  }

  // Tuning per mode.
  const F = { DEAD: 4, MAX: 34, MINK: 0.5 };            // floating
  const X = { DEAD: 12, RAD: 62, MINK: 0.55 };          // fixed (generous)

  let anchorId = null;                 // identifier of the driving touch
  let active = false;
  const anchor = { x: 0, y: 0 };       // float: where the finger first landed; fixed: the base
  const cur = { x: 0, y: 0 };          // current finger position
  const stick = { dx: 0, dy: 0 };      // throw offset, clamped to the mode's radius

  const dbg = {
    mode: MODE, touches: [], anchor: null, cur: null, vec: { x: 0, y: 0 }, mag: 0,
    pdOk: false, lastType: '-', evtCount: 0,
  };

  // ---- visuals ----------------------------------------------------------
  const ring = el(MODE === 'fixed' ? 128 : 92), nub = el(MODE === 'fixed' ? 54 : 40);
  ring.id = 'stick-ring'; nub.id = 'stick-nub'; ring.appendChild(nub);
  ring.style.display = MODE === 'fixed' ? 'block' : 'none';
  function el(s) { const d = document.createElement('div'); Object.assign(d.style, { position: 'fixed', width: s + 'px', height: s + 'px', borderRadius: '50%', zIndex: 6, pointerEvents: 'none', transform: 'translate(-50%,-50%)', left: '0', top: '0' }); return d; }
  // Appended into #stage (not document.body): the Map Maker sheet
  // (#makerpanel, z-index 8) needs to reliably paint OVER the ring
  // (z-index 6) when the two overlap on a phone. Living as a body-level
  // sibling of #stage put the ring in a different z-index comparison than
  // intended — as a child of #stage, both are compared in the same
  // context and the higher z-index wins, as the numbers already say.
  addEventListener('DOMContentLoaded', () => (document.getElementById('stage') || document.body).appendChild(ring));

  // Bottom-left, matching the proportions in Tessa's real screenshot
  // reference. No maker-mode special-casing needed: Map Maker's phone
  // bottom-sheet (#makerpanel, z-index 8 vs the ring's 6) already paints
  // over the ring where the two would overlap, and its touches are already
  // excluded from the stick by the existing #makerpanel UI-exclusion rule
  // below — nothing to functionally protect, so keep this one position.
  function base() {
    return { x: Math.max(78, gameW() * 0.15), y: gameH() - Math.max(120, gameH() * 0.17) };
  }
  // Neutral translucent grey — real Brawl's own control language, not our
  // brand accent (Concept Brief rule 3g/3h UI split: inside the play frame,
  // only Brawl's own UI vocabulary; our teal/magenta stays for OUR chrome).
  function styleRing(on) {
    ring.style.background = 'radial-gradient(circle, rgba(255,255,255,.16), rgba(20,20,26,.30))';
    ring.style.border = '2.5px solid rgba(255,255,255,' + (on ? '.55' : '.34') + ')';
    nub.style.background = 'rgba(235,235,240,' + (on ? '.92' : '.68') + ')';
    nub.style.boxShadow = '0 3px 10px rgba(0,0,0,.4)';
  }
  function drawVisual() {
    if (MODE === 'fixed') {
      const b = base(); ring.style.left = b.x + 'px'; ring.style.top = b.y + 'px';
      nub.style.left = (b.x + stick.dx) + 'px'; nub.style.top = (b.y + stick.dy) + 'px';
      styleRing(active);
    } else {
      ring.style.display = active ? 'block' : 'none';
      ring.style.left = anchor.x + 'px'; ring.style.top = anchor.y + 'px';
      nub.style.left = (anchor.x + stick.dx) + 'px'; nub.style.top = (anchor.y + stick.dy) + 'px';
      styleRing(true);
    }
  }

  // ---- clamp helpers ----------------------------------------------------
  function setThrow(px, py, ox, oy, RAD) {
    let dx = px - ox, dy = py - oy; const d = Math.hypot(dx, dy);
    if (d > RAD) { dx = dx / d * RAD; dy = dy / d * RAD; }
    stick.dx = dx; stick.dy = dy;
  }

  /* Touches that begin on interactive chrome (the Map Maker panel, Play again,
   * links) must NOT be swallowed: calling preventDefault() on touchstart stops
   * the browser synthesising a click, which silently kills every button on a
   * phone. Those touches are also excluded from the thumb-stick. */
  const uiIds = new Set();
  const UI_SEL = 'button, a, input, select, label, #makerpanel, #endpanel';
  const isUI = (el) => !!(el && el.closest && el.closest(UI_SEL));

  // ---- the one handler, rebuilt from event.touches ----------------------
  function handle(e) {
    dbg.evtCount++; dbg.lastType = e.type;

    // RECONCILE membership per touchstart (not add-only): iOS can drop a
    // touchend and REUSE identifiers, so a stale UI id could otherwise exclude a
    // later game touch from the stick forever (the same ghost class as the M1
    // saga). Setting/clearing by isUI on every touchstart heals that instantly.
    if (e.type === 'touchstart') {
      for (const t of e.changedTouches) {
        if (isUI(t.target)) uiIds.add(t.identifier); else uiIds.delete(t.identifier);
      }
    }
    // Only claim the gesture if a real GAME touch is involved.
    let gameTouch = false;
    for (const t of e.changedTouches) if (!uiIds.has(t.identifier)) gameTouch = true;
    if (gameTouch && e.cancelable) { e.preventDefault(); dbg.pdOk = true; }

    const list = [];
    for (const t of e.touches) if (!uiIds.has(t.identifier)) { const p = remap(t.clientX, t.clientY); list.push({ id: t.identifier, x: p.x, y: p.y }); }
    dbg.touches = list;

    if (MODE === 'fixed') {
      const b = base();
      let t = list.find((t) => t.id === anchorId);
      if (!t) { t = list.find(inZone); anchorId = t ? t.id : null; }   // engage a touch in the zone
      if (t) { active = true; cur.x = t.x; cur.y = t.y; anchor.x = b.x; anchor.y = b.y; setThrow(t.x, t.y, b.x, b.y, X.RAD); }
      else { active = false; stick.dx = stick.dy = 0; }
    } else {
      let t = list.find((t) => t.id === anchorId);
      if (!t) {                                    // anchor gone: (re)anchor to the newest live touch
        if (list.length) { t = list[list.length - 1]; anchorId = t.id; anchor.x = t.x; anchor.y = t.y; }
        else { anchorId = null; active = false; stick.dx = stick.dy = 0; }
      }
      if (t) { active = true; cur.x = t.x; cur.y = t.y; setThrow(t.x, t.y, anchor.x, anchor.y, F.MAX); }
    }
    if (e.type === 'touchend' || e.type === 'touchcancel') {
      for (const t of e.changedTouches) uiIds.delete(t.identifier);
    }
    drawVisual();
  }
  function inZone(t) { return t.x < gameW() * 0.62 && t.y > gameH() * 0.42; }

  addEventListener('DOMContentLoaded', () => {
    const surface = document.getElementById('stage') || window;
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
      surface.addEventListener(ev, handle, { passive: false });
    drawVisual();
  });

  // ---- public API -------------------------------------------------------
  function curve(d, C) {
    const ramp = Math.min((d - C.DEAD) / (C.RAD !== undefined ? C.RAD - C.DEAD : C.MAX - C.DEAD), 1);
    return C.MINK + (1 - C.MINK) * ramp;
  }
  // Is the player actively commanding movement right now (key held, or the
  // stick deflected past its dead-zone)? Used to gate the repaint so pushing
  // against a wall — where displacement can be zero — never starts a hide.
  function engaged() {
    if (keys.size) return true;
    if (!active) return false;
    const C = MODE === 'fixed' ? X : F;
    return Math.hypot(stick.dx, stick.dy) > C.DEAD;
  }

  window.Input = {
    mode: MODE,
    engaged,
    vector() {
      let x = 0, y = 0;
      if (keys.has('left')) x -= 1; if (keys.has('right')) x += 1;
      if (keys.has('up')) y -= 1; if (keys.has('down')) y += 1;
      if (x || y) { const m = Math.hypot(x, y); const v = { x: x / m, y: y / m }; dbg.vec = v; dbg.mag = 1; return v; }
      if (active) {
        const C = MODE === 'fixed' ? X : F;
        const d = Math.hypot(stick.dx, stick.dy);
        if (d > C.DEAD) {
          const k = curve(d, C);
          const v = { x: stick.dx / d * k, y: stick.dy / d * k };
          dbg.vec = v; dbg.mag = Math.hypot(v.x, v.y);
          dbg.anchor = MODE === 'fixed' ? base() : { x: anchor.x, y: anchor.y };
          dbg.cur = { x: cur.x, y: cur.y };
          return v;
        }
      }
      dbg.vec = { x: 0, y: 0 }; dbg.mag = 0;
      dbg.anchor = MODE === 'fixed' ? base() : (active ? { x: anchor.x, y: anchor.y } : null);
      dbg.cur = active ? { x: cur.x, y: cur.y } : null;
      return { x: 0, y: 0 };
    },
    debug() { return { ...dbg, rotation: isRotated(), geometry: geometry() }; },
    mapClient: remap,
  };
})();
