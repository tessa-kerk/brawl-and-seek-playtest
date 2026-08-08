// world.js — Brawl & Seek world-drawing module.
//
// Extracted out of arena.js in Pass 0 (04-08-2026) per
// `../Plan - Reboot 04-08-2026.md`: "Extract world-drawing out of arena.js."
// arena.js remains the collision/navigation/spawn authority (source-mask
// hit-testing, prop colliders, pathfinding, camo-surface detection); this
// module owns everything that only paints pixels — ground/plate compositing,
// bush treatment + native leaf compositing, water/lake, props/decals, wall
// and fence silhouettes, and small canvas-path drawing helpers.
//
// This is a pure code-organisation move: every function below is the exact,
// unmodified body that used to live inside arena.js's own closure. arena.js
// calls createWorld(deps) once with the small set of read-only values these
// functions actually reference from outside their own scope (grid geometry,
// tile size, palette, wall/bush predicates, truth-mode flag, the shared
// `centre` helper) and destructures the returned functions back under their
// original names, so arena.js's public Arena.* API is byte-for-byte
// unchanged and every caller in game.js / render.js keeps working exactly
// as before. See PASS0-RECORD.md for the before/after pixel-comparison
// evidence that proves zero behavioural change from this split.
function createWorld(deps) {
  const { T, S, grid, rows, cols, W, H, isWall, isBush, truthMode, TRUTH, centre } = deps;
  // Private draw-side cache/state, moved here verbatim from arena.js's own closure in the
  // Pass 0 extraction: read/written only by the functions below, never by arena.js's
  // collision/navigation code. See PASS0-RECORD.md.
  let plateLayerCache = null, bushCoverAlpha = 0, bushCoverKey = '', occupiedTargetCache = new Map(), maskAlphaCache = new Map(), bushComponentTextureCache = null, bushWorldLayerCache = null, occupiedBushCells = new Set(), bushTreatmentCache = null;
  // Implementation Session 1 (05-08-2026), A18 §2/§C1 (item 3): a single
  // blockoutActive boolean, sourced from bundle IDENTITY (window.ARENA_BUNDLE,
  // set synchronously by src/bundle-select.js — Gate 0 item 1, never a
  // separate ?blockout=1 re-check here), OR'd into the world_plate check at
  // both call sites below. This disables the OLD baked plate structurally
  // under blockout mode and falls through to the already-existing,
  // already-grid-driven procedural renderer (drawWater/drawDecals/the
  // checker floor) at zero art cost — it does not remove or unload the
  // world_plate asset; the ordinary path is byte-unaffected.
  const blockoutActive = !!(window.ARENA_BUNDLE && window.ARENA_BUNDLE.isBlockout);
  function draw(ctx, t, bleed) {
    drawGround(ctx, bleed || { x0: 0, y0: 0, x1: W, y1: H });
    if (window.Assets && Assets.get('world_plate') && !blockoutActive) { return; }
    if (truthMode) {
      drawTruthLake(ctx, t);
    } else {
      drawWater(ctx, t);
      drawDecals(ctx);
    }
    // NOTE: the fence, bush and stump/barrel props are NOT drawn here — they
    // all join the Y-sorted interleave in game.js render() alongside
    // entities (wallDrawables/bushCanopyDrawables/propDrawables), so a tall
    // structure correctly occludes what's behind it and characters can sink
    // into foliage. The floor + pools + flat bone decals stay here: no
    // height, so no occlusion story to get right.
  }

  /* Full-bleed ground (Concept Brief rule 3l, 20-07-2026 — "kill the
   * letterbox completely"). The floor texture now covers the ENTIRE visible
   * world rect, not just the playable Arena.W×H footprint, so there is no
   * rectangle edge or dimmed void anywhere on screen — the SAME ground just
   * keeps going. The two true map edges (top+left) already carry a wall
   * cluster as their natural boundary feature; the two crop edges (right+
   * bottom) now read as "the map keeps going" simply because the ground
   * genuinely does, at full brightness, with nothing marking a stop. This
   * supersedes the old per-arena floor fill AND the old drawCutEdgeFade
   * gradient (both retired — a fade that stops at W/H is itself a visible
   * rectangle edge once the ground bleeds past it). */
  function drawGround(ctx, bleed) {
    const plate = window.Assets && Assets.get('world_plate');
    if (plate && !blockoutActive) {
      drawAtomicWorld(ctx);
      return;
    }
    const floorImg = window.Assets && Assets.get('floor');
    const bw = bleed.x1 - bleed.x0, bh = bleed.y1 - bleed.y0;
    if (floorImg) {
      const s = Math.max(bw / floorImg.naturalWidth, bh / floorImg.naturalHeight);
      const fw = floorImg.naturalWidth * s, fh = floorImg.naturalHeight * s;
      const cx = bleed.x0 + bw / 2, cy = bleed.y0 + bh / 2;
      ctx.drawImage(floorImg, cx - fw / 2, cy - fh / 2, fw, fh);
    } else {
      // Procedural fallback: the checker only inside the actual grid (it has
      // no meaning beyond it), on a flat fill matching floorA everywhere else
      // in the bleed rect so there's still no visible seam.
      ctx.fillStyle = S.floorA; ctx.fillRect(bleed.x0, bleed.y0, bw, bh);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (grid[r][c] === '#') continue;
        ctx.fillStyle = ((c + r) & 1) ? S.floorB : S.floorA;
        ctx.fillRect(c * T, r * T, T, T);
      }
    }
  }

  function plateForegroundDrawables() {
    const plate=window.Assets&&Assets.get('world_plate'), wall=window.Assets&&Assets.get('world_mask_wall'), bush=window.Assets&&Assets.get('world_mask_bush'); if(!plate||!wall||!bush)return [];
    const layers=(plateLayerCache&&plateLayerCache[0]===plate&&plateLayerCache[1]===wall&&plateLayerCache[2]===bush)?plateLayerCache[3]:(plateLayerCache=[plate,wall,bush,[makePlateLayer(plate,wall),makePlateLayer(plate,bush)]])[3];
    const out=[];
    for(let r=0;r<rows;r++){let c=0;while(c<cols){if(!isWall(c,r)){c++;continue;}let c1=c;while(c1+1<cols&&isWall(c1+1,r))c1++;const runC=c,runR=r,runC1=c1;out.push({y:(runR+1)*T,draw:(ctx)=>{drawMaskedPlate(ctx,layers[0],runC,runR,runC1+1,runR+1);}});c=c1+1;}}
    // Foliage foreground is owned only by a genuinely occupied cell. Other
    // bushes stay opaque and stationary; leaving cover clears immediately.
    /* Bush cover is applied as one connected pre-entity treatment below. */
      // At the audited 43px source scale this resolves to a visible but still
      // leaf-local 1–1.5 screen-pixel sway, not a whole-cluster wobble.
    return out;
  }
  function makePlateLayer(plate,mask){const c=document.createElement('canvas');c.width=plate.naturalWidth;c.height=plate.naturalHeight;const x=c.getContext('2d');x.drawImage(mask,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height);for(let i=0;i<d.data.length;i+=4){const a=Math.max(d.data[i],d.data[i+1],d.data[i+2]);d.data[i+3]=a;}x.putImageData(d,0,0);x.globalCompositeOperation='source-in';x.drawImage(plate,0,0,c.width,c.height);return c;}
  function drawMaskedPlate(ctx,layer,c0,r0,c1,r1){const x=c0*T,y=r0*T,w=(c1-c0)*T,h=(r1-r0)*T;ctx.drawImage(layer,c0*43,r0*43,(c1-c0)*43,(r1-r0)*43,x,y,w,h);}

  let bushMaskCache = null;
  function bushMaskCoverage(c, r) {
    if (!isBush(c, r)) return 0;
    const forcedZero = window.__BUSH_TEST_ZERO_MASK;
    if (forcedZero && forcedZero[c + ',' + r]) return 0;
    const mask = window.Assets && Assets.get('world_mask_bush');
    if (!mask) return 0;
    if (!bushMaskCache || bushMaskCache.mask !== mask) {
      const q = document.createElement('canvas'); q.width = mask.naturalWidth; q.height = mask.naturalHeight;
      const x = q.getContext('2d'); x.drawImage(mask, 0, 0); bushMaskCache = { mask, data: x.getImageData(0,0,q.width,q.height).data, width:q.width, height:q.height };
    }
    const x0 = c * 43, y0 = r * 43, w = 43, h = 43; let n = 0, on = 0;
    for (let y = y0; y < Math.min(y0 + h, bushMaskCache.height); y++) for (let x = x0; x < Math.min(x0 + w, bushMaskCache.width); x++) {
      const i = (y * bushMaskCache.width + x) * 4; n++; if (bushMaskCache.data[i] > 20 || bushMaskCache.data[i+1] > 20 || bushMaskCache.data[i+2] > 20) on++;
    }
    return n ? on / n : 0;
  }
  // Replace only the occupied source foliage before actors are drawn. The
  // approved mask is converted to real alpha by makePlateLayer(); destination
  // out removes the opaque baked leaves, then a subdued copy is put back so
  // the player remains readable without a tile rectangle or component-wide fade.
  function drawOccupiedBushTreatment(ctx) {
    bushCoverAlpha = bushTreatmentAlpha;
    window.__BUSH_DRAW_OWNERS = [];
    if(!window.Player){ bushTreatmentTarget=0; advanceBushTreatment(); return; }
    const occupied=bushCellsForBody(Player.x,Player.y,Player.h); if(!occupied.length){ bushTreatmentTarget=0; advanceBushTreatment(); if(STATE.paused){ bushTreatmentAlpha=0; occupiedBushCells=new Set(); bushNativeCache=null; window.__BUSH_DRAW_TREATED=[]; } return; }
    bushTreatmentTarget=1;
    const cells=localBushPolyomino(occupied);
    window.__BUSH_DRAW_OWNERS = occupied.map(([c,r])=>[c,r]);
    window.__BUSH_DRAW_TREATED = cells.map(([c,r])=>[c,r]);
    const nextCells = new Set(cells.map(([c,r]) => `${c},${r}`));
    occupiedBushCells = nextCells;
    window.__BUSH_DRAW_TREATED = cells.map(([c,r])=>[c,r]);
    advanceBushTreatment();
    // A paused pose is a deterministic still-state probe, not live movement.
    // Settle its first occupied render to the accepted plateau so the legacy
    // pixel/support checks compare a stable treated frame; live gameplay keeps
    // the time-based easing above.
    if (STATE.paused && bushTreatmentAlpha > 0 && bushTreatmentAlpha < .58) {
      bushTreatmentAlpha = .58;
    }
  }
  function resetBushTreatmentFrame() {
    bushTreatmentTarget = 0;
    window.__BUSH_DRAW_OWNERS = [];
    window.__BUSH_DRAW_TREATED = [];
    advanceBushTreatment();
  }
  // A fresh round starts from a new player/camera state.  Do not carry the
  // previous round's selected-owner cache into the first replay paint.
  function clearBushTreatmentForNewRound() {
    bushTreatmentTarget = 0;
    bushTreatmentAlpha = 0;
    bushTreatmentClock = 0;
    occupiedBushCells = new Set();
    bushNativeCache = null;
    bushTreatmentCache = null;
    window.__BUSH_DRAW_OWNERS = [];
    window.__BUSH_DRAW_TREATED = [];
    window.__D028AC_DEBUG = { selected: [], mask: null, alpha: 0, progress: 0, cachePresent: false, cacheKey: null };
    window.__D028E_DEBUG = { selected: [], mask: null, alpha: 0 };
  }
  function bushCellsForBody(x,y,h) {
    const out=[]; const c0=Math.floor((x-h)/T), c1=Math.floor((x+h)/T), r0=Math.floor((y-h)/T), r1=Math.floor((y+h)/T);
    const bodyArea=(2*h)*(2*h);
    for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++) if(isBush(c,r) && bushMaskCoverage(c,r)>0.02){const ox=Math.max(0,Math.min(x+h,(c+1)*T)-Math.max(x-h,c*T)),oy=Math.max(0,Math.min(y+h,(r+1)*T)-Math.max(y-h,r*T));if((ox*oy)/bodyArea>0.18) out.push([c,r]);}
    return out;
  }
  function localBushPolyomino(occupied) {
    if(!occupied.length) return [];
    const root=[Math.floor(Player.x/T),Math.floor(Player.y/T)];
    let start=occupied.find(([c,r])=>c===root[0]&&r===root[1])||occupied[0];
    const out=[start], seen=new Set([start[0]+','+start[1]]);
    // The local cluster is bounded by one tile of graph distance around the
    // occupied root; ownership still comes from complete leaf components, not
    // a radial alpha mask or a fixed cell count.
    const maxRadius=1.3*T;
    const add=(c,r)=>{const k=c+','+r, cx=(c+.5)*T, cy=(r+.5)*T;
      if(seen.has(k)||!isBush(c,r)||bushMaskCoverage(c,r)<=0.02) return false;
      if(Math.hypot(cx-Player.x,cy-Player.y)>maxRadius) return false;
      seen.add(k); out.push([c,r]); return true;};
    const orth=[[0,-1],[-1,0],[1,0],[0,1]];
    for(let i=0;i<out.length;i++){const [c,r]=out[i]; for(const [dc,dr] of orth) add(c+dc,r+dr);}
    return out;
  }
  let bushNativeCache = null;
  let bushTreatmentAlpha = 0;
  let bushTreatmentTarget = 0;
  let bushTreatmentClock = 0;
  function advanceBushTreatment() {
    const now=performance.now(); const dt=bushTreatmentClock?Math.min(80,Math.max(0,now-bushTreatmentClock)):16; bushTreatmentClock=now;
    const target=bushTreatmentTarget?.58:0;
    const duration = bushTreatmentTarget ? 180 : 90;
    bushTreatmentAlpha += (target-bushTreatmentAlpha)*Math.min(1,dt/duration);
    // Snap only inside a small terminal band so the reference-like easing
    // reaches the measured .58 plateau without making entry frame-based.
    if(Math.abs(target-bushTreatmentAlpha)<.015) bushTreatmentAlpha=target;
    if(!bushTreatmentTarget && bushTreatmentAlpha<=.001){ bushTreatmentAlpha=0; occupiedBushCells=new Set(); window.__BUSH_DRAW_TREATED=[]; bushNativeCache=null; }
  }
  // D028H continuous native-leaf compositor.  The gameplay grid remains the
  // collision authority, but the visible boundary comes only from the clean
  // foliage alpha and a player-centred soft field.
  // SET ASIDE (Pass 0 punch list item 2c): only ever assigned here, never read anywhere
  // else in the codebase — dead alongside drawContinuousWorld() above.
  // let continuousWorldCache = null;
  // SET ASIDE (Pass 0 punch list item 2c, 04-08-2026): drawContinuousWorld() has always
  // been an empty no-op body and is never called anywhere in the codebase (confirmed by
  // repo-wide search). Kept commented rather than deleted per the reboot plan's hard line
  // ("no deletes, set aside instead"). See PASS0-RECORD.md.
  // function drawContinuousWorld(ctx) {}
  function drawCanopyAfterActors(ctx) { if(!bushNativeCache||!occupiedBushCells.size||!bushNativeCache.front)return; const p=Math.max(0,Math.min(1,bushTreatmentAlpha/.58)); ctx.save(); ctx.globalAlpha=.58*p; ctx.drawImage(bushNativeCache.front,0,0,W,H); ctx.restore(); }
  function drawAtomicWorld(ctx) {
    const plate=Assets&&Assets.get('world_plate'), baseImg=Assets&&Assets.get('world_d025_bush_base'), fgImg=Assets&&Assets.get('world_d025_bush_foreground');
    if(!plate||!baseImg||!fgImg) return;
    const key=[...occupiedBushCells].sort().join(';');
    if(!occupiedBushCells.size){ctx.drawImage(plate,0,0,W,H); window.__D028AC_DEBUG={selected:[],mask:null,alpha:0,progress:0,cachePresent:false,cacheKey:null}; return;}
    if(!bushNativeCache||bushNativeCache.key!==key||bushNativeCache.plate!==plate){
      const nw=plate.naturalWidth,nh=plate.naturalHeight,ST=43,pad=2;
      // Select complete foliage components by the offline owner atlas.  The
      // atlas RGB stores the semantic base cell (+1), so no rectangle or
      // per-cell crop can cut a leaf at a tile edge.
      const owners=Assets&&Assets.get('world_leaf_owner_atlas');
      const mask=document.createElement('canvas'); mask.width=nw; mask.height=nh; const mx=mask.getContext('2d');
      if (owners) {
        mx.drawImage(owners,0,0);
        const od=mx.getImageData(0,0,nw,nh), selected=new Set([...occupiedBushCells].map(k=>k));
        for(let i=0;i<od.data.length;i+=4){const c=od.data[i]-1,r=od.data[i+1]-1;if(!selected.has(`${c},${r}`)) od.data[i+3]=0; else {od.data[i]=255;od.data[i+1]=255;od.data[i+2]=255;}}
        mx.putImageData(od,0,0);
        const leaf=Assets&&Assets.get('world_d028e_leaf_alpha');
        if(leaf){ mx.globalCompositeOperation='destination-in'; mx.drawImage(leaf,0,0,nw,nh); mx.globalCompositeOperation='source-over'; }
      } else {
        const semantic=document.createElement('canvas'); semantic.width=nw; semantic.height=nh; const sx=semantic.getContext('2d'); sx.fillStyle='#fff';
        for(const k of occupiedBushCells){const [c,r]=k.split(',').map(Number); sx.fillRect(Math.max(0,c*ST-pad),Math.max(0,r*ST-pad),ST+pad*2,ST+pad*2);}
        mx.drawImage(fgImg,0,0); mx.globalCompositeOperation='destination-in'; mx.drawImage(semantic,0,0);
      }
      const final=document.createElement('canvas'); final.width=nw; final.height=nh; const fx=final.getContext('2d'); fx.drawImage(plate,0,0);
      // SET ASIDE (Pass 0 punch list item 2d, 04-08-2026): this `cut` canvas is built every
      // cache rebuild but its result is never read again downstream (confirmed: no further
      // reference to `cut` in this function or file). Dead compositing work; commented out
      // rather than deleted. See PASS0-RECORD.md.
      // const cut=document.createElement('canvas'); cut.width=nw; cut.height=nh; const cx=cut.getContext('2d'); cx.drawImage(fgImg,0,0); cx.globalCompositeOperation='destination-in'; cx.drawImage(mask,0,0);
      const erase=document.createElement('canvas'); erase.width=nw; erase.height=nh; const ex=erase.getContext('2d'); ex.drawImage(mask,0,0);
      fx.globalCompositeOperation='destination-out'; fx.drawImage(erase,0,0); fx.globalCompositeOperation='source-over';
      const under=document.createElement('canvas'); under.width=nw; under.height=nh; const ux=under.getContext('2d');
      // Reveal the approved continuous Acid Lakes floor through the selected
      // leaf holes.  The old bush-base image contains rectangular dark
      // placeholders and must never be used as an interaction underlay.
      const floorImg=Assets&&Assets.get('world_floor_master');
      if (floorImg) ux.drawImage(floorImg,0,0,nw,nh);
      else ux.drawImage(baseImg,0,0,nw,nh);
      ux.globalCompositeOperation='destination-in'; ux.drawImage(mask,0,0); fx.drawImage(under,0,0);
      const md=mask.getContext('2d').getImageData(0,0,nw,nh);
      const rgb=document.createElement('canvas'); rgb.width=nw; rgb.height=nh; const rg=rgb.getContext('2d'); rg.drawImage(fgImg,0,0); const fd=rg.getImageData(0,0,nw,nh).data;
      const out=document.createElement('canvas'); out.width=nw; out.height=nh; const ox=out.getContext('2d'); const od=ox.createImageData(nw,nh);
      for(let y=0;y<nh;y++) for(let x=0;x<nw;x++){const i=(y*nw+x)*4,a=md.data[i+3]; if(!a)continue; od.data[i]=fd[i]; od.data[i+1]=fd[i+1]; od.data[i+2]=fd[i+2]; od.data[i+3]=a;}
      ox.putImageData(od,0,0);
      bushNativeCache={key,plate,final,mask,front:out}; window.__D028AC_DEBUG={selected:[...occupiedBushCells],mask,alpha:bushTreatmentAlpha}; window.__D028E_DEBUG={selected:[...occupiedBushCells],mask,alpha:bushTreatmentAlpha};
    }
    // Crossfade the entire treated world over the normal opaque plate. This
    // keeps exit/restoration smooth; the cached mask is retained until p=0.
    ctx.drawImage(plate,0,0,W,H);
    const p=Math.max(0,Math.min(1,bushTreatmentAlpha/.58));
    if(p>0){ ctx.save(); ctx.globalAlpha=p; ctx.drawImage(bushNativeCache.final,0,0,W,H); ctx.restore(); }
    window.__D028AC_DEBUG={selected:[...occupiedBushCells],mask:bushNativeCache.mask,alpha:bushTreatmentAlpha,progress:p,cachePresent:!!bushNativeCache,cacheKey:bushNativeCache.key};
  }
  function drawOccupiedBushOverlay(ctx) { drawAtomicWorld(ctx); }
  function drawBushWorldOverlay(ctx) {
    const overlay = window.Assets && Assets.get('world_bush_overlay');
    if (!overlay) return;
    window.__BUSH_WORLD_OVERLAY_DRAWS = (window.__BUSH_WORLD_OVERLAY_DRAWS || 0) + 1;
    if (!bushWorldLayerCache || bushWorldLayerCache.overlay !== overlay) {
      const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
      const x = layer.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(overlay, 0, 0, W, H);
      bushWorldLayerCache = { overlay, layer };
    }
    const base = bushWorldLayerCache.layer;
    if (!occupiedBushCells.size) { ctx.drawImage(base, 0, 0); return; }
    const camKey=window.Game&&window.Game.camera?`${Math.round(window.Game.camera.x)},${Math.round(window.Game.camera.y)}`:'0,0';
    const treatmentKey=`${camKey}|${[...occupiedBushCells].sort().join(';')}`;
    if (bushTreatmentCache && bushTreatmentCache.key===treatmentKey && bushTreatmentCache.base===base) {
      ctx.drawImage(bushTreatmentCache.ground,0,0); ctx.drawImage(bushTreatmentCache.opaque,0,0);
      ctx.save(); ctx.globalAlpha=.42; ctx.drawImage(bushTreatmentCache.treated,0,0); ctx.restore();
      window.__BUSH_TREATMENT_CACHE_HITS=(window.__BUSH_TREATMENT_CACHE_HITS||0)+1; return;
    }
    // Build a leaf-alpha treatment mask from padded source crops.  There is
    // no final rectangular clip: each crop carries the real foliage alpha
    // through its boundary and overlapping crops union into one stencil.
    const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
    const mx = mask.getContext('2d'); mx.globalCompositeOperation = 'lighter'; mx.filter = 'blur(1.5px)';
    const srcMask = window.Assets && Assets.get('bush_component_alpha');
    for (const key of occupiedBushCells) {
      const [c,r] = key.split(',').map(Number);
      if (srcMask) {
        const s = document.createElement('canvas'); s.width = 64; s.height = 64;
        const sx = s.getContext('2d'); sx.drawImage(srcMask, 0, 0, srcMask.naturalWidth, srcMask.naturalHeight, 0, 0, 64, 64);
        const d = sx.getImageData(0, 0, 64, 64); for (let i=0;i<d.data.length;i+=4) { const a=d.data[i+3]; d.data[i]=255; d.data[i+1]=255; d.data[i+2]=255; d.data[i+3]=a; }
        sx.putImageData(d, 0, 0); mx.imageSmoothingEnabled = true;
        mx.drawImage(s, c*T, r*T, T, T);
      } else {
        mx.drawImage(base, c*T, r*T, T, T, c*T, r*T, T, T);
      }
    }
    const union=document.createElement('canvas'); union.width=W; union.height=H; const ux=union.getContext('2d');
    ux.fillStyle='#fff'; for (const key of occupiedBushCells) { const [c,r]=key.split(',').map(Number); ux.fillRect(c*T,r*T,T,T); }
    mx.globalCompositeOperation='destination-in'; mx.drawImage(union,0,0);
    const ground=document.createElement('canvas'); ground.width=W; ground.height=H;
    const gx=ground.getContext('2d'); gx.fillStyle='#48314e'; gx.fillRect(0,0,W,H);
    gx.globalCompositeOperation='destination-in'; gx.drawImage(mask,0,0); ctx.drawImage(ground,0,0);
    const opaque=document.createElement('canvas'); opaque.width=W; opaque.height=H;
    const ox=opaque.getContext('2d'); ox.drawImage(base,0,0); ox.globalCompositeOperation='destination-out'; ox.drawImage(mask,0,0);
    ctx.drawImage(opaque,0,0);
    const treated = document.createElement('canvas'); treated.width = W; treated.height = H;
    const tx = treated.getContext('2d'); tx.drawImage(base, 0, 0);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(mask, 0, 0);
    bushTreatmentCache={key:treatmentKey,base,ground,opaque,treated};
    ctx.save(); ctx.globalAlpha = .42; ctx.drawImage(treated, 0, 0); ctx.restore();
  }

  // Bounding boxes of contiguous same-type tile regions, 4-way flood fill.
  // Used to trace a ROUNDED outer silhouette around a pool/cluster instead of
  // raw per-tile rects (real Brawl water is never a hard square — Art
  // Inventory.md law 3; our reference pool is itself a clean rounded square,
  // so one rounded-rect over each region's bounding box matches it exactly).
  function tileRegions(match) {
    const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (seen[r][c] || !match(c, r)) continue;
      let c0 = c, c1 = c, r0 = r, r1 = r;
      const stack = [[c, r]]; seen[r][c] = true;
      while (stack.length) {
        const [cc, rr] = stack.pop();
        c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); r0 = Math.min(r0, rr); r1 = Math.max(r1, rr);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = cc + dc, nr = rr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nr][nc] || !match(nc, nr)) continue;
          seen[nr][nc] = true; stack.push([nc, nr]);
        }
      }
      out.push({ c0, c1, r0, r1 });
    }
    return out;
  }

  /* TRUE organic pool silhouette (PM directive, 18-07-2026): Acid Lakes'
   * pool is a genuine diagonal chain of tiles, unlike Spots of Yore's clean
   * rounded-square (measured precisely last pass — that pool really was a
   * square, this one really isn't). A per-REGION bounding box would round
   * the diagonal off into a rectangle; instead each water TILE gets its own
   * rounded-rect (same technique drawBush already uses), so the union
   * traces the actual stair-step diagonal from the real map, not a guess. */
  // Deterministic per-tile pseudo-random, 0..1 — stable across frames (no
  // flicker) without a stored seed table. Used by the water bubbles and the
  // bush-tuft jitter below.
  function hashTile(a, b) {
    let h = (a | 0) * 374761393 + (b | 0) * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* Layer 1 — pools: pure code-drawn, ZERO generation (Concept Brief rule 3l,
   * Tessa's layered-build spec, 21-07-2026 — "the real acid is that calm;
   * code guarantees the shape"). Flat bright fill + the same per-tile-union
   * rim-shadow technique as before (still the right call — organic
   * silhouette, no seam where tiles touch) + a couple of soft darker
   * patches and sparse bubble accents, deliberately calm, not a busy
   * animated blob pattern. No water.png asset any more. */
  function drawWater(ctx, t) {
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === '~') cells.push([c, r]);
    if (!cells.length) return;

    ctx.save();
    // Primary-frame lake study (30/45/60s, Directive 002): the live Acid
    // rim is a subdued dark green shadow, not the inherited warm-brown rim.
    ctx.shadowColor = '#235234'; ctx.shadowBlur = 3;
    ctx.fillStyle = '#235234';
    ctx.beginPath();
    for (const [c, r] of cells) roundRectPath(ctx, c * T, r * T, T, T, T * 0.12);
    ctx.fill(); ctx.fill();   // twice: shadowBlur only casts from an actual fill, and one pass reads faint on some canvases
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    for (const [c, r] of cells) roundRectPath(ctx, c * T, r * T, T, T, T * 0.12);
    ctx.clip();
    ctx.fillStyle = S.water; ctx.fillRect(0, 0, W, H);
    // one or two soft darker patches per pool, calm not busy
    ctx.globalAlpha = 0.14; ctx.fillStyle = '#1E9A3E';
    for (const [c, r] of cells) {
      if (hashTile(c, r) < 0.3) {
        const cx = c * T + T * (0.3 + hashTile(c + 50, r) * 0.4);
        const cy = r * T + T * (0.3 + hashTile(c, r + 50) * 0.4);
        ctx.beginPath(); ctx.arc(cx, cy, T * 0.34, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // sparse bubble accents, a gentle pulse so the pool still reads as liquid
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (const [c, r] of cells) {
      if (hashTile(c + 200, r) >= 0.35) continue;
      const bx = c * T + T * (0.2 + hashTile(c, r) * 0.6);
      const by = r * T + T * (0.2 + hashTile(c + 300, r) * 0.6);
      const pulse = 0.4 + 0.3 * Math.sin(t * 1.1 + c * 3 + r * 5);
      ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(bx, by, T * (0.03 + hashTile(c, r + 300) * 0.03), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Independently traced from the 30/45/60-second footage frames: a calm
  // acid surface, subdued dark-green rim, and no warm/brown outline. Its
  // exact six-cell union is the audit mask, not a rounded bounding box.
  function drawTruthLake(ctx, t) {
    const cells = TRUTH.lake;
    ctx.save(); ctx.shadowColor = '#235234'; ctx.shadowBlur = 4; ctx.fillStyle = '#235234';
    ctx.beginPath(); for (const [c, r] of cells) roundRectPath(ctx, c * T, r * T, T, T, T * .13); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.beginPath(); for (const [c, r] of cells) roundRectPath(ctx, c * T, r * T, T, T, T * .13); ctx.clip();
    ctx.fillStyle = '#36D65B'; ctx.fillRect(10 * T, 13 * T, 5 * T, 3 * T);
    ctx.globalAlpha = .13; ctx.fillStyle = '#1E9A3E';
    ctx.beginPath(); ctx.arc(12.2 * T, 14.2 * T, .52 * T, 0, 7); ctx.fill();
    ctx.globalAlpha = .55; ctx.fillStyle = '#D2FFD7';
    ctx.beginPath(); ctx.arc(12.45 * T, 13.65 * T, T * .045, 0, 7); ctx.fill();
    ctx.restore();
  }

  /* Layer 2 ground decals — bone/fossil fragments (Concept Brief rule 3l,
   * Tessa's layered-build spec, 21-07-2026): flat, no height, drawn on the
   * floor layer before the Y-sorted interleave (never consulted by
   * collide()/isSolid()/hideTiles — purely visual). Stumps/barrels DO have
   * height and join the Y-sort instead — see propDrawables() below.
   * Power-Cube crates are REMOVED outright (Tessa's design ruling: Solo
   * Showdown power-up furniture, not map furniture — they'd falsely
   * promise power cubes in our camo mode); their old traced tile positions
   * are simply open floor now, not backfilled with anything. */
  const PROPS = (ARENA.props || []);
  const DECAL_KEYS = { bones_skull: 1, bones_pair: 1, bones_ribs: 1, bones_single: 1 };

  function drawDecals(ctx) {
    for (const p of PROPS) if (DECAL_KEYS[p.key]) { drawFossilCover(ctx,p); drawOneProp(ctx, p); }
  }
  function drawFossilCover(ctx,p){
    const x=p.c*T+T/2,y=p.r*T+T/2, pad=p.key==='bones_ribs'?T*.34:T*.27;
    ctx.save(); ctx.fillStyle=((p.c+p.r)&1)?S.floorB:S.floorA; ctx.fillRect(x-pad,y-pad,pad*2,pad*2); ctx.restore();
  }

  function propDrawables() {
    const out = [];
    for (const p of PROPS) if (!DECAL_KEYS[p.key]) out.push({ y: (p.r + 1) * T, draw: (ctx) => drawOneProp(ctx, p) });
    return out;
  }

  function truthPatchDrawables() {
    if (!truthMode) return [];
    const out = [
      { y: 12 * T, draw: (ctx) => drawTruthFence(ctx, TRUTH.horizontal.cells) },
      { y: 12 * T, draw: (ctx) => drawTruthFence(ctx, TRUTH.vertical.cells) },
      { y: 16 * T, draw: (ctx) => drawTruthBush(ctx, TRUTH.bush) },
    ];
    for (const p of TRUTH.props) out.push({ y: (p.r + 1) * T, draw: (ctx) => drawOneProp(ctx, p) });
    return out;
  }

  function drawTruthFence(ctx, cells) {
    const horizontal = cells[0][1] === cells[1][1];
    const [c0,r0] = cells[0], [cN,rN] = cells[cells.length-1];
    const x=Math.min(c0,cN)*T, y=Math.min(r0,rN)*T, w=(Math.abs(cN-c0)+1)*T, h=(Math.abs(rN-r0)+1)*T;
    ctx.save(); ctx.fillStyle='#403b70'; ctx.fillRect(x,y+T*.28,w,h*.72); ctx.fillStyle='#7476b8'; ctx.fillRect(x,y,w,h*.5);
    ctx.strokeStyle='rgba(20,16,42,.72)'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
    for(let i=0;i<=cells.length;i++){ const px=horizontal?x+i*T:x+T*.5, py=horizontal?y+T*.18:y+i*T; ctx.fillStyle='#201b3c'; ctx.fillRect(px-2,py-7,4,14); }
    ctx.restore();
  }
  function drawTruthBush(ctx,cells) {
    const img=window.Assets&&Assets.get('bush_tuft'); if(!img)return;
    let c0=Infinity,c1=-Infinity,r0=Infinity,r1=-Infinity; for(const [c,r] of cells){c0=Math.min(c0,c);c1=Math.max(c1,c);r0=Math.min(r0,r);r1=Math.max(r1,r);}
    ctx.save();ctx.beginPath();for(const [c,r] of cells)ctx.rect(c*T,r*T,T,T);ctx.clip();ctx.drawImage(img,c0*T,r0*T,(c1-c0+1)*T,(r1-r0+1)*T);ctx.restore();
  }

  // Exact programmatic mask: the source-selected whole unit is painted once,
  // clipped to its audited occupied-cell union. No per-cell stamp, jitter,
  // rotation, scaling variance or overlap can introduce a false footprint.
  function drawTruthPiece(ctx, key, cells) {
    const img = window.Assets && Assets.get(key);
    if (!img) return;
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const [c, r] of cells) { c0 = Math.min(c0,c); c1 = Math.max(c1,c); r0 = Math.min(r0,r); r1 = Math.max(r1,r); }
    ctx.save(); ctx.beginPath();
    for (const [c, r] of cells) ctx.rect(c * T, r * T, T, T);
    ctx.clip();
    ctx.drawImage(img, c0 * T, r0 * T, (c1 - c0 + 1) * T, (r1 - r0 + 1) * T);
    ctx.restore();
  }

  function drawOneProp(ctx, p) {
    const img = window.Assets && Assets.get(p.key);
    const x = p.c * T + T / 2, y = p.r * T + T / 2;
    const decal = !!DECAL_KEYS[p.key];
    if (!img) {
      ctx.save();
      ctx.fillStyle = 'rgba(200,200,210,.6)'; ctx.strokeStyle = CFG.palette.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, T * 0.14, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
    const sizeFrac = decal ? 0.4 : 0.62;
    const s = T * sizeFrac / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.save();
    if (!decal) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(x, y + h * 0.34, w * 0.34, h * 0.14, 0, 0, 7); ctx.fill();
    }
    ctx.translate(x, y);
    if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /* Layer 2 — bush: ONE small tuft sprite duplicated with jitter/overlap
   * into an organic mass (Concept Brief rule 3l, Tessa's layered-build
   * spec, 21-07-2026 — "actual bushes not 2D flat objects", supersedes the
   * earlier single-stretched-texture version). A darker base layer draws
   * first (her "darker bases"), then several jittered tuft copies on top —
   * two per bush tile (one centred, one offset toward a neighbour) so the
   * outer edge overlaps raggedly instead of reading as a tile grid. Joins
   * the Y-sorted wall+entity interleave (game.js), so characters standing
   * at or behind a clump's near edge get genuine partial foliage occlusion. */
  function bushCanopyDrawables() {
    const regions = tileRegions((c, r) => grid[r][c] === 'b');
    const out = [];
    for (const reg of regions) out.push({ y: (reg.r1 + 1) * T, draw: (ctx) => drawBushCluster(ctx, reg) });
    return out;
  }

  function drawBushCluster(ctx, reg) {
    const x0 = reg.c0 * T, y0 = reg.r0 * T, x1 = (reg.c1 + 1) * T, y1 = (reg.r1 + 1) * T;
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const tuftImg = window.Assets && Assets.get('bush_tuft');

    // Directive 002 replacement: one grid-anchored texture is clipped to the
    // exact rectilinear union of occupied cells. It removes alpha seams at
    // interior boundaries without adding jitter, rotation, overlap or any
    // footprint outside the data-grid polyomino.
    if (tuftImg) {
      ctx.save(); ctx.beginPath();
      for (let r = reg.r0; r <= reg.r1; r++) for (let c = reg.c0; c <= reg.c1; c++)
        if (grid[r][c] === 'b') ctx.rect(c * T, r * T, T, T);
      ctx.clip();
      ctx.drawImage(tuftImg, x0, y0, w, h);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(cx, y1 - 2, w * 0.44, h * 0.18, 0, 0, 7); ctx.fill();

    // darker base mass -- a SMALL plain-filled blob per tile, just enough
    // to back-fill any sliver a tuft stamp doesn't cover; kept subordinate
    // (small radius) so it reads as shadow between leaves, never competes
    // with the tuft texture for visual weight (first pass had this too
    // large — it was reading as flat green circles, not foliage).
    ctx.fillStyle = S.bush;
    ctx.beginPath();
    for (let r = reg.r0; r <= reg.r1; r++) for (let c = reg.c0; c <= reg.c1; c++) {
      if (grid[r][c] !== 'b') continue;
      const bx = c * T + T / 2, by = r * T + T / 2;
      ctx.moveTo(bx + T * 0.3, by);
      ctx.arc(bx, by, T * 0.3, 0, Math.PI * 2);
    }
    ctx.fill();

    // Dense jittered tuft stamps: FOUR per bush tile, spread and overlapping
    // across the tile and into its neighbours, so adjacent tiles' foliage
    // physically overlaps and the cluster reads as one continuous ragged
    // mass rather than one distinguishable blob per tile (first pass used
    // 2 sparse stamps at near-tile-size — gaps of bare base colour showed
    // between tiles; this quadruples coverage and enlarges the stamp).
    const stamps = [];
    for (let r = reg.r0; r <= reg.r1; r++) for (let c = reg.c0; c <= reg.c1; c++) {
      if (grid[r][c] !== 'b') continue;
      for (let i = 0; i < 1; i++) {
        const a = hashTile(c * 4 + i, r * 4 + i) * Math.PI * 2;
        const d = 0;
        stamps.push({
          tx: c * T + T / 2 + Math.cos(a) * d,
          ty: r * T + T / 2 + Math.sin(a) * d,
          seed: c * 97 + r * 53 + i * 13,
        });
      }
    }
    for (const s of stamps) {
      const jx = 0;
      const jy = 0;
      const scale = 1;
      const rot = 0;
      const px = s.tx + jx, py = s.ty + jy;
      if (tuftImg) {
        const size = T;
        const iw = size, ih = size * (tuftImg.naturalHeight / tuftImg.naturalWidth);
        ctx.save();
        ctx.translate(px, py); ctx.rotate(rot);
        ctx.drawImage(tuftImg, -iw / 2, -ih / 2, iw, ih);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.55; ctx.fillStyle = S.bushHi;
        ctx.beginPath(); ctx.arc(px, py, T * 0.22 * scale, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---- Camera-tilt draw order (engineering pass, 18-07-2026) -------------
  // Real Brawl renders on a tilted camera, not flat top-down: chunky blocks
  // show both a top face and a front face, and whether a block sits "in
  // front of" or "behind" a character depends on ROW position, not a fixed
  // layer. Art + draw order ONLY (PM-scoped, Concept Brief rule 3d) — the
  // collision grid, all mechanics and the fit geometry are untouched; this
  // changes what gets painted where, never what collides or scores.
  //
  // wallDrawables() returns one entry per wall tile: {y, draw(ctx)}, where y
  // is the tile's ground-contact edge (its south side, y=(r+1)*T) — the same
  // "how close to the camera is this thing's base" measure game.js uses for
  // entities (feet ≈ e.y + e.r). game.js merges walls + entities into ONE
  // array and sorts it ascending by y before drawing, so a wall correctly
  // occludes an entity further away (smaller y, drawn first, wall paints
  // over it) while an entity nearer the camera (larger y, drawn after) paints
  // over the wall's own base — real occlusion, not a fixed z-order guess.
  /* Layer 2 — the fence: a COMPOUND object, not two separate structures
   * (Concept Brief rule 3l, Tessa's layered-build spec, 21-07-2026, with
   * her own reference crop): "low purple wall-slab run as the base, with
   * dark iron pointy posts/spikes layered on top at intervals." Built
   * exactly as she specified: a flush, gapless SLAB-MATERIAL base (the
   * same merge technique the v29 wall pass used, now painting a real
   * stone-slab texture instead of a discrete pillar icon, so there's no
   * per-tile object silhouette left to leave gaps) + spike POSTS
   * composited on top only at INTERVALS along the structure's true
   * boundary edges — never per-tile, which would just be the old
   * stamped-icon defect wearing a different asset. */
  function wallDrawables() {
    const slab = window.Assets && Assets.get('fence_slab');
    const spike = window.Assets && Assets.get('fence_spike');
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== '#') continue;
      out.push({ y: (r + 1) * T, draw: (ctx) => drawOneFence(ctx, c, r, slab, spike) });
    }
    return out;
  }

  // One continuous approved-source texture per connected semantic component.
  // The source is scaled once to the component bounds and clipped to the
  // exact four-way cell union; no per-cell resampling or centre seam exists.
  function bushComponentDrawables() {
    const source = window.Assets && Assets.get('bush_component_source');
    const alphaSource = window.Assets && Assets.get('bush_component_alpha');
    if (!source || !alphaSource) return [];
    if (!bushComponentTextureCache || bushComponentTextureCache.source !== source) {
      const sw = source.naturalWidth || 1024, sh = source.naturalHeight || 384;
      const ew = Math.max(sw * 3, 3072), tex = document.createElement('canvas');
      tex.width = ew; tex.height = sh;
      const tx = tex.getContext('2d'); tx.imageSmoothingEnabled = false;
      tx.drawImage(source, 0, 0, sw, sh);
      tx.save(); tx.translate(sw * 2, 0); tx.scale(-1, 1); tx.drawImage(source, 0, 0, sw, sh); tx.restore();
      tx.drawImage(source, sw * 2, 0, sw, sh);
      bushComponentTextureCache = { source, tex, sw, sh };
    }
    const texture = bushComponentTextureCache;
    return tileRegions((c, r) => grid[r][c] === 'b').map((reg) => ({
      y: reg.r0 * T + 0.01,
      draw: (ctx) => {
        const x0 = reg.c0 * T, y0 = reg.r0 * T;
        const w = (reg.c1 - reg.c0 + 1) * T, h = (reg.r1 - reg.r0 + 1) * T;
        const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
        const lx = layer.getContext('2d'); lx.imageSmoothingEnabled = false;
        const sx = w > texture.sw ? 0 : ((reg.c0 * 97) % Math.max(1, texture.sw - w));
        const sy = h > texture.sh ? 0 : ((reg.r0 * 53) % Math.max(1, texture.sh - h));
        lx.drawImage(texture.tex, sx, sy, w, h, 0, 0, w, h);
        // Source-derived perimeter: alpha is irregular leaf silhouette; the
        // semantic union below still controls the exact selected Tetris cells.
        lx.globalCompositeOperation = 'destination-in';
        lx.drawImage(alphaSource, 0, 0, w, h);
        const selected = new Set();
        for (let rr = reg.r0; rr <= reg.r1; rr++) for (let cc = reg.c0; cc <= reg.c1; cc++)
          if (grid[rr][cc] === 'b') selected.add(`${cc},${rr}`);
        lx.globalCompositeOperation = 'destination-out';
        for (let rr = reg.r0; rr <= reg.r1; rr++) for (let cc = reg.c0; cc <= reg.c1; cc++)
          if (!selected.has(`${cc},${rr}`)) lx.clearRect((cc - reg.c0) * T, (rr - reg.r0) * T, T, T);
        lx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.beginPath();
        for (let r = reg.r0; r <= reg.r1; r++) for (let c = reg.c0; c <= reg.c1; c++)
          if (grid[r][c] === 'b') ctx.rect(c * T, r * T, T, T);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        // Preserve native leaf scale. The mirrored continuation only supplies
        // extra horizontal coverage for components wider than the source.
        ctx.drawImage(layer, x0, y0, w, h);
        const covered = [];
        for (let rr = reg.r0; rr <= reg.r1; rr++) for (let cc = reg.c0; cc <= reg.c1; cc++)
          if (occupiedBushCells.has(`${cc},${rr}`)) covered.push([cc, rr]);
        if (covered.length) {
          ctx.save(); ctx.beginPath();
          for (const [cc, rr] of covered) ctx.rect(cc * T + 2, rr * T + 2, T - 4, T - 4);
          ctx.clip(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .42;
          ctx.drawImage(layer, x0, y0, w, h);
          ctx.restore();
        }
        ctx.restore();
      },
    }));
  }
  // Any tile bordering a non-fence tile — the structure's true outer
  // boundary, used both for the outline and for spike-post placement.
  function isFenceEdge(c, r) {
    return !isWall(c - 1, r) || !isWall(c + 1, r) || !isWall(c, r - 1) || !isWall(c, r + 1);
  }

  function drawOneFence(ctx, c, r, slab, spike) {
    const x = c * T, y = r * T;
    const edgeS = !isWall(c, r + 1);   // true south-facing edge of this structure
    ctx.save();
    // Shared drop shadow — only at the structure's true base, once per span.
    if (edgeS) {
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(x + T / 2, y + T * 0.96, T * 0.48, T * 0.12, 0, 0, 7); ctx.fill();
    }
    // Gapless slab base: flush per-tile fill of the MATERIAL texture, not a
    // discrete object, so touching tiles form one continuous low rail with
    // zero gap regardless of the texture's own pattern.
    if (slab) {
      const s = Math.max(T / slab.naturalWidth, T / slab.naturalHeight) * 1.4;
      const sw = slab.naturalWidth * s, sh = slab.naturalHeight * s;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, T, T + (edgeS ? T * 0.14 : 0)); ctx.clip();
      ctx.drawImage(slab, x + T / 2 - sw / 2, y + T / 2 - sh / 2, sw, sh);
      ctx.restore();
    } else {
      ctx.fillStyle = S.wallSide;
      ctx.fillRect(x, y, T, T + (edgeS ? T * 0.14 : 0));
      ctx.fillStyle = S.wallTop;
      ctx.fillRect(x, y, T, T);
    }
    // Spike posts: discrete props, only at intervals along a true boundary
    // edge. Even (c+r) parity spaces a post every second tile along a
    // straight run — the post-rail-post-rail rhythm her reference shows —
    // rather than one per tile.
    if (spike && isFenceEdge(c, r) && ((c + r) & 1) === 0) {
      const ps = T * 0.62 / Math.max(spike.naturalWidth, spike.naturalHeight);
      const pw = spike.naturalWidth * ps, ph = spike.naturalHeight * ps;
      ctx.drawImage(spike, x + T / 2 - pw / 2, y + T * 0.45 - ph, pw, ph);
    } else if (!spike && isFenceEdge(c, r) && ((c + r) & 1) === 0) {
      ctx.fillStyle = 'rgba(20,16,42,.7)';
      ctx.beginPath();
      ctx.moveTo(x + T / 2, y + T * 0.06); ctx.lineTo(x + T * 0.68, y + T * 0.32); ctx.lineTo(x + T * 0.32, y + T * 0.32);
      ctx.closePath(); ctx.fill();
    }
    // Single-pass outline: stroke ONLY the edges that border a non-fence
    // tile — the marching-squares step that keeps internal seams between
    // same-cluster tiles from showing at all. Softened (v29 full-frame
    // gate): a full-strength ink stroke read as a hard cartoon-sticker edge
    // next to her footage's soft painted shading — thin, semi-transparent
    // dark-purple instead.
    ctx.strokeStyle = 'rgba(20,16,42,.5)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    if (!isWall(c, r - 1)) line(ctx, x, y, x + T, y);
    if (edgeS) line(ctx, x, y + T, x + T, y + T);
    if (!isWall(c - 1, r)) line(ctx, x, y, x, y + T);
    if (!isWall(c + 1, r)) line(ctx, x + T, y, x + T, y + T);
    ctx.restore();
  }

  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  // roundRectPath adds ONE rounded-rect subpath to whatever path is already
  // open — safe to call repeatedly inside a loop to accumulate several shapes
  // into one clip/fill/stroke (a single ctx.beginPath() before the loop, this
  // per shape, then .clip()/.fill()/.stroke() once after).
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // roundRect is the standalone convenience form: resets the path, so only use
  // it for a single shape you immediately .fill()/.stroke() — NOT inside a loop
  // building a combined path (that silently keeps only the last iteration).
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); roundRectPath(ctx, x, y, w, h, r); }

  return {
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
    roundRect,
  };
}
