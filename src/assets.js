/* Approved public-runtime asset preloader. */
(function () {
  const specs = {
    world_plate: 'assets/world/v55-d028ag-fossil-outline-plate-c8-v2.png',
    world_plate_source: 'assets/world/d003-world-plate-approved.png',
    world_floor_master: 'assets/world/floor_d002.png',
    world_mask_wall: 'assets/world/d003-mask-wall.png',
    world_mask_lake: 'assets/world/d003-mask-lake.png',
    world_collision_sdf: 'assets/world/v55-d028b-collision-field.png',
    world_mask_bush: 'assets/world/d003-mask-bush.png',
    world_d025_bush_base: 'assets/world/v55-d025-bush-base-2150x1161.png',
  world_d025_bush_foreground: 'assets/world/v55-d028ag-repaired-foreground-2150x1161-c8-v2.png',
    world_d025_leaf_mask: 'assets/world/v55-d025-leaf-mask-2150x1161.png',
    world_d028e_leaf_alpha: 'assets/world/v55-d028ag-bush-only-alpha-c8-v2.png',
    // SET ASIDE (Pass 0 punch list item 2b, 04-08-2026): world_d028i_leaf_alpha pointed at
    // the exact same file as world_d028e_leaf_alpha above and was never referenced by that
    // key anywhere in the codebase (confirmed by repo-wide search) — an unused duplicate
    // preload of an asset already loaded under the d028e key. Commented rather than deleted
    // per the reboot plan's hard line ("no deletes, set aside instead"). See PASS0-RECORD.md.
    // world_d028i_leaf_alpha: 'assets/world/v55-d028ag-bush-only-alpha-c8-v2.png',
    world_leaf_owner_atlas: 'assets/world/v55-d028ag-leaf-owner-atlas-c8-v2.png',
      bones_skull: 'assets/world/v53a-fossil-skull.png',
      bones_ribs: 'assets/world/v53a-fossil-ribs.png',
      bones_pair: 'assets/world/v53a-fossil-bone-pair.png',
      bones_single: 'assets/world/v53a-fossil-single-bone.png',
    tag_icon: 'assets/ui/tag_icon.png',
    camo_icon: 'assets/ui/camo_icon.png',
  };
  // Gate 0 item 1 / A18 §C1 step (iii): conditional blockout-mask specs.
  // Gated on BUNDLE IDENTITY (window.ARENA_BUNDLE, set synchronously by
  // src/bundle-select.js, which runs before this file — see index.html script
  // order) — NEVER an independent re-read of ?blockout=1 here. The ordinary
  // path never pays this fetch cost: these 3 extra images are only added to
  // the preload map when the selected bundle is actually 'blockout'.
  if (window.ARENA_BUNDLE && window.ARENA_BUNDLE.isBlockout) {
    specs.blockout_mask_wall = 'assets/world/blockout/blockout-mask-wall.png';
    specs.blockout_mask_lake = 'assets/world/blockout/blockout-mask-lake.png';
    specs.blockout_mask_foliage = 'assets/world/blockout/blockout-mask-foliage.png';
  }
  const imgs = {};
  const settled = [];
  for (const k in specs) {
    const im = new Image(); im.decoding = 'async';
    settled.push(new Promise((resolve) => {
      const done = (ok) => resolve({ key: k, ok });
      im.onload = () => { const decoded = im.decode ? im.decode() : Promise.resolve(); decoded.then(() => done(true), () => done(true)); };
      im.onerror = () => done(false);
    }));
    im.src = specs[k]; imgs[k] = im;
  }
  let atomicReady = false, atomicFailed = [];
  const ready = Promise.all(settled).then((states) => {
    atomicFailed = states.filter((s) => !s.ok).map((s) => s.key);
    atomicReady = atomicFailed.length === 0;
    return { ok: atomicReady, failed: atomicFailed.slice() };
  });
  window.Assets = {
    get(k) {
      if (!atomicReady) return null;
      const i = imgs[k]; return (i && i.complete && i.naturalWidth > 0) ? i : null;
    },
    ready,
    status() { return { ready: atomicReady, failed: atomicFailed.slice() }; },
    raw: imgs,
  };
})();
