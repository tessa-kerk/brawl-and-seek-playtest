/* Brawl & Seek — boot, global state, the fit-to-viewport transform, and the main
 * loop. The arena is a fixed world drawn contained and centred, so it reads from
 * a 1280-wide desktop down to a 360-wide phone. A debug API (window.Game.pose /
 * pause) lets the capture rig freeze exact frames; ?debug=1 adds the overlay. */
(function () {
  // Implementation Session 1 (05-08-2026), A18 §2/§C1 (item 3): same single
  // source of truth as world.js/arena.js — bundle IDENTITY, set synchronously
  // by src/bundle-select.js, never a separate ?blockout=1 re-check here
  // (Gate 0 item 1). Gates the D025 bush-treatment compositor and the
  // plate-masked foreground drawables so they share the EXACT same on/off
  // switch as world.js's plate gates — there is no code path where one flips
  // and the other doesn't (A18 §2's "structural exclusion, not a cosmetic
  // cover-up").
  const blockoutActive = !!(window.ARENA_BUNDLE && window.ARENA_BUNDLE.isBlockout);

  window.STATE = {
    view: 'event',                                          // 'event' | 'maker'
    repaintTime: CFG.repaintTime,
    // Map properties. The Event view always runs canon (all FOUR surfaces
    // camouflage — bush added art pass 18-07-2026 — the tell is on); the Map
    // Maker view makes them tunable, live.
    camoSurfaces: { wall: true, floor: true, water: true, bush: true },
    rippleTell: true,
    // Global movement pace (see TUNING.speedScale). ?speed=<n> overrides it live
    // for on-device A/B; clamped to a sane range.
    speedScale: (() => {
      const q = parseFloat(new URLSearchParams(location.search).get('speed'));
      return (q > 0 && q <= 2) ? q : (window.TUNING ? TUNING.speedScale : 1);
    })(),
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    paused: false,
    everHidden: false,
  };

  let canvas, ctx, stage;
  let dpr = 1, cssW = 0, cssH = 0, scale = 1, offX = 0, offY = 0;
  let cameraX = 0, cameraY = 0;
  let last = 0, tSec = 0, renderSerial = 0;
  let elHint, elStatus, elStatusLabel, elBanner, elBonus, elOvLeft, elOvRight, elPace;
  let lastPhase = 'hide', bannerT = 0, bonusArmed = false, lastDt = 0.016;

  function isPortraitRotateStage() {
    return matchMedia('(orientation: portrait) and (pointer: coarse) and (hover: none)').matches;
  }

  function fitRotatedPortraitStage() {
    if (!stage || !isPortraitRotateStage()) {
      stage.style.width = '';
      stage.style.height = '';
      stage.style.left = '';
      stage.style.top = '';
      return;
    }
    const vv = window.visualViewport;
    const candidates = [window.innerWidth, window.innerHeight];
    if (vv) {
      candidates.push(vv.width, vv.height);
    }
    const longAxis = Math.max(...candidates);
    const shortAxis = Math.min(...candidates);
    stage.style.width = `${Math.round(longAxis)}px`;
    stage.style.height = `${Math.round(shortAxis)}px`;
  }

  function resize() {
    fitRotatedPortraitStage();
    cssW = stage.clientWidth; cssH = stage.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';

    // The editor reserves room for its panel — a side rail in landscape (the
    // horizontal room landscape gives you), a bottom sheet in portrait (PM
    // fit fix, 18-07-2026: was a raw min-width:860px breakpoint, which a
    // narrow LANDSCAPE phone like 844x390 fell under and got the sheet,
    // eating ~60% of its height for a postage-stamp arena — wrong axis to
    // gate on. Real devices only ever reach this view in landscape (the
    // portrait rotation is capability-aware, so orientation is the correct signal).
    let padR = 0, padB = 0, padT = 0;
    if (STATE.view === 'maker') {
      if (cssW > cssH) padR = 340; else padB = Math.min(Math.round(cssH * 0.46), 360);
      padT = 52;
    } else {
      // Event view fit (PM fit fix, 18-07-2026 — CANON-DRIVEN CHANGE to the
      // signed-off M3 fit formula, not a screen-size patch; the M3 test
      // oracle is updated deliberately alongside this, see PLAN.md). The old
      // formula fit the arena against the FULL viewport with zero
      // reservation. The top chrome (wordmark + ticker) occupies a fixed
      // ~84px regardless of viewport (measured via getBoundingClientRect,
      // not guessed), and on any landscape-ish aspect — which is every real
      // device now that portrait is blocked — height is the binding fit
      // constraint, so the arena filled edge-to-edge: its top rows rendered
      // UNDER the chrome and its bottom row behind the disclaimer bar.
      // Reserve real space instead, the same principle Map Maker's padT
      // already used for its own top bar.
      padT = 92; padB = 40;
    }
    const availW = cssW - padR, availH = cssH - padT - padB;
    scale = Math.min(availW / Arena.W, availH / Arena.H);
    offX = (availW - Arena.W * scale) / 2;
    offY = padT + (availH - Arena.H * scale) / 2;
    if (STATE.view !== 'maker') {
      // Public Event: vertically source-normalised to the audited 43px tile
      // in the 576px footage frame, not an aspect-ratio-dependent map fit.
      scale = cssH * CFG.camera.source.tilePx / (CFG.camera.source.fieldH * CFG.tile);
      updateCamera();
    }
  }

  function updateCamera() {
    if (STATE.view === 'maker' || !window.Player) return;
    const viewW = cssW / scale, viewH = cssH / scale, a = CFG.camera.anchor;
    const maxCamX = Math.max(0, Arena.W - viewW);
    const maxCamY = Math.max(0, Arena.H - viewH);
    cameraX = Math.min(maxCamX, Math.max(0, Player.x - viewW * a.x));
    cameraY = Math.min(maxCamY, Math.max(0, Player.y - viewH * a.y));
    offX = -cameraX * scale;
    offY = -cameraY * scale;
  }

  function update(dt) {
    if (STATE.paused) return;

    // MAP MAKER: a test-play sandbox. No round clock, no score, no dummies —
    // one seeker so the tell and the Tag stay meaningful while you tune.
    if (STATE.view === 'maker') {
      STATE.repaintTime = MAKER.repaint;
      Player.update(dt);
      Seekers.update(dt);
      Tags.update(dt);
      Maker.update(dt);
      FX.update(dt);
      return;
    }

    if (Round.phase === 'over') { Round.update(dt); FX.update(dt); return; }  // freeze the scene
    STATE.repaintTime = Round.repaintTime();
    Player.update(dt);
    Hiders.update(dt);
    Seekers.update(dt);
    Tags.update(dt);
    Round.update(dt);
    FX.update(dt);
    if (Player.hidden) STATE.everHidden = true;
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fallback base only — the ground itself now draws FULL-BLEED inside the
    // world transform below (Concept Brief rule 3l, 20-07-2026: "kill the
    // letterbox completely" — Tessa rejected the old screen-space dimmed/
    // blurred "skirt" as a visible arena rectangle sitting in a void, which
    // reads nothing like Brawl. This fill only shows for a frame before the
    // floor image decodes, or never, on a loaded page).
    ctx.fillStyle = '#171B33'; ctx.fillRect(0, 0, cssW, cssH);

    const maker = STATE.view === 'maker';
    if (!maker) {
      if (Round.phase === 'over') {
        const panelSafe = (cssW >= 700 && cssH < 600) ? 300 : (cssW >= 900 ? 420 : 0);
        const availW = cssW - panelSafe, availH = cssH - 132;
        scale = Math.min(availW / Arena.W, availH / Arena.H);
        offX = (availW - Arena.W * scale) / 2; offY = 92 + (availH - Arena.H * scale) / 2;
      } else updateCamera();
    }
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
    // The world-space rect that exactly covers the full CSS canvas at the
    // current fit — same undimmed ground continues past the playable Arena
    // bounds in every direction, so there's no rectangle edge to see: the
    // boundary reads through where wall/water/entities stop, never through a
    // visible frame. (rule 3l law 1)
    const bleed = {
      x0: -offX / scale, y0: -offY / scale,
      x1: (cssW - offX) / scale, y1: (cssH - offY) / scale,
    };
    const drawnBleed = clampToWorldRect(bleed);
    paintWorldBoundaryOutOfView(ctx, bleed, drawnBleed);
    if (window.Assets && Assets.get('world_plate') && !blockoutActive && Arena.drawOccupiedBushTreatment && Round.phase !== 'over') Arena.drawOccupiedBushTreatment(ctx);
    if (Round.phase === 'over' && Arena.resetBushTreatmentFrame) Arena.resetBushTreatmentFrame();
    Arena.draw(ctx, tSec, drawnBleed);                    // atomic native world canvas is the sole ground source
    FX.draw(ctx);
    if (maker) Arena.drawCamoOverlay(ctx);

    // Camera-tilt draw order (engineering pass, 18-07-2026): walls and
    // entities are merged into ONE list, sorted by ground-contact Y, and
    // drawn in that order — a tall block correctly occludes what's further
    // from the camera (drawn first, wall paints over it) while anything
    // nearer (drawn after) paints over the wall's own base. Art + draw order
    // ONLY (Concept Brief rule 3d) — collision, mechanics and the fit
    // geometry are untouched; this changes what's painted where, not what
    // collides or scores. See Arena.wallDrawables() for the wall side.
    const drawables = (window.Assets && Assets.get('world_plate') && !blockoutActive) ? Arena.plateForegroundDrawables() : (Arena.isTruthPatch
      ? Arena.truthPatchDrawables()
      : Arena.wallDrawables().concat(Arena.bushCanopyDrawables(), Arena.propDrawables()));
    if (Round.phase !== 'over') {
      for (const d of Hiders.list) drawables.push({ y: d.y + d.r, draw: (c) => Render.drawHider(c, d, tSec, false) });
      for (const s of Seekers.list) drawables.push({ y: s.y + s.r, draw: (c) => Render.drawSeeker(c, s, tSec) });
      drawables.push({ y: Player.y + Player.r, draw: (c) => Render.drawPlayer(c, tSec) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw(ctx);
    if (window.Assets && Assets.get('world_plate') && !blockoutActive && Arena.drawCanopyAfterActors) Arena.drawCanopyAfterActors(ctx);
    if (window.Debug && Debug.on) { Arena.drawCollisionOverlay(ctx); Arena.drawPropColliders(ctx); }

    // Map Maker's "which surfaces camouflage you" scrim (M3, signed off) now
    // draws AFTER the interleave rather than strictly between walls and
    // entities — those two are merged now, so a clean split isn't possible.
    // Flagged consequence, not silent: the low-alpha scrim can lightly tint
    // entities in the maker sandbox too; it never appears in the Event view.
    Tags.draw(ctx);
    if (!maker) Reveal.frame(ctx, tSec);           // dim + reveal markers when over

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);        // screen space
    if (!maker && Round.phase === 'over' && Round.overT < Reveal.delay()) {
      if (Round.result.reason === 'spotted') Render.drawSpotted(ctx, cssW, cssH, Round.overT);
      else if (Round.result.reason === 'tagged-out') Render.drawTaggedOut(ctx, cssW, cssH, Round.overT);
    }

    hud();
    if (window.Debug && Debug.on) Debug.frame();
    renderSerial++;
  }

  function clampToWorldRect(bleed) {
    return {
      x0: Math.max(0, Math.min(bleed.x0, Arena.W)),
      y0: Math.max(0, Math.min(bleed.y0, Arena.H)),
      x1: Math.max(0, Math.min(bleed.x1, Arena.W)),
      y1: Math.max(0, Math.min(bleed.y1, Arena.H)),
    };
  }

  function paintWorldBoundaryOutOfView(ctx, bleed, drawnBleed) {
    if (
      drawnBleed.x0 === bleed.x0 &&
      drawnBleed.y0 === bleed.y0 &&
      drawnBleed.x1 === bleed.x1 &&
      drawnBleed.y1 === bleed.y1
    ) return;

    ctx.save();
    ctx.fillStyle = 'rgba(23, 27, 51, 0.86)';
    if (bleed.x0 < drawnBleed.x0) ctx.fillRect(bleed.x0, bleed.y0, drawnBleed.x0 - bleed.x0, bleed.y1 - bleed.y0);
    if (drawnBleed.x1 < bleed.x1) ctx.fillRect(drawnBleed.x1, bleed.y0, bleed.x1 - drawnBleed.x1, bleed.y1 - bleed.y0);
    if (bleed.y0 < drawnBleed.y0) ctx.fillRect(drawnBleed.x0, bleed.y0, drawnBleed.x1 - drawnBleed.x0, drawnBleed.y0 - bleed.y0);
    if (drawnBleed.y1 < bleed.y1) ctx.fillRect(drawnBleed.x0, drawnBleed.y1, drawnBleed.x1 - drawnBleed.x0, bleed.y1 - drawnBleed.y1);
    ctx.restore();
  }

  // ---- HUD ---------------------------------------------------------------
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function hud() {
    // MAP MAKER keeps its teaching state chip — it's a debug/sandbox surface,
    // not real gameplay chrome, so the muscle-memory ruling below doesn't
    // apply to it (Concept Brief rule 3k).
    if (STATE.view === 'maker') {
      elStatus.style.setProperty('--p', Math.min(Player.progress || 0, 1));
      const p = Player;
      let cls = '', txt = '';
      if (p.hidden) { cls = 'hidden'; txt = 'Camouflaged'; }
      else if (p.progress > 0) { cls = 'hiding'; txt = 'Painting in...'; }
      else if (!p.camo && !p.lastMoving) { cls = 'nocamo'; txt = 'No camo surface here'; }
      elStatus.className = txt ? cls + ' visible' : '';
      elStatusLabel.textContent = txt;
      return;
    }

    // Event view (rule 3k, 20-07-2026 — "no one looks at their control
    // buttons when they play, it's all muscle memory"): camo state reads on
    // the brawler itself (paint fill + the FX.youAreHere pulse in render.js),
    // never in this slot. The bottom-right badge is controls-only — a Tag
    // fire button once M5 adds the seeker role; until then it's the empty,
    // disabled attack slot a hider's footage shows (no ring, no label).
    const over = Round.phase === 'over';
    elStatus.className = over ? 'over' : 'disabled visible';
    elStatusLabel.textContent = '';
    if (STATE.everHidden) elHint.classList.add('dim');

    // in-game overlays (rule 3j — two sparse plates, not a chrome chip row;
    // repaint time and the camp-decay coin dropped from persistent display,
    // conveyed instead by the camo badge's own live fill)
    // Wording matches her own footage's exact HUD copy ("Brawlers left: N",
    // top-left plate — confirmed frame-by-frame, contact sheet t=36-66s) —
    // "left" is real Brawl grammar, not an invented label; plural still
    // needs its own agreement (her fixed "Brawlers" sidesteps it, ours can't
    // since hiders/seekers are two separate countable rows).
    document.getElementById('tk-score').textContent = Math.round(Round.score).toLocaleString();
    const nHide = Round.hidersAlive();
    document.getElementById('tk-hiders').textContent = nHide;
    document.getElementById('tk-hiders-lbl').textContent = (nHide === 1 ? 'hider' : 'hiders') + ' left';
    // Seekers-remaining: makes the tag budget legible, so TAGGED OUT! reads
    // (v12, canon v3.4). Goes low/magenta when only one seeker is left on the map.
    const nSeek = Seekers.active().length;
    document.getElementById('tk-seekers').textContent = nSeek;
    document.getElementById('tk-seekers-lbl').textContent = (nSeek === 1 ? 'seeker' : 'seekers') + ' left';
    document.getElementById('tk-seekrow').classList.toggle('low', Round.phase === 'seek' && nSeek <= 1);
    const tl = Round.timeLeft();
    document.getElementById('tk-time').textContent = fmt(tl);
    document.getElementById('tk-timerow').classList.toggle('low', tl <= 15);

    // phase banner
    if (Round.phase !== lastPhase) {
      if (Round.phase === 'seek') { showBanner('SEEKER RELEASED', 'run - hide - reposition'); bannerT = 1.7; }
      lastPhase = Round.phase;
    }
    if (over) {
      elBanner.classList.remove('show');   // never let a banner sit over the reveal map
      elHint.classList.add('dim');
      bannerT = 0;
    } else if (Round.phase === 'hide') {
      showBanner('HIDE!', `seeker releases in ${Math.ceil(Round.hideTimeLeft())}s`);
    } else if (bannerT > 0) {
      bannerT -= lastDt;
      if (bannerT <= 0) elBanner.classList.remove('show');
    }
    // the reveal map is the shareable artefact — keep the overlays + pace off it
    elOvLeft.classList.toggle('hidden', over);
    elOvRight.classList.toggle('hidden', over);
    if (elPace) elPace.classList.toggle('hidden', over);

    // reposition bonus flash
    if (Round.bonusFlash > 0 && !bonusArmed) {
      bonusArmed = true;
      elBonus.textContent = `+${TUNING.hider.repositionBonus}`;
      elBonus.classList.remove('show'); void elBonus.offsetWidth; elBonus.classList.add('show');
    }
    if (Round.bonusFlash <= 0) bonusArmed = false;
  }
  function showBanner(main, sub) {
    if (/[\u00c3\u00c2\u00e2]/.test(sub)) sub = 'run - hide - reposition';
    elBanner.innerHTML = `<span class="main">${main}</span><small>${sub}</small>`;
    elBanner.classList.add('show');
  }

  // ---- loop --------------------------------------------------------------
  function frame(now) {
    // Paused mode is a deterministic capture state: explicit Game.renderNow()
    // and Game.pose() calls own the next frame, while the RAF heartbeat stays
    // idle. This prevents background paints from racing fixed-crop oracles.
    if (STATE.paused) { requestAnimationFrame(frame); return; }
    if (!last) last = now;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    lastDt = dt;
    tSec += STATE.paused ? 0 : dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function newRound() {
    if (Arena.clearBushTreatmentForNewRound) Arena.clearBushTreatmentForNewRound();
    Round.reset();
    Reveal.hidePanel();
    lastPhase = 'hide'; bannerT = 0; bonusArmed = false;
    elBanner.classList.remove('show');
    // Reveal changes the fit for the results panel. Restore the normal
    // follow-camera transform before the first frame of the new round.
    resize();
    updateCamera();
  }

  function start() {
    stage = document.getElementById('stage');
    canvas = document.getElementById('game');
    try { ctx = canvas.getContext('2d', { willReadFrequently: true }); }
    catch (e) { ctx = canvas.getContext('2d'); }
    if (!ctx) ctx = canvas.getContext('2d');
    elHint = document.getElementById('hint');
    elStatus = document.getElementById('status');
    elStatusLabel = document.getElementById('status-label');
    // Swap the emoji placeholder for the generated paint-brush glyph
    // (footage/reference batch, 18-07-2026) once it's actually loaded —
    // non-breaking: on any failure the emoji stays exactly as it was.
    const iconTest = new Image();
    iconTest.onload = () => {
      const holder = document.getElementById('status-icon');
      if (holder) holder.replaceWith(Object.assign(document.createElement('img'), { src: iconTest.src, id: 'status-icon', alt: '' }));
    };
    iconTest.src = 'assets/ui/camo_icon.png';
    elBanner = document.getElementById('banner');
    elBonus = document.getElementById('bonus');
    elOvLeft = document.getElementById('ov-left');
    elOvRight = document.getElementById('ov-right');
    elPace = document.getElementById('pace');

    newRound();
    resize();
    addEventListener('resize', resize);
    addEventListener('orientationchange', () => setTimeout(resize, 60));
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', resize);
      visualViewport.addEventListener('scroll', resize);
    }
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { STATE.reduceMotion = e.matches; });

    document.getElementById('replay').addEventListener('click', newRound);
    document.body.classList.toggle('truth-patch', !!Arena.isTruthPatch);
    const stamp = document.querySelector('.stamp');
    const concept = document.querySelector('.concept');
    if (concept) concept.title = 'Unofficial fan concept - not a real in-game screenshot';
    const cleanText = { '#mk-back': '< Event', '.mk-map': 'Fresh Paint - 50 x 27 - camouflage properties', '#mk-warn': 'No surface camouflages - nobody can hide on this map.', '.mk-note': 'Changes apply live. Move, stop, vanish - every map sets its own rules.', '.disclaimer': 'Fan concept by Tessa Kerk - unofficial, not endorsed by Supercell - Fan Content Policy' };
    for (const [sel, value] of Object.entries(cleanText)) { const el = document.querySelector(sel); if (el) el.textContent = value; }
    if (stamp) stamp.textContent = `V${CFG.BUILD.n} - ${CFG.BUILD.milestone}`;

    if (window.Maker) Maker.init();                 // wires the editor panel (+ ?view=maker)
    if (new URLSearchParams(location.search).has('debug') && window.Debug) Debug.init();
    requestAnimationFrame(frame);
  }

  // A18 §4.2 / §C1 step (vi) / Gate 0: on staged-bundle validation failure,
  // boot STOPS with an unmistakable, full-screen error — it never silently
  // serves the old arena while a ?blockout=1 tab sits open (the exact
  // QA-signs-off-the-wrong-build risk the corrected spec closes). Rendered
  // with plain DOM/inline styles, not canvas — must be visible even though
  // start() (and therefore the whole render loop) never runs.
  function showFatalStagingError(reason) {
    console.error('BLOCKOUT STAGING VALIDATION FAILED — boot stopped, start() never called. Reason:', reason);
    const el = document.createElement('div');
    el.id = 'blockout-fatal-error';
    el.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:99999', 'background:#3a0d16', 'color:#F6F4EF',
      "font:16px/1.5 'Nunito Sans', ui-monospace, monospace", 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'text-align:center', 'padding:24px', 'gap:12px',
    ].join(';'));
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    el.innerHTML =
      '<div style="font:bold 28px \'Lilita One\', ui-monospace, monospace; color:#FF4FA0;">STAGING VALIDATION FAILED</div>' +
      '<div>The staged (<code>?blockout=1</code>) arena bundle failed its fail-closed integrity check and will not run.</div>' +
      '<div style="opacity:.85; max-width:640px; font-family:ui-monospace, monospace; font-size:13px;">' + esc(reason) + '</div>' +
      '<div style="opacity:.6;">Deliberate, per A18 §4.2 / Gate 0: a mismatch never silently falls back to the ordinary arena.</div>';
    document.body.appendChild(el);
  }

  function boot() {
    const fonts = (document.fonts && document.fonts.load)
      ? Promise.race([
        Promise.all([document.fonts.load("400 20px 'Lilita One'"), document.fonts.ready]),
        new Promise((r) => setTimeout(r, 1200)),
      ])
      : Promise.resolve();
    const assets = window.Assets?.ready || Promise.resolve({ ok: true });
    // A18 §C1 step (v): extends the 2-promise Promise.all to 3. On the
    // ordinary (non-blockout) path, __blockoutValidation resolves {ok:true}
    // immediately (blockout-validate.js's own early-return) — zero added
    // latency, unaffected behaviour.
    const blockoutValidation = window.__blockoutValidation || Promise.resolve({ ok: true });
    Promise.all([fonts, assets, blockoutValidation]).then(([, assetState, blockoutState]) => {
      if (assetState && assetState.ok === false) console.warn('Some approved art failed to decode; using safe fallback.', assetState.failed);
      if (blockoutState && blockoutState.ok === false) {
        showFatalStagingError(blockoutState.reason);
        return; // start() is NEVER called on validation failure.
      }
      start();
    });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();

  // ---- Debug / capture API ----------------------------------------------
  window.Game = {
    get scale() { return scale; }, get off() { return { x: offX, y: offY }; },
    player() { return { x: Player.x, y: Player.y, screenX: Player.x * scale + offX, screenY: Player.y * scale + offY, renderSerial }; },
    renderNow() { render(); return renderSerial; },
    step(dt=1/60) { update(dt); render(); return renderSerial; },
    get camera() { return { x: cameraX, y: cameraY, anchor: CFG.camera.anchor, clampedTop: cameraY === 0 }; },
    pause() { STATE.paused = true; }, resume() { STATE.paused = false; last = 0; },
    setReduceMotion(b) { STATE.reduceMotion = !!b; },
    newRound,
    refit: resize,
    setSpeed(s) { STATE.speedScale = (s > 0 && s <= 2) ? s : STATE.speedScale; },
    skipHide() { Round.elapsed = Math.max(Round.elapsed, TUNING.round.hidePhase); Round.phase = 'seek'; },
    pose({ col, row, progress = 0, facing = 1, moving = false, vx = null, vy = null } = {}) {
      const T = Arena.T;
      if (col != null) { Player.x = col * T + T / 2; Player.y = row * T + T / 2; }
      Player.vx = moving ? (vx == null ? Player.speed : vx) : 0;
      Player.vy = moving ? (vy == null ? 0 : vy) : 0;
      Player.lastMoving = !!moving;
      Player.facing = facing;
      Player.camo = Arena.camoSurface(Player.x, Player.y, Player.h);
      Player.still = progress * STATE.repaintTime;
      Player.progress = Math.min(progress, 1);
      Player.hidden = Player.progress >= 1;
      render();
      return { x: Player.x, y: Player.y, screenX: Player.x * scale + offX, screenY: Player.y * scale + offY, renderSerial };
      STATE.paused = true;
    },
  };
})();
