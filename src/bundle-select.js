/* game/src/bundle-select.js — Gate 0 item 1 / A18 §C1 step (i).
 *
 * THE single source of bundle identity for the whole runtime. Every other
 * consumer (src/assets.js, src/arena.js, src/world.js, src/game.js) reads
 * `window.ARENA_BUNDLE` — none of them re-checks `?blockout=1` or any other
 * URL state independently. This is Gate 0's binding fix for the wiring
 * defect where asset loading / collision-mask selection / procedural
 * rendering / blockoutActive gating could each make their OWN flag check
 * and silently disagree (e.g. an old-grid render sitting on top of new-grid
 * collision, or vice versa).
 *
 * Runs synchronously, immediately after `data/arena.js` defines both
 * `window.ARENA_ORDINARY` and `window.ARENA_BLOCKOUT_CANDIDATE` (script
 * order in index.html) and before any other runtime script reads
 * `window.ARENA` — so `window.ARENA` is a real, complete object by the time
 * anything downstream (including `src/arena.js`'s own IIFE, which freezes
 * `const grid`/`rows`/`cols`/`PLAYABLE_TOP` closures the instant it parses —
 * see A18 §C1's "why the old loader order was impossible") looks at it.
 * Selection never relies on fetch/async timing for `window.ARENA`'s
 * existence (Gate 0 item 3) — grid/props/boundary-policy are plain JS
 * literals, so choosing between two already-defined ones needs no network
 * round-trip and can happen synchronously, unlike the mask PNGs' byte
 * integrity, which is necessarily async (see blockout-validate.js).
 *
 * PROMOTION (A18 §C9): flip DEFAULT_BUNDLE_NAME below from 'ordinary' to
 * 'blockout' to promote the staged bundle to the default, no-flag path.
 * That is the ENTIRE promotion change — the `?blockout=1` flag, this file,
 * `blockout-validate.js`, `ARENA_ORDINARY` and every `ARENA_BUNDLE`-gated
 * conditional all stay in place, unedited, in that same change. Flag/
 * machinery cleanup is a later, separately-verified change (A18 §C9),
 * never bundled into promotion.
 */
(function (root) {
  'use strict';

  // window.__TEST_FORCE_DEFAULT_BUNDLE__ is a TEST-ONLY seam (set via
  // Playwright's addInitScript before navigation, never by any production
  // code path — grep the repo, it is set nowhere else) that lets the
  // automated promotion simulation (tools/test_promotion_simulation.py)
  // prove bundle selection genuinely follows a PROMOTED DEFAULT, not the URL
  // flag, without hand-editing this file for the test and then reverting it.
  // It is consulted ONLY as a fallback for the default when no explicit
  // `?blockout=1` flag is present — an explicit flag always wins, exactly
  // like the real, un-test-seamed promotion path would behave.
  const DEFAULT_BUNDLE_NAME = root.__TEST_FORCE_DEFAULT_BUNDLE__ || 'ordinary';

  const params = new URLSearchParams(location.search);
  const flagPresent = params.get('blockout') === '1';
  const name = flagPresent ? 'blockout' : DEFAULT_BUNDLE_NAME;

  const bundle = name === 'blockout' ? root.ARENA_BLOCKOUT_CANDIDATE : root.ARENA_ORDINARY;
  if (!bundle) {
    // Defensive: should be impossible (data/arena.js always defines both),
    // but never leave window.ARENA silently undefined.
    throw new Error('bundle-select.js: bundle "' + name + '" is not defined by data/arena.js');
  }

  root.ARENA = bundle;
  root.ARENA_BUNDLE = {
    name,
    isBlockout: name === 'blockout',
    flagPresent,
    defaultBundleName: DEFAULT_BUNDLE_NAME,
  };
})(window);
