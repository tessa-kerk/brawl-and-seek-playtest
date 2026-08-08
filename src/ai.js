/* Brawl & Seek — shared AI steering. Actors follow a BFS tile path from
 * Arena.path(), stepping through waypoint centres with the same move-and-slide
 * collision the player uses. Stall detection lets callers re-path when a route
 * goes bad. */
(function () {
  const T = CFG.tile;

  function setPath(a, tc, tr) {
    const from = Arena.tileOf(a.x, a.y);
    a.path = Arena.path(from.c, from.r, tc, tr) || [];
    a.wp = 0; a.goal = { c: tc, r: tr }; a.stall = 0;
  }
  function goTo(a, tile) { setPath(a, tile.c, tile.r); }
  const arrived = (a) => !a.path || a.wp >= a.path.length;

  /* Advance along the path, spending the whole frame's distance budget. Passing a
   * waypoint no longer costs a frame of standing still — that stutter made the
   * seeker's measured speed bimodal (half its frames read as "stationary"), which
   * silently disabled the sprint-blindness that keeps camouflage strong. */
  function step(a, dt, tilesPerSec) {
    if (arrived(a)) return false;
    let budget = tilesPerSec * T * dt;
    const want = budget;
    let travelled = 0, guard = 0;
    while (budget > 0.01 && !arrived(a) && guard++ < 4) {
      const wp = a.path[a.wp], c = Arena.centre(wp.c, wp.r);
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 3.5) { a.wp++; continue; }
      const s = Math.min(budget, d);
      const p = Arena.collide(a.x, a.y, (dx / d) * s, (dy / d) * s, a.h);
      const m = Math.hypot(p.x - a.x, p.y - a.y);
      if (dx) a.facing = dx > 0 ? 1 : -1;
      a.x = p.x; a.y = p.y;
      travelled += m; budget -= Math.max(m, 0.01);
      if (m < s * 0.5) break;                       // blocked — don't spin
    }
    a.stall = travelled < want * 0.3 ? (a.stall || 0) + dt : 0;
    return !arrived(a);
  }

  const tileDist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) / T;

  window.AI = { setPath, goTo, arrived, step, tileDist };
})();
