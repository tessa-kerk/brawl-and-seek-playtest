/* Brawl & Seek — the arena: grid parsing, collision, camo-surface lookup, and
 * the top-down tile rendering (chunky beveled walls, checkered floor, an aqua
 * pool) that has to read as "a Brawl-like arena" at a glance. */
(function () {
  const T = CFG.tile;
  const S = ARENA.surfaces;
  const grid = ARENA.grid.map((row) => row.split(''));
  const rows = grid.length, cols = grid[0].length;
  const W = cols * T, H = rows * T;
  // plateLayerCache/bushCoverAlpha/bushCoverKey/occupiedTargetCache/maskAlphaCache/
  // bushComponentTextureCache/bushWorldLayerCache/occupiedBushCells/bushTreatmentCache
  // moved into world.js's own closure in the Pass 0 extraction (04-08-2026): every one of
  // them is read/written only by the world-drawing functions that now live there, never by
  // arena.js's collision/navigation code. See PASS0-RECORD.md.
  // Directive 002's reference-locked fixture is deliberately query-gated.
  // It paints no cells into the 50×27 arena data and never alters collision.
  const truthMode = new URLSearchParams(location.search).get('truth') === '1';
  // Directive 002B: one contiguous source crop c7/r1 from 30.0s, translated
  // into this isolated fixture at world origin (10,9). No generated v37 unit
  // is used here; all geometry is deterministic and axis-aligned.
  const TRUTH = {
    horizontal: { cells: [[11,11],[12,11],[13,11]] },
    vertical: { cells: [[21,9],[21,10],[21,11]] },
    bush: [[10,12],[10,15],[11,15],[12,15],[13,15],[14,15]],
    lake: [[10,13],[11,13],[12,13],[13,13],[10,14],[11,14],[12,14],[13,14],[14,14],[11,15],[12,15],[13,15]],
    props: [
      { c: 10, r: 9, key: 'stump', rot: 0 }, { c: 16, r: 9, key: 'barrel_plain' },
      { c: 20, r: 10, key: 'barrel_cobweb' }, { c: 15, r: 11, key: 'bones_pair' },
      { c: 17, r: 11, key: 'bones_skull' }, { c: 20, r: 12, key: 'stump', rot: 20 },
      { c: 18, r: 15, key: 'bones_ribs' },
    ],
  };

  // V51 collision authority is derived from the approved source masks. Wall
  // cells below are the narrow ground-contact band sampled from the wall mask;
  // lake cells are the full lake mask footprint. Bushes, fossils and floor are
  // intentionally absent from this table and remain walkable.
  const SOURCE_WALL = [
    '..WWWW........................WWW.................',
    '..WWWW...............W.W......WWWW.......W........',
    'WWW..WWWW.WWWWWW.............................WWWWW',
    'WWW..WWWW..WWWW...........................WWWWWWWW',
    'W................................................W',
    '............WWW...............WW.......W..........',
    '..........................W...........WW..........',
    '...............WWW........W........W..WW..........',
    '......WW.......WWW.................W..WWW.....W...',
    '......WW.......W.....W..WWW.............W.........',
    '......WW.......WW.................................',
    '................................WW................',
    '...............................................WWW',
    '...............................................W..',
    '..........................WW...................W..',
    '...............................................W..',
    '...............................WWWWW...........W..',
    '..............WWW..............WWWWW...........W..',
    '...............................W..................',
    '................................WWWWW.............',
    '................................WWWWW.............',
    '..................................................',
    '....W.............................................',
    '....W.........W........................W..........',
    '....WW...W..............................W.........',
    '......W.WW.......................W....W..........W',
    '.........W........................................'
  ];
  const SOURCE_LAKE = [
    '..................................................','..................................................','..................................................','..................................................','..................................................',
    '....WWW....................................WWW....','..WWWWWW..................................WWWWWW..','..WWWWWW..................................WWWWWW..','...WWWW...................................WWWWWW..','............................................WW....',
    '..................................................','.......................WWW........................','.....................WWWWWWW......................','.................WW..WWWWWWW......................','.....................WWWWWWW......................','........WWW...........WWWW........................','.......WWWW.......................................','.......WWWW.......................................','..............WWW.................................','.............WWWWW................................','............WWWWWWWW.....................WWWW.....','...........WWWWWWWWW....................WWWWWWW...','............WWWWWWWW....................WWWWWWW...','.............WWWWW......................WWWWWW....','...............W..........................WWWW....','...........................................WW.....','..................................................'
  ];
  // Gate 0 item 1 (bundle identity = sole source of truth) / A18 §C2: read
  // ONCE, here, from window.ARENA_BUNDLE (set synchronously by
  // src/bundle-select.js, which runs before this file — see index.html
  // script order). Nothing below re-checks ?blockout=1 independently.
  const blockoutActive = !!(window.ARENA_BUNDLE && window.ARENA_BUNDLE.isBlockout);
  // BOUNDARY sources the decorative-row exclusion from whichever bundle was
  // selected, instead of a hardcoded "3". ARENA_ORDINARY.boundaryPolicy is
  // { decorativeRows: 3 }, byte-identical in behaviour to the old hardcoded
  // rule (r<=2 ⟺ r<3); ARENA_BLOCKOUT_CANDIDATE.boundaryPolicy is
  // { decorativeRows: 0 } per the adopted policy (amend_common.py's
  // BOUNDARY_POLICY). Every consumer below (isSolid, bodyInsidePlayableBounds,
  // the movement clamps in collide(), tileBlocked, free/hide-tile generation
  // via ensureNavigation's calls to tileBlocked, and the debug overlays)
  // already funnels through isDecorative/PLAYABLE_TOP and inherits the
  // active policy automatically — confirmed line-by-line, see A18 §C2 /
  // IMPL1-RECORD.md.
  const BOUNDARY = ARENA.boundaryPolicy || { decorativeRows: 3 };
  const isDecorative = (c, r) => inBounds(c, r) && r < BOUNDARY.decorativeRows;
  const isCorridorOpen = () => false;
  const isWall  = (c, r) => inBounds(c, r) && grid[r][c] === '#';
  const isWater = (c, r) => inBounds(c, r) && grid[r][c] === '~';
  // Bush (art pass, 18-07-2026): walkable, unlike walls — Tessa's ruling, a real
  // camo surface, not a collider. The map's true edge is now open floor/bush
  // (no border wall ring — see data/arena.js), so isSolid(out-of-bounds)=true
  // IS the arena's boundary; nothing else marks it.
  const isBush  = (c, r) => inBounds(c, r) && grid[r][c] === 'b';
  // The approved plate is 43 px per source cell; collision runs in CFG.tile
  // world pixels. Keep the hand-trace readable in source coordinates, then
  // convert it once at the boundary between data and runtime.
  const PROP_COLLIDERS = (ARENA.props || []).map((p) => ({
    ...p, x: p.x * T / 43, y: p.y * T / 43, radius: p.radius * T / 43,
  }));
  const EPS = 0.01;
  const PLAYABLE_TOP = BOUNDARY.decorativeRows * T;
  let sourceMaskCache = null;
  function shapeHitCircle(x,y,h){
    const shapes=(window.COLLISION&&COLLISION.shapes)||[];
    const pointIn=(px,py,pts)=>{let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j],hit=((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi||1e-9)+xi);if(hit)inside=!inside;}return inside;};
    const segDist=(px,py,ax,ay,bx,by)=>{const vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/(vx*vx+vy*vy||1)));return Math.hypot(px-(ax+t*vx),py-(ay+t*vy));};
    return shapes.some(s=>{if(s.shape!=='polygon'||!s.points)return false; if(pointIn(x,y,s.points))return true; for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[(i+1)%s.points.length];if(segDist(x,y,a[0],a[1],b[0],b[1])<h)return true;} return false;});
  }
  // SET ASIDE (Pass 0 punch list item 2a, 04-08-2026): "SDF still load-bearing
  // post-C9B?" — verified NOT load-bearing. Collision moved to the source-mask
  // hit-test (sourceHitCircle/shapeHitCircle above) under Directive 028AG-C9B;
  // sdfHitCircle is never called anywhere in the codebase, and sdfDistanceAt's
  // only caller was sdfHitCircle. Kept commented rather than deleted per the
  // reboot plan's hard line ("no deletes, set aside instead"). Also removed
  // from the window.Arena export below (an undefined identifier there would
  // throw). See PASS0-RECORD.md.
  // let sdfCache=null;
  // function sdfDistanceAt(x,y){
  //   const img=window.Assets&&Assets.get('world_collision_sdf');
  //   if(!img||!img.complete||!img.naturalWidth) return null;
  //   if(!sdfCache||sdfCache.img!==img){const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const q=c.getContext('2d');q.drawImage(img,0,0);sdfCache={img,data:q.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};}
  //   const fx=Math.max(0,Math.min(sdfCache.w-1,x*43/T)), fy=Math.max(0,Math.min(sdfCache.h-1,y*43/T));
  //   const x0=Math.floor(fx), y0=Math.floor(fy), x1=Math.min(sdfCache.w-1,x0+1), y1=Math.min(sdfCache.h-1,y0+1), tx=fx-x0, ty=fy-y0;
  //   const sample=(sx,sy)=>{const i=(sy*sdfCache.w+sx)*4; return ((sdfCache.data[i]<<8)|sdfCache.data[i+1])/16;};
  //   const top=sample(x0,y0)+(sample(x1,y0)-sample(x0,y0))*tx;
  //   const bottom=sample(x0,y1)+(sample(x1,y1)-sample(x0,y1))*tx;
  //   return top+(bottom-top)*ty;
  // }
  // const SDF_EPS_SOURCE = 0.01;
  // function sdfHitCircle(x,y,h){const d=sdfDistanceAt(x,y); if(d===null) return true; return d < h*43/T - SDF_EPS_SOURCE;}
  function tileOfSafe(x,y){return {c:Math.floor(x/T),r:Math.floor(y/T)};}
  function sourceMaskData() {
    // Gate 0 item 1: mask-key selection follows blockoutActive (bundle
    // identity), never a separate ?blockout=1 check. Ordinary path reads the
    // exact same keys as before this session — byte-unaffected.
    const wallKey = blockoutActive ? 'blockout_mask_wall' : 'world_mask_wall';
    const lakeKey = blockoutActive ? 'blockout_mask_lake' : 'world_mask_lake';
    const foliageKey = blockoutActive ? 'blockout_mask_foliage' : 'world_d025_bush_foreground';
    const wall = window.Assets && Assets.get(wallKey);
    const lake = window.Assets && Assets.get(lakeKey);
    const foliage = window.Assets && Assets.get(foliageKey);
    if (!wall || !lake || !foliage || !wall.complete || !lake.complete || !foliage.complete) return null;
    if (sourceMaskCache && sourceMaskCache.wall === wall && sourceMaskCache.lake === lake
        && sourceMaskCache.foliage === foliage) return sourceMaskCache;
    const read = (img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      return { data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };
    const wallPx = read(wall), lakePx = read(lake), foliagePx = read(foliage);
    const contact = new Uint8Array(wallPx.w * wallPx.h);
    const maxRows = Math.min(rows, Math.floor(wallPx.h / 43));
    const maxCols = Math.min(cols, Math.floor(wallPx.w / 43));

    // Wall/fence collision is the seven-source-pixel ground-contact band of
    // authored wall cells. Complete foliage-owned pixels are subtracted before
    // the band is built; semantic floor/fossils never become wall collision.
    for (let r = 0; r < maxRows; r++) for (let c = 0; c < maxCols; c++) {
      if (!isWall(c, r)) continue;
      const x0 = c * 43, x1 = Math.min(wallPx.w, x0 + 43);
      const y0 = r * 43, y1 = Math.min(wallPx.h, y0 + 43);
      for (let sx = x0; sx < x1; sx++) {
        let bottom = -1;
        for (let sy = y0; sy < y1; sy++) {
          const i = (sy * wallPx.w + sx) * 4;
          const wallOn = Math.max(wallPx.data[i], wallPx.data[i + 1], wallPx.data[i + 2]) > 20;
          const foliageOwned = foliagePx.data[i + 3] > 16;
          if (wallOn && !foliageOwned) bottom = sy;
        }
        if (bottom < 0) continue;
        for (let sy = Math.max(y0, bottom - 6); sy <= bottom; sy++) {
          const i = (sy * wallPx.w + sx) * 4;
          if (foliagePx.data[i + 3] <= 16) contact[sy * wallPx.w + sx] = 1;
        }
      }
    }
    sourceMaskCache = { wall, lake, foliage, wallPx, lakePx, foliagePx, contact };
    return sourceMaskCache;
  }
  function sourcePixel(mask, sx, sy) {
    const x=Math.max(0,Math.min(mask.w-1,Math.floor(sx))), y=Math.max(0,Math.min(mask.h-1,Math.floor(sy))), i=(y*mask.w+x)*4;
    return Math.max(mask.data[i],mask.data[i+1],mask.data[i+2]) > 20;
  }
  function sourceSolidPixel(m, sx, sy) {
    const x = Math.floor(sx), y = Math.floor(sy);
    if (x < 0 || y < 0 || x >= m.wallPx.w || y >= m.wallPx.h) return true;
    // Lakes are deliberately tested first and are never removed by foliage.
    if (sourcePixel(m.lakePx, x, y)) return true;
    return m.contact[y * m.wallPx.w + x] !== 0;
  }
  function sourceContactAt(x,y) {
    const m=sourceMaskData(); if(!m) return null;
    return sourceSolidPixel(m, x * 43 / T, y * 43 / T);
  }
  function sourceHitCircle(x,y,h) {
    const m=sourceMaskData(); if(!m) return null;
    const cx=x*43/T, cy=y*43/T, radius=h*43/T;
    const sx0=Math.floor(cx-radius),sx1=Math.ceil(cx+radius);
    const sy0=Math.floor(cy-radius),sy1=Math.ceil(cy+radius);
    const rr=radius*radius;
    for(let sy=sy0;sy<=sy1;sy++) for(let sx=sx0;sx<=sx1;sx++){
      const dx=Math.max(0,Math.abs(sx+.5-cx)-.5);
      const dy=Math.max(0,Math.abs(sy+.5-cy)-.5);
      if(dx*dx+dy*dy>rr) continue;
      if(sourceSolidPixel(m,sx,sy)) return true;
    }
    return false;
  }
  const isSolid = (c, r) => {
    if (!inBounds(c,r) || isDecorative(c,r)) return true;
    return !isPlayableBody(c*T+T/2,r*T+T/2,CFG.playerRadius*T);
  };
  function inBounds(c, r) { return c >= 0 && r >= 0 && c < cols && r < rows; }

  // BS-013: pad-authoritative spawn candidates and deterministic round-seeded
  // radial spread. Pads are read from TUNING.spawn.pads and are used exactly
  // once each round in a round-local order.
  const SPREAD_SEED_MUL = 1664525;
  const SPREAD_SEED_ADD = 1013904223;
  const SPAWN_PADS = Array.isArray(TUNING.spawn && TUNING.spawn.pads)
    ? TUNING.spawn.pads
      .filter((p) => Array.isArray(p) && p.length === 2)
      .map(([c, r]) => ({ c: Number(c), r: Number(r) }))
      .filter((p) => Number.isFinite(p.c) && Number.isFinite(p.r) && inBounds(p.c, p.r))
    : [];
  let spawnSequence = [];
  let spawnCursor = 0;
  let spawnSeed = 0;
  const spawnPadCentre = ({ c, r }) => centre(c, r);

  function lcg(seed) {
    return function nextRand() {
      seed = (Math.imul(seed, SPREAD_SEED_MUL) + SPREAD_SEED_ADD) >>> 0;
      return seed / 0x100000000;
    };
  }

  function sortPadsForSpread(seed) {
    if (!SPAWN_PADS.length) return [];
    const pads = SPAWN_PADS.map((p) => ({ ...p }));
    const rnd = lcg(seed >>> 0);
    const ordered = [];
    const pool = pads.slice();
    const start = Math.floor(rnd() * pool.length);
    ordered.push(pool.splice(start, 1)[0]);
    while (pool.length) {
      let best = 0;
      let bestScore = -1;
      let bestJitter = -1;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        let minDist = Infinity;
        for (const q of ordered) {
          const dc = p.c - q.c, dr = p.r - q.r;
          const d = dc * dc + dr * dr;
          if (d < minDist) minDist = d;
        }
        const t = rnd();
        const score = minDist + t * 1e-6;
        if (score > bestScore || (score === bestScore && t > bestJitter)) {
          bestScore = score;
          bestJitter = t;
          best = i;
        }
      }
      ordered.push(pool.splice(best, 1)[0]);
    }
    return ordered;
  }

  function prepareSpawnCycle(seed) {
    spawnSeed = Number.isFinite(seed) ? (seed >>> 0) : 0;
    spawnCursor = 0;
    spawnSequence = sortPadsForSpread(spawnSeed);
    if (!spawnSequence.length) spawnSequence = [{ c: 0, r: BOUNDARY.decorativeRows }];
    // The farthest-first order only varies between seeds via its random start
    // pad (a 1-in-N collision for any seed pair). Rotating by seed % N keeps
    // the spread-ordering property for partial consumption while guaranteeing
    // neighbouring seeds assign actors to different pads.
    const rot = spawnSeed % spawnSequence.length;
    spawnSequence = spawnSequence.slice(rot).concat(spawnSequence.slice(0, rot));
  }

  function reserveSpawnPad() {
    if (!spawnSequence.length) prepareSpawnCycle(spawnSeed + 1);
    const next = spawnSequence[spawnCursor % spawnSequence.length];
    spawnCursor += 1;
    return spawnPadCentre(next);
  }

  function defaultSpawnPoint() {
    const h = CFG.playerRadius * T;
    for (const { c, r } of SPAWN_PADS) {
      const p = centre(c, r);
      if (isPlayableBody(p.x, p.y, h)) return p;
    }
    // A18 §C2 / Gate 0 item 3: this was a THIRD, independently-hardcoded "3"
    // — separate from isDecorative/PLAYABLE_TOP, and would have kept
    // skipping rows 0-2 in the fallback scan even under blockout mode
    // (decorativeRows:0) if left as-is. Now inherits BOUNDARY like every
    // other consumer.
    for (let r = BOUNDARY.decorativeRows; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = centre(c, r);
      if (isPlayableBody(p.x, p.y, h)) return p;
    }
    return null;
  }
  function spawn() {
    if (truthMode) return centre(16, 13);
    ensureNavigation();
    const p = truthMode ? centre(16, 13) : reserveSpawnPad();
    if (!p) {
      return navigationSpawn || defaultSpawnPoint() || { x: W / 2, y: PLAYABLE_TOP + CFG.playerRadius * T };
    }
    return isPlayableBody(p.x, p.y, CFG.playerRadius * T)
      ? { x: p.x, y: p.y }
      : defaultSpawnPoint() || navigationSpawn || { x: W / 2, y: PLAYABLE_TOP + CFG.playerRadius * T };
  }
  function bodyInsidePlayableBounds(x, y, r) {
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r)
      && x - r >= EPS && x + r <= W - EPS
      && y - r >= PLAYABLE_TOP + EPS && y + r <= H - EPS;
  }
  function isPlayableBody(x, y, r=CFG.playerRadius*T, exceptProp=null) {
    if (!bodyInsidePlayableBounds(x, y, r)) return false;
    const sourceHit = sourceHitCircle(x, y, r);
    if (sourceHit === null || sourceHit) return false;
    return !overlapsProp(x, y, r, exceptProp);
  }
  function safeActorPosition(x,y,r=CFG.playerRadius*T) {
    return isPlayableBody(x,y,r) ? {x,y} : null;
  }

  /* Move-and-slide tile collision. Two fully DECOUPLED axis passes so a wall on
   * one axis can never eat movement on the free axis (the bug that pinned a
   * hider in a 1-wide corridor and reported "blocked X:YES Y:YES" while pushing
   * into open space):
   *   1. Move X, resolve against tiles overlapping the ORIGINAL y-band [py±h].
   *   2. Move Y, resolve against tiles overlapping the RESOLVED x-band [x±h].
   * No path reverts the whole move or re-clamps into the prior contact point. */
  function overlapsTileSolid(x, y, h) {
    if (!bodyInsidePlayableBounds(x, y, h)) return true;
    const hit = sourceHitCircle(x, y, h);
    return hit === null ? true : hit;
  }
  function overlapsProp(x, y, h, except = null) {
    return PROP_COLLIDERS.some((p) => p !== except && Math.hypot(x - p.x, y - p.y) < h + p.radius - EPS);
  }
  function isSolidAt(x, y, h = 0) { return !isPlayableBody(x, y, h); }
  function resolvePropAxis(x, y, previous, h, axis) {
    for (let pass = 0; pass < 4; pass++) for (const p of PROP_COLLIDERS) {
      const reach = h + p.radius;
      const ox = x - p.x, oy = y - p.y;
      if (ox * ox + oy * oy >= (reach - EPS) * (reach - EPS)) continue;
      const perpendicular = axis === 'x' ? oy : ox;
      const squared = reach * reach - perpendicular * perpendicular;
      if (squared <= 0) continue;
      const delta = Math.sqrt(squared);
      const prior = axis === 'x' ? previous.x - p.x : previous.y - p.y;
      const candidate = axis === 'x'
        ? { x: p.x + (prior <= 0 ? -delta : delta), y }
        : { x, y: p.y + (prior <= 0 ? -delta : delta) };
      if (isPlayableBody(candidate.x, candidate.y, h, p)) { x = candidate.x; y = candidate.y; }
      else if (axis === 'x') x = previous.x;
      else y = previous.y;
    }
    return { x, y };
  }

  function collide(px, py, dx, dy, h) {
    let x = Math.max(h + EPS, Math.min(W - h - EPS, px));
    let y = Math.max(PLAYABLE_TOP + h + EPS, Math.min(H - h - EPS, py));
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(2, h * .28)));
    const sx = dx / steps, sy = dy / steps;
    for (let n = 0; n < steps; n++) {
      if (sx !== 0) {
        const prior = { x, y };
        const nx = Math.max(h + EPS, Math.min(W - h - EPS, x + sx));
        if (!overlapsTileSolid(nx, y, h)) {
          x = nx;
          ({ x, y } = resolvePropAxis(x, y, prior, h, 'x'));
        }
      }
      if (sy !== 0) {
        const prior = { x, y };
        const ny = Math.max(PLAYABLE_TOP + h + EPS, Math.min(H - h - EPS, y + sy));
        if (!overlapsTileSolid(x, ny, h)) {
          y = ny;
          ({ x, y } = resolvePropAxis(x, y, prior, h, 'y'));
        }
      }
    }
    return { x, y };
  }

  /* Which surface does a hider at (px,py) paint into? Priority wall > bush >
   * water > floor (art pass, 18-07-2026, PM-approved): hugging solid cover
   * beats standing in foliage beats sitting by the pond beats open floor.
   * Returns {type, color}. Floor returns the exact checker shade underfoot so
   * the blend is pixel-honest. */
  /* Which surfaces paint you is a MAP PROPERTY (the Map Maker toggle), so this
   * reads STATE.camoSurfaces rather than assuming all four. Returns null when
   * nothing here qualifies — stand there all day and you'll never vanish. */
  const enabled = () => (window.STATE && STATE.camoSurfaces) || { wall: true, floor: true, water: true, bush: true };

  function camoSurface(px, py, h) {
    const en = enabled();
    const pad = T * 0.42;             // reach a touch beyond the body to "hug"
    const c0 = Math.floor((px - h - pad) / T), c1 = Math.floor((px + h + pad) / T);
    const r0 = Math.floor((py - h - pad) / T), r1 = Math.floor((py + h + pad) / T);
    let bush = null, water = null;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (en.wall && isWall(c, r)) return { type: 'wall', color: S.wallTop };
      if (en.bush && !bush && isBush(c, r)) bush = { type: 'bush', color: S.bush };
      if (en.water && !water && isWater(c, r)) water = { type: 'water', color: S.water };
    }
    if (bush) return bush;
    if (water) return water;
    if (!en.floor) return null;
    const cc = Math.floor(px / T), cr = Math.floor(py / T);
    return { type: 'floor', color: ((cc + cr) & 1) ? S.floorB : S.floorA };
  }

  const typeAt = (c, r) => (grid[r][c] === '#' ? 'wall' : grid[r][c] === '~' ? 'water' : grid[r][c] === 'b' ? 'bush' : 'floor');

  /* Map Maker only: show, at a glance, which surfaces camouflage you. Enabled
   * surfaces glow teal; disabled ones fall under a scrim. Flip a toggle and the
   * map itself tells you what changed. */
  function drawCamoOverlay(ctx) {
    const en = enabled(), teal = CFG.palette.teal;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const type = typeAt(c, r);
      const on = !!en[type];
      const x = c * T, y = r * T;
      if (on) {
        ctx.globalAlpha = 0.09; ctx.fillStyle = teal;
        ctx.fillRect(x, y, T, T);
        ctx.globalAlpha = 0.55; ctx.strokeStyle = teal; ctx.lineWidth = 1.5;
        roundRect(ctx, x + 4, y + 4, T - 8, T - 8, type === 'wall' ? 10 : 4); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.34; ctx.fillStyle = '#080B18';
        ctx.fillRect(x, y, T, T);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPropColliders(ctx) {
    ctx.save(); ctx.lineWidth = 2.2;
    for (const p of PROP_COLLIDERS) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,79,160,.16)'; ctx.fill();
      ctx.strokeStyle = '#FF4FA0'; ctx.stroke();
      ctx.fillStyle = '#F6F4EF'; ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(p.id, p.x + p.radius + 2, p.y - 2);
    }
    ctx.restore();
  }

  function drawCollisionOverlay(ctx) {
    ctx.save();
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      const ch=grid[r][c], x=c*T, y=r*T;
      if (isDecorative(c,r)) { ctx.fillStyle='rgba(255,150,40,.22)'; ctx.strokeStyle='rgba(255,150,40,.8)'; }
      else if (ch==='#' && !isCorridorOpen(c,r)) { ctx.fillStyle='rgba(255,70,90,.20)'; ctx.strokeStyle='rgba(255,70,90,.75)'; }
      else if (ch==='#') continue;
      else if (ch==='~') { ctx.fillStyle='rgba(40,150,255,.20)'; ctx.strokeStyle='rgba(40,150,255,.75)'; }
      else continue;
      ctx.fillRect(x,y,T,T); ctx.strokeRect(x+.5,y+.5,T-1,T-1);
    }
    ctx.strokeStyle='#35E0D0'; ctx.lineWidth=3; ctx.strokeRect(1.5,1.5,W-3,H-3);
    for (const p of PROP_COLLIDERS) { ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,7); ctx.strokeStyle='#FFC800'; ctx.lineWidth=2.5; ctx.stroke(); }
    ctx.fillStyle='#F6F4EF'; ctx.font='bold 13px ui-monospace,monospace';
    ctx.fillText('COLLISION: red wall/fence Â· blue lake Â· yellow prop Â· cyan boundary',12,18);
    ctx.restore();
  }

  function drawLegalityOverlay(ctx) {
    ctx.save();
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) { const x=c*T,y=r*T; ctx.fillStyle=isDecorative(c,r)?'rgba(255,150,40,.34)':'rgba(40,220,160,.08)'; ctx.fillRect(x,y,T,T); if(isDecorative(c,r)){ctx.strokeStyle='rgba(255,190,60,.9)';ctx.strokeRect(x+1,y+1,T-2,T-2);} }
    ctx.fillStyle='#F6F4EF'; ctx.font='bold 13px ui-monospace,monospace'; ctx.fillText('V51 SOURCE COLLISION: contact bands and lake footprints',12,18); ctx.restore();
  }

  // ---- Navigation (complete-body swept graph; the arena is tiny, so this is free) --
  const centre = (c, r) => ({ x: c * T + T / 2, y: r * T + T / 2 });
  const tileBlocked = (c, r) => {
    if (!inBounds(c, r) || isDecorative(c, r)) return true;
    const p = centre(c, r);
    return !isPlayableBody(p.x, p.y, CFG.playerRadius * T);
  };
  function sweptPlayableEdge(x0, y0, x1, y1, r=CFG.playerRadius*T) {
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, r * .22)));
    for (let n = 0; n <= steps; n++) {
      const q = n / steps;
      if (!isPlayableBody(x0 + (x1 - x0) * q, y0 + (y1 - y0) * q, r)) return false;
    }
    return true;
  }
  const freeTiles = [], hideTiles = [];
  const tileOf = (x, y) => ({ c: Math.floor(x / T), r: Math.floor(y / T) });
  const key = (c, r) => r * cols + c;
  let navigationReady = false, navigationSpawn = null;
  const navigationKeys = new Set();
  function ensureNavigation() {
    if (navigationReady) return true;
    if (!truthMode && !sourceMaskData()) return false;
    navigationSpawn = defaultSpawnPoint();
    if (!navigationSpawn) return false;
    const start = tileOf(navigationSpawn.x, navigationSpawn.y);
    const q = [[start.c, start.r]];
    navigationKeys.add(key(start.c, start.r));
    for (let i = 0; i < q.length; i++) {
      const [c, r] = q[i], from = centre(c, r);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, nk = key(nc, nr);
        if (navigationKeys.has(nk) || tileBlocked(nc, nr)) continue;
        const to = centre(nc, nr);
        if (!sweptPlayableEdge(from.x, from.y, to.x, to.y)) continue;
        navigationKeys.add(nk);
        q.push([nc, nr]);
      }
    }
    freeTiles.length = 0; hideTiles.length = 0;
    for (const packed of navigationKeys) {
      const r = Math.floor(packed / cols), c = packed - r * cols;
      freeTiles.push({ c, r });
      const nearCover = [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dc,dr]) => {
        const nc=c+dc,nr=r+dr;
        return isBush(nc,nr) || isWall(nc,nr) || isWater(nc,nr);
      });
      if (nearCover) hideTiles.push({ c, r });
    }
    freeTiles.sort((a,b) => a.r-b.r || a.c-b.c);
    hideTiles.sort((a,b) => a.r-b.r || a.c-b.c);
    navigationReady = freeTiles.length > 0 && hideTiles.length > 0;
    return navigationReady;
  }

  // Shortest tile path from (c0,r0) to (c1,r1). Returns [{c,r}…] excluding the
  // start, or null if unreachable. 4-way — diagonals would clip wall corners.
  function path(c0, r0, c1, r1) {
    if (!ensureNavigation()) return null;
    if (tileBlocked(c1, r1) || tileBlocked(c0, r0)
        || !navigationKeys.has(key(c1,r1)) || !navigationKeys.has(key(c0,r0))) return null;
    const prev = new Map(); const q = [[c0, r0]]; prev.set(key(c0, r0), null);
    for (let i = 0; i < q.length; i++) {
      const [c, r] = q[i];
      if (c === c1 && r === r1) {
        const out = []; let k = key(c, r), cc = c, rr = r;
        while (prev.get(k) !== null) { out.push({ c: cc, r: rr }); const p = prev.get(k); cc = p[0]; rr = p[1]; k = key(cc, rr); }
        return out.reverse();
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (tileBlocked(nc, nr) || !navigationKeys.has(key(nc,nr)) || prev.has(key(nc, nr))) continue;
        const from=centre(c,r),to=centre(nc,nr);
        if (!sweptPlayableEdge(from.x,from.y,to.x,to.y)) continue;
        prev.set(key(nc, nr), [c, r]); q.push([nc, nr]);
      }
    }
    return null;
  }
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // ---- Rendering --------------------------------------------------------
  // bleed = the world-space rect that exactly covers the full visible canvas
  // at the current fit (game.js render()); falls back to the arena's own
  // W×H bounds for callers that don't pass one (e.g. any older/direct call).
  // World-drawing extracted to world.js in Pass 0 (04-08-2026); see that file's
  // header and PASS0-RECORD.md. arena.js keeps collision/navigation/spawn and
  // forwards the drawing functions below under their original names so the
  // public Arena.* API and every external caller (game.js, render.js) are
  // unchanged.
  const World_ = createWorld({ T, S, grid, rows, cols, W, H, isWall, isBush, truthMode, TRUTH, centre });
  const {
    draw,
    drawGround,
    plateForegroundDrawables,
    makePlateLayer,
    drawMaskedPlate,
    bushMaskCoverage,
    drawOccupiedBushTreatment,
    resetBushTreatmentFrame,
    clearBushTreatmentForNewRound,
    bushCellsForBody,
    localBushPolyomino,
    advanceBushTreatment,
    drawCanopyAfterActors,
    drawAtomicWorld,
    drawOccupiedBushOverlay,
    drawBushWorldOverlay,
    tileRegions,
    hashTile,
    drawWater,
    drawTruthLake,
    drawDecals,
    drawFossilCover,
    propDrawables,
    truthPatchDrawables,
    drawTruthFence,
    drawTruthBush,
    drawTruthPiece,
    drawOneProp,
    bushCanopyDrawables,
    drawBushCluster,
    wallDrawables,
    bushComponentDrawables,
    isFenceEdge,
    drawOneFence,
    line,
    roundRectPath,
    roundRect
  } = World_;

  window.Arena = {
    T, cols, rows, W, H, grid, isSolid, isSolidAt, isPlayableBody, sweptPlayableEdge, tileBlocked, isWall, isWater, isBush, isDecorative, isCorridorOpen, bushMaskCoverage, bushCellsForBody, props: PROP_COLLIDERS,
    // Exposed for testability (Gate 0's automated promotion simulation +
    // boundary-policy tests) — read-only introspection of the bundle
    // identity/boundary policy this Arena instance was built from.
    blockoutActive, boundaryPolicy: BOUNDARY, PLAYABLE_TOP,
    debugShiftProp(id,dx,dy){const p=PROP_COLLIDERS.find(q=>q.id===id);if(!p)return false;p.x+=dx;p.y+=dy;return true;},
    spawn, safeActorPosition, collide, camoSurface, draw, drawPropColliders, drawCollisionOverlay, drawLegalityOverlay, roundRect, roundRectPath,
    prepareSpawnCycle, spawnSeed: () => spawnSeed, spawnSequenceLength: () => spawnSequence.length,
    freeTiles, hideTiles, centre, tileOf, path, pick, drawCamoOverlay, typeAt, wallDrawables, bushCanopyDrawables, propDrawables, truthPatchDrawables,
    isTruthPatch: truthMode, plateForegroundDrawables, drawOccupiedBushTreatment, resetBushTreatmentFrame, clearBushTreatmentForNewRound, drawOccupiedBushOverlay, drawCanopyAfterActors, sourceHitCircle, sourceContactAt, shapeHitCircle,
    // sdfDistanceAt removed from this export (Pass 0 punch list item 2a): the function it
    // pointed to is set aside above as dead post-C9B code. See PASS0-RECORD.md.
  };
})();
