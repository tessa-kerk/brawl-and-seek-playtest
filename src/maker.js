/* Brawl & Seek — the MAP MAKER view. The pitch's money shot: camouflage as a
 * tunable map property, not a sentence in a deck. The same arena sits in an
 * editor frame with FOUR properties that change the mechanic LIVE, with no
 * restart — flip a toggle and the next second of play obeys it.
 *
 *   • Camo surfaces  — which surfaces paint a hider in (walls / floor / water /
 *     bush — bush added art pass 18-07-2026, a real Brawl hiding verb, not
 *     decoration; priority wall > bush > water > floor)
 *   • Repaint time   — how long stillness takes to hide you (0.5 / 1 / 2s)
 *   • Ripple tell    — do hidden brawlers ripple when someone moves close
 *
 * It's a test-play sandbox, not a round: one bot seeker patrols so the tell and
 * the Tag stay meaningful, and being tagged just respawns you. */
(function () {
  const DEFAULTS = { surfaces: { wall: true, floor: true, water: true, bush: true }, repaint: 1.0, ripple: true };
  const M = { surfaces: { ...DEFAULTS.surfaces }, repaint: DEFAULTS.repaint, ripple: DEFAULTS.ripple };

  let toastT = 0, benchT = 0, el = {};

  // ---- push the panel's values into the live mechanic --------------------
  function apply() {
    STATE.camoSurfaces = { ...M.surfaces };
    STATE.rippleTell = M.ripple;
    if (STATE.view === 'maker') STATE.repaintTime = M.repaint;
    syncPanel();
  }

  // Per-surface tile counts (PM directive, 18-07-2026): computed once from
  // the live grid, not hard-coded — faithful to how the real Map Maker
  // works (a map's own tile mix decides what it can hide you in). A "0"
  // here is an honest report, not a bug — this Acid Lakes corner has no
  // bush tiles, and the count says so instead of hiding it.
  let counts = null;
  function tileCounts() {
    if (counts) return counts;
    counts = { wall: 0, floor: 0, water: 0, bush: 0 };
    for (let r = 0; r < Arena.rows; r++) for (let c = 0; c < Arena.cols; c++) counts[Arena.typeAt(c, r)]++;
    return counts;
  }

  function syncPanel() {
    const n = tileCounts();
    for (const b of document.querySelectorAll('.mk-surf')) {
      b.classList.toggle('on', !!M.surfaces[b.dataset.surface]);
      const count = n[b.dataset.surface] || 0;
      const badge = b.querySelector('.mk-count');
      if (badge) { badge.textContent = count + (count === 1 ? ' tile' : ' tiles'); badge.classList.toggle('zero', count === 0); }
    }
    for (const b of document.querySelectorAll('#mk-repaint button'))
      b.classList.toggle('on', parseFloat(b.dataset.repaint) === M.repaint);
    if (el.ripple) { el.ripple.classList.toggle('on', M.ripple); el.ripple.setAttribute('aria-checked', String(M.ripple)); }
    const none = !M.surfaces.wall && !M.surfaces.floor && !M.surfaces.water && !M.surfaces.bush;
    if (el.warn) el.warn.hidden = !none;
  }

  // ---- view switching ----------------------------------------------------
  function enter() {
    STATE.view = 'maker';
    Round.phase = 'seek';          // the seeker patrols; there is no round clock
    Hiders.list.length = 0;        // sandbox: no dummies, all attention on the property
    Player.reset(); Seekers.reset(); Tags.reset();
    for (const s of Seekers.list) { s.state = 'patrol'; s.hold = 1.2; }
    document.body.classList.add('maker');
    apply();
    Game.refit();
  }

  function exit() {
    STATE.view = 'event';
    STATE.camoSurfaces = { ...DEFAULTS.surfaces };   // the event runs canon rules
    STATE.rippleTell = true;
    document.body.classList.remove('maker');
    Game.newRound();
    Game.refit();
  }

  // ---- sandbox behaviour -------------------------------------------------
  function onTagged(h) {
    if (h !== Player) return;
    toast('TAGGED!');
    Player.reset();
    for (const s of Seekers.list) { s.hold = 1.4; s.target = null; s.targetPos = null; s.state = 'patrol'; }
  }
  function toast(text) { toastT = 1.5; if (el.toast) { el.toast.textContent = text; el.toast.classList.add('show'); } }

  function update(dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0 && el.toast) el.toast.classList.remove('show'); }
    // A benched seeker would leave an empty sandbox — put it back after a beat.
    const s = Seekers.list[0];
    if (s && s.state === 'spectator') {
      benchT += dt;
      if (benchT > 1.6) { s.health = TUNING.seeker.health; s.mistakes = 0; s.state = 'patrol'; s.hold = 0.6; benchT = 0; }
    } else benchT = 0;
  }

  // ---- wiring ------------------------------------------------------------
  function init() {
    el.panel = document.getElementById('makerpanel');
    el.toast = document.getElementById('mk-toast');
    el.ripple = document.getElementById('mk-ripple');
    el.warn = document.getElementById('mk-warn');

    // The tuning sandbox is HIDDEN behind the debug flag, not deleted
    // (Concept Brief rule 3j, 20-07-2026, Tessa): the public prototype is the
    // in-game event, pure — no Map Maker entry point on that surface. It
    // returns deliberately later (landing page, a second LinkedIn beat) and
    // stays fully functional + tested here — ?debug=1 or ?maker=1 reveals the
    // entry pill; ?view=maker still opens it directly either way (tests use
    // this path). Same established pattern as src/pace.js.
    const q = new URLSearchParams(location.search);
    const mkOpen = document.getElementById('mk-open');
    if (mkOpen && !(q.has('debug') || q.has('maker'))) mkOpen.style.display = 'none';

    document.getElementById('mk-open').addEventListener('click', enter);
    document.getElementById('mk-back').addEventListener('click', exit);

    for (const b of document.querySelectorAll('.mk-surf'))
      b.addEventListener('click', () => { M.surfaces[b.dataset.surface] = !M.surfaces[b.dataset.surface]; apply(); });

    for (const b of document.querySelectorAll('#mk-repaint button'))
      b.addEventListener('click', () => { M.repaint = parseFloat(b.dataset.repaint); apply(); });

    el.ripple.addEventListener('click', () => { M.ripple = !M.ripple; apply(); });

    document.getElementById('mk-reset').addEventListener('click', () => {
      M.surfaces = { ...DEFAULTS.surfaces }; M.repaint = DEFAULTS.repaint; M.ripple = DEFAULTS.ripple; apply();
    });

    syncPanel();
    if (new URLSearchParams(location.search).get('view') === 'maker') enter();
  }

  window.MAKER = M;
  window.Maker = { init, enter, exit, apply, update, onTagged, DEFAULTS };
})();
