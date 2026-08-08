/* Brawl & Seek — the pace picker, now DEMOTED to a debug/capture affordance.
 *
 * It served its purpose: it let Tessa A/B the movement pace in the home-screen
 * PWA (no URL bar for ?speed=). She picked A (0.70), now baked into
 * TUNING.speedScale, so the default Event view no longer shows the picker. It
 * stays available for capture/tuning work behind ?debug=1 or ?pace=1 (and
 * ?speed=<n> still overrides live). Kept in its own file so it's easy to delete
 * entirely later. */
(function () {
  function init() {
    const el = document.getElementById('pace');
    if (!el || !window.STATE) return;
    const q = new URLSearchParams(location.search);
    const show = q.has('debug') || q.has('pace');
    if (!show) { el.style.display = 'none'; return; }   // baked: hidden by default

    const btns = [...el.querySelectorAll('#pace-seg button')];
    function sync() {
      for (const b of btns) b.classList.toggle('on', Math.abs(parseFloat(b.dataset.speed) - STATE.speedScale) < 0.001);
    }
    for (const b of btns) b.addEventListener('click', () => { STATE.speedScale = parseFloat(b.dataset.speed); sync(); });
    sync();
    window.Pace = { sync };
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
