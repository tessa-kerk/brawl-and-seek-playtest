/* game/src/blockout-validate.js — Gate 0 item 2/3 / A18 §§C1(step iv)/C4.
 *
 * Two things live in this one file, deliberately:
 *
 *   1. The CANONICAL bundle-spec builder (`buildBundleSpec` / `canonicalStringify`
 *      below) — the ONE object shape `input_spec_hash` is computed from.
 *      Gate 0 item 2 requires this to be shared, not re-implemented twice
 *      (a generator-side copy and a validator-side copy silently drifting is
 *      exactly the failure mode a hash gate exists to catch). This file is
 *      written so the SAME functions run under Node (via `module.exports`,
 *      consumed by `tools/generate_bundle_manifest.js`, the offline
 *      generator that produces `game/assets/world/blockout/manifest.json`)
 *      and under the browser (via `window.BlockoutSpec`, consumed by part 2
 *      below). There is no second implementation anywhere in the repo.
 *
 *   2. The browser-side async runtime validator itself (only runs when
 *      `window.ARENA_BUNDLE.isBlockout` is true — bundle IDENTITY, never a
 *      raw `?blockout=1` re-check, per Gate 0 item 1). Fetches the RAW BYTES
 *      of the 3 mask PNGs + the manifest, recomputes `input_spec_hash` from
 *      the LIVE selected bundle + CFG, recomputes each PNG's SHA-256,
 *      recomputes `manifest_hash`, and resolves `window.__blockoutValidation`
 *      to `{ok, reason}`. `game.js`'s `boot()` awaits this before ever
 *      calling `start()` — on failure, `start()` is never called (A18 §4.2).
 *
 * Two-level hash design (A18 §C4 — fixes the old circular design where a PNG
 * embedded a hash of itself): input_spec_hash (level 1) depends only on
 * spec/config, never on any PNG's bytes. The completed manifest (level 2,
 * `game/assets/world/blockout/manifest.json`) records input_spec_hash plus
 * each PNG's real on-disk SHA-256 as an OUTPUT, computed after generation,
 * never fed back upstream. manifest_hash = sha256 of the manifest's own
 * content with ONLY the `manifest_hash` field itself excluded — Gate 0 item 2
 * fixes the old A21 formula, which also excluded `manifest_hash_formula`;
 * that field now stays INSIDE the hashed content (see
 * tools/generate_bundle_manifest.js).
 */
(function (root) {
  'use strict';

  // ---- Canonical bundle spec (shared, see file header) -------------------
  function canonicalStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
  }

  function buildBundleSpec(input) {
    const sortedProps = (input.props || [])
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, radius: p.radius }));
    return {
      grid_ascii: input.grid.join('\n'),
      boundary_policy: { id: input.boundaryPolicy.id, decorativeRows: input.boundaryPolicy.decorativeRows },
      active_props: sortedProps,
      resolution: { source_tile_px: input.sourceTilePx, cfg_tile_px: input.cfgTilePx },
      player_radius_fraction: input.playerRadiusFraction,
      contact_band_version: input.contactBandVersion,
      mask_generator_version: input.maskGeneratorVersion,
    };
  }

  // Version tags per A18 §C4 — restated here (not just in the manifest) so a
  // future change to either the contact-band algorithm or the mask generator
  // has one obvious place to bump, which then automatically invalidates every
  // hash downstream.
  const SOURCE_TILE_PX = 43;               // matches world_mask_wall/lake/d025 convention
  const CONTACT_BAND_VERSION = 'contact-band-v1-height6';           // sourceMaskData()'s hardcoded 6px band
  const MASK_GENERATOR_VERSION = 'mask-generator-v1-amend_generate_masks'; // masks are byte-unchanged since this generator ran

  const BundleSpec = {
    canonicalStringify,
    buildBundleSpec,
    SOURCE_TILE_PX,
    CONTACT_BAND_VERSION,
    MASK_GENERATOR_VERSION,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BundleSpec;
  }
  if (typeof window === 'undefined') return; // Node offline-generator context stops here.

  window.BlockoutSpec = BundleSpec;

  // ---- Browser runtime validator (A18 §C1 step iv) ------------------------
  const MASK_FILES = {
    wall: 'assets/world/blockout/blockout-mask-wall.png',
    lake: 'assets/world/blockout/blockout-mask-lake.png',
    foliage: 'assets/world/blockout/blockout-mask-foliage.png',
  };
  const MANIFEST_URL = 'assets/world/blockout/manifest.json';

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function fetchBytes(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed: ' + url + ' (' + res.status + ')');
    return new Uint8Array(await res.arrayBuffer());
  }

  function fail(reason) { return { ok: false, reason }; }

  async function validate() {
    const bundleInfo = root.ARENA_BUNDLE;
    if (!bundleInfo || !bundleInfo.isBlockout) {
      // Ordinary path: zero fetch/hash cost, resolves immediately. Unaffected
      // in behaviour or byte-cost — unchanged from A18 §4.2's rule, restated
      // here because the loader now spans more files (A18 §C1).
      return { ok: true, skipped: true };
    }
    const arena = root.ARENA; // already selected synchronously by bundle-select.js
    try {
      const [manifestBytes, wallBytes, lakeBytes, foliageBytes] = await Promise.all([
        fetchBytes(MANIFEST_URL),
        fetchBytes(MASK_FILES.wall),
        fetchBytes(MASK_FILES.lake),
        fetchBytes(MASK_FILES.foliage),
      ]);

      let manifest;
      try {
        manifest = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes));
      } catch (e) {
        return fail('manifest JSON parse failed: ' + e.message);
      }

      // Level 1 — input_spec_hash, recomputed from the LIVE selected bundle + CFG.
      const spec = buildBundleSpec({
        grid: arena.grid,
        boundaryPolicy: arena.boundaryPolicy,
        props: arena.props || [],
        sourceTilePx: SOURCE_TILE_PX,
        cfgTilePx: root.CFG.tile,
        playerRadiusFraction: root.CFG.playerRadius,
        contactBandVersion: CONTACT_BAND_VERSION,
        maskGeneratorVersion: MASK_GENERATOR_VERSION,
      });
      const inputSpecHash = await sha256Hex(new TextEncoder().encode(canonicalStringify(spec)));
      if (inputSpecHash !== manifest.input_spec_hash) {
        return fail('input_spec_hash mismatch: live=' + inputSpecHash + ' manifest=' + manifest.input_spec_hash);
      }

      // Level 2a — each mask PNG's real on-disk SHA-256, fetched fresh.
      const maskBytes = { wall: wallBytes, lake: lakeBytes, foliage: foliageBytes };
      for (const key of Object.keys(maskBytes)) {
        const h = await sha256Hex(maskBytes[key]);
        const expect = manifest.images && manifest.images[key] && manifest.images[key].sha256;
        if (h !== expect) return fail(key + ' mask sha256 mismatch: live=' + h + ' manifest=' + expect);
      }

      // Level 2b — manifest_hash, recomputed over the manifest's own content
      // with ONLY manifest_hash itself excluded (manifest_hash_formula stays
      // inside the hashed content — Gate 0 item 2's fix to the old A21 bug,
      // which excluded both fields and therefore never actually bound its
      // own formula string into the hash it produced).
      const rest = {};
      for (const k of Object.keys(manifest)) if (k !== 'manifest_hash') rest[k] = manifest[k];
      const recomputed = await sha256Hex(new TextEncoder().encode(canonicalStringify(rest)));
      if (recomputed !== manifest.manifest_hash) {
        return fail('manifest_hash mismatch: live=' + recomputed + ' manifest=' + manifest.manifest_hash);
      }

      return { ok: true, inputSpecHash, manifestHash: recomputed };
    } catch (e) {
      return fail('validation threw: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // Starts immediately at script-parse time (in parallel with image preload,
  // per A18 §C1's index.html placement note) — its result is only consumed
  // later, by game.js's boot(). window.ARENA_BUNDLE already exists by now
  // (bundle-select.js runs earlier in script order), so this never races it.
  root.__blockoutValidation = validate();
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
