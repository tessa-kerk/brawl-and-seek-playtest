/* Brawl & Seek — arena data (data-driven; no map geometry lives in logic).
 * WIDESCREEN CROP (20-07-2026, Concept Brief rule 3j/3i, PM-cleared 16×9):
 * "a square arena can be played portrait — it breaks the fiction" (Tessa).
 * The original 10×9 top-left corner (cols0-9) is UNCHANGED — its layout was
 * already fact-checked against the real map render and is provisionally
 * still trustworthy for TILE POSITIONS even though that render's RENDERING
 * STYLE was demoted (rule 3i — a wiki map render is layout-only, never a
 * palette/art reference). Six columns (10-15) are appended along the same
 * true top edge to reach 16:9.
 *
 * HONEST SCOPING NOTE on cols10-15: Tessa's own footage
 * (`Art/2026-07-20 - Tessa's own recording - Acid Lakes bot match.mp4`,
 * ledger H7) does not include a clean top-down establishing shot of this
 * exact map edge extending further right — her recording is mid-match
 * gameplay, not a map-select fly-through. These six columns are therefore a
 * FOOTAGE-INFORMED, PATTERN-MATCHED extension (a bush cluster, a second
 * small organic pool, a wall-block cluster — all features her recording
 * confirms genuinely exist on this map and repeat across it), not a literal
 * pixel trace of an unseen region. Flagged for the PM's clear, same as
 * everything else this pass — not presented as more precise than it is.
 *
 * Real edges vs. cut edges, unchanged in kind: row0/col0 are the map's own
 * TRUE boundary (top + left, the spiky wall border — now continued across
 * the full 16-wide top edge, since a border doesn't stop mid-map). Col15
 * (right, was col9) and row8 (bottom) are crop cuts, not real edges.
 * REVISED 20-07-2026 (Concept Brief rule 3l): these no longer get a dimmed
 * fade — the full-bleed ground (Arena.drawGround) just keeps going past
 * them at full brightness, which reads as "the map continues" more honestly
 * than a fade ever did (a fade that stops is itself a visible rectangle).
 *
 * BUSH GAP RESOLVED (was HONEST GAP in the 10-col version): the original
 * corner genuinely had zero bush tiles, flagged not hidden. Her own footage
 * confirms bushes ARE a real feature of this map (teal foliage clusters),
 * so the widescreen extension gives the 4th Map Maker toggle its first real
 * tiles on this grid — see the bush cluster at cols10-12, row2.
 *
 * Legend:  #  wall (solid, a chunky Brawl-style block, qualifies as camo)
 *          ~  water (solid to walk into, qualifies as camo when adjacent)
 *          b  bush (a real camo surface, walkable, priority wall > bush >
 *             water > floor)
 *          .  floor (walkable; always qualifies as camo where you stand)
 *          S  spawn (floor)
 *
 * Surface palette moved toward her footage's actual current theme (dark
 * violet-purple ground, teal foliage, glowing acid-green water) — the
 * procedural FALLBACK colours only; the real generated textures redo
 * against her frames in the next batch (held for PM clear + Tessa's budget
 * yes, Concept Brief rule 3j).
 *
 * ESTABLISHING PAN REVIEWED (21-07-2026, Concept Brief rule 3l): the PM's
 * "no establishing shot exists" claim was wrong — her Acid Lakes recording
 * DOES have a match-intro pan (~14–16s) with a clean overhead of the map
 * centre. Extracted at native res (`Art/Acid Lakes Real Footage Reference/`
 * scratch — pan_14.0s through pan_17.0s) and used to cross-check this grid's
 * cluster SHAPES: the fence run, bush mass, pool silhouette and general
 * cover density all match what the pan shows for this map. Honest limit,
 * stated plainly: the pan has no gridline overlay (unlike the original
 * top-left corner trace, which did), so this is a confirmed-shape review,
 * not a pixel-precise re-trace — cols10-15 stay footage-INFORMED rather
 * than footage-TRACED. The layered rendering rebuild (below/`src/arena.js`)
 * was the pan's main payoff this round: it's what let a genuine fence
 * structure, real prop types (stump/barrels/bones) and correct floor
 * texture replace guesses.
 */
// GATE 0 / staged-implementation change (Implementation Session 1, 05-08-2026):
// this file now defines TWO named bundles instead of one live `window.ARENA`
// object. `window.ARENA` itself is assigned by the NEW `src/bundle-select.js`
// (loaded immediately after this file, before any other runtime script reads
// it — see index.html and A18 §§C1/C8), which selects between them
// SYNCHRONOUSLY based on bundle identity (never on scattered `?blockout=1`
// re-checks downstream — Gate 0 item 1). Both bundles carry their own
// `boundaryPolicy` (Gate 0 item... / A18 §C2) so `src/arena.js` derives its
// `BOUNDARY` constant from whichever bundle was selected, not a hardcoded
// three-row rule.
//
// ARENA_ORDINARY is BYTE-IDENTICAL in content to the `window.ARENA` object
// this file used to export directly — same grid, same props, same surfaces —
// with one addition (`boundaryPolicy`) whose value reproduces today's
// hardcoded behaviour exactly (`decorativeRows: 3` ⟺ the old `r <= 2` rule).
// This is the no-flag, no-override default; nothing about the ordinary path
// changes behaviourally until a future promotion flips
// `bundle-select.js`'s DEFAULT_BUNDLE_NAME constant.
window.ARENA_ORDINARY = {
  // 16 wide × 9 tall (was 10×9) — 16:9, PM-cleared widescreen crop. Height
  // unchanged (still the compact scale that fit the mode's tuned pacing;
  // "don't oversize" per the Meccha lesson still applies to depth, just not
  // width). col0/row0 = the map's true left/top edge, continued in kind
  // across the new width, not reinvented.
  // Directive 001 (23-07-2026): 32×18 = two footage-measured 16×9 camera
  // views, deliberately not a full 61×61 map. The top row remains a genuine
  // edge; the right/bottom are rendered, playable buffer content.
  // 001A legend: source-visible pan region = rows 0-8 / cols 0-15; all
  // remaining cells are FOOTAGE-INFORMED CONTINUATION using only recorded
  // structure/prop types. 50x27 is ~two audited 25.23x13.40 views, not 61x61.
  // Offline-authoring source of truth: the approved 43px wall, bush and lake
  // masks were reduced to stable cell occupancy (20% coverage cutoff). The
  // runtime never samples anti-aliased plate pixels for collision.
  grid: [
    'b.####bbbbbbb.bbbbbbbbbb.bbbbb###..bbbbbbbbbbbbbbb',
    'b#####bbbbbbbb#bbb#######bbbb#####bbbb##b#bbbbbbbb',
    '#########b######bb#bbbbbbb##b#####bbbbbb##..######',
    '#########b######bbbbbbbbbbbbbbbbbbbbbbbbbb########',
    '#bbb#####bb####bbbbbbbbbbbbbb...bbbbbbbbb#########',
    '#bb..~.....#####.............####.....b##..~~~...#',
    '#b.~~~~.....###.........bb#...###.....###.~~~~~..#',
    '#b.~~~~~bb...bb###b.....bb#........#..###.~~~~~~.#',
    '#...~~##bbb..b####b......b#S.......#..###..~#~#.##',
    '#..bbb###....b####...#.####........#..###..####..#',
    '#..bb####....b###...bbbb###...........bb#.........',
    '#..bb###.....b###..bbbb~~~.....###....bbb.........',
    '#.................bbbb~~~~~.....bbb....bbb....####',
    'bbbbb.............bbb~~~~~~~.....b....bbbb....####',
    'bbbbb.............bbbb~~~~##....#....bbbbb....###.',
    'bbbbb....~~........bbbb~~~##........bbbbbb.....##.',
    'bbbbb..~~~~......#..bbbbbbbbb..#####.bbbbb.....##.',
    'b.......~~~..####.....bbbbb...######..bbbb.....##.',
    'b.............###.............###......bbb........',
    '..............~~~...............#####.............',
    '.............~~~~~~.............######....~~......',
    '............~~~~~~~.............#####....~~~~~...b',
    'bbbb#........~~~~~~.......bb..........#.~~~~~~...b',
    'bbbb##........###........bbbb..........#.~~~~~....',
    'bbbb##...#....###......bbbbbb..........##..~~.....',
    'bbb#######............bbbbbbb....#....#.#........#',
    'bbbbb....#............bbbbbbb....######.........##',
  ],

  surfaces: {
    floorA: '#2A2140',
    floorB: '#332B52',
    wallTop:  '#6B6FB8',
    wallSide: '#3A3868',
    water:    '#3ED45A',
    waterHi:  '#7CF08A',
    bush:     '#2E9CA0',
    bushHi:   '#4FCBC8',
  },

  /* Hand-traced collision bases for every barrel and hollow tree stump baked
   * into the approved source-atlas plate. Coordinates are in
   * world pixels (43 px source cells), radii describe the visible ground base
   * rather than the tall painted silhouette. Fossils/bones are intentionally
   * absent: they remain decorative and walkable. */
  props: [
    { id: 'stump-01', kind: 'stump', x: 156,   y: 270, radius: 13 },
    { id: 'stump-02', kind: 'stump', x: 863.6, y: 225, radius: 13 },
    { id: 'stump-03', kind: 'stump', x: 993.5, y: 323, radius: 13 },
    { id: 'stump-04', kind: 'stump', x: 2019.8,y: 270, radius: 13 },
    { id: 'stump-05', kind: 'stump', x: 135.3, y: 389, radius: 13 },
    { id: 'stump-06', kind: 'stump', x: 1190,  y: 640, radius: 13 },
    { id: 'stump-07', kind: 'stump', x: 1493.4,y: 530, radius: 13 },
    { id: 'stump-08', kind: 'stump', x: 1604,  y: 650, radius: 13 },
    { id: 'stump-09', kind: 'stump', x: 341.6, y: 678, radius: 13 },
    { id: 'stump-10', kind: 'stump', x: 500.6, y: 678, radius: 13 },
    { id: 'stump-11', kind: 'stump', x: 623.5, y: 692, radius: 13 },
    { id: 'stump-12', kind: 'stump', x: 772.5, y: 772, radius: 13 },
    { id: 'stump-13', kind: 'stump', x: 328.7, y: 790, radius: 13 },
    { id: 'stump-14', kind: 'stump', x: 595.7, y: 831, radius: 13 },
    { id: 'stump-15', kind: 'stump', x: 924.1, y: 857, radius: 13 },
    { id: 'stump-16', kind: 'stump', x: 1967.1,y: 906, radius: 13 },
    { id: 'stump-17', kind: 'stump', x: 1080.8,y: 949, radius: 13 },
    { id: 'stump-18', kind: 'stump', x: 530.9, y: 997, radius: 13 },
    { id: 'stump-19', kind: 'stump', x: 1985.4,y: 1040,radius: 13 },
    { id: 'stump-20', kind: 'stump', x: 1139.5,y: 494.5, radius: 13 },
    { id: 'barrel-01', kind: 'barrel', x: 382,  y: 420, radius: 14 },
    { id: 'barrel-02', kind: 'barrel', x: 433,  y: 420, radius: 14 },
    { id: 'barrel-03', kind: 'barrel', x: 1282, y: 315, radius: 16 },
    { id: 'barrel-04', kind: 'barrel', x: 1484, y: 418, radius: 14 },
    { id: 'barrel-05', kind: 'barrel', x: 1988, y: 675, radius: 14 },
    { id: 'barrel-06', kind: 'barrel', x: 1988, y: 720, radius: 14 },
    { id: 'barrel-07', kind: 'barrel', x: 125,  y: 860, radius: 14 },
    { id: 'barrel-08', kind: 'barrel', x: 1565, y: 855, radius: 14 },
    { id: 'barrel-09', kind: 'barrel', x: 1357, y: 905, radius: 14 },
  ],

  // Ordinary default: today's shipped rule, unchanged (r<=2 excluded ⟺ r<3).
  boundaryPolicy: { decorativeRows: 3, id: 'ordinary-3row-default' },
};

/* ARENA_BLOCKOUT_CANDIDATE — the staged 50×27 Acid Lakes trace, selected only
 * when the runtime's bundle identity is 'blockout' (via the `?blockout=1`
 * flag pre-promotion, or the promoted default post-promotion — see
 * `src/bundle-select.js`). Source: the fully-verified, hash-locked package at
 * `Art/2026-08-05 - Arena Blockout Package/`:
 *   - Grid: `01-exact-trace-50x27-PROPOSED-NOT-APPLIED.txt`, sha256
 *     b011259e62243c7006a87977d6fbeaf5b43eb8c2671c75db9edf4984b111fa2d
 *     (independently re-parsed and re-hashed this session — matches exactly;
 *     transcribed programmatically, never hand-typed, to rule out transcription
 *     error — see IMPL1-RECORD.md).
 *   - Props: ZERO active (A15/A16/A20/A21's adopted "park all 29" default —
 *     NOT the amendment's superseded 22-KEEP set). All 29 original stump/
 *     barrel colliders stay defined on ARENA_ORDINARY.props above, untouched;
 *     none are ported into this bundle. Reintroduction is explicitly Pass 2
 *     scope, evidence-gated, not this pass's call.
 *   - boundaryPolicy: `decorativeRows: 0`, id `amendment-04-08-2026-default`
 *     — the adopted policy (no blanket top-row exclusion; traced row-0 bush
 *     is ordinary walkable terrain; true outer world bounds are the only
 *     boundary). Same id `amend_common.py`'s BOUNDARY_POLICY already uses —
 *     continuity with the already-adopted policy, not a new invention.
 *   - surfaces: reuses ARENA_ORDINARY's palette. Pass 2 (visual art, out of
 *     this session's scope) paints real wall/pool/foliage plate art on top of
 *     the PERMANENT collision masks; this blockout stage never touches
 *     palette/art, only geometry + collision + staging plumbing.
 */
window.ARENA_BLOCKOUT_CANDIDATE = {
  grid: [
    '.bbbb.....bbbbbbbbbbbbbbbb.#######.bbbbbbbbbbbbbb.',
    '.bbbbb~~~~bbbbbbbbbbbbbbbbb#######bbbbbbbbbbbbbbbb',
    '.bbbbb~~~#bb.......bbbbb.bbb#####bbb.bbbbb......bb',
    '.bbb...~~#b.........bbb...bb#####bb...bbb.........',
    '.bb....~~#b................bb###bb................',
    '.~b.....~...............##.bbbbbbb.##.............',
    '.~~.........................bbbbb.............b#..',
    '.~~~~...............bbbbb...........bbbbb.....b#..',
    '.~~#~#...~~........bb##bb...........bb##bb....b...',
    '.bbbb...~~~........bb.##b...........b##.bb........',
    '.bbbb...~~~..##........#b.bbb...bbb.b#........##..',
    '.bb...................##b..b.....b..b##...bbb.....',
    '.b............~~.......bb...........bb...bbbb~~...',
    '.b...........~~~~..........#.....#.......bbb~~~~..',
    '.bb.........~~~~~~.........#.....#.......bbb~~~~~.',
    '.bbb........~~~~~..........#.....#.......bbb~~~~~.',
    '.bbbb........~~~......bbb................bbb.~~##.',
    '.bbbb.........##......bbb.bbb...bbb.......bbbbbbb.',
    '.bbbb..####..........bbbb.bbb...bbb........bbbbbb.',
    '.bbb......#........bbbbbb...#####...........bbbb..',
    '.bb................bbbbb...bbbbbbb................',
    '.b...#..............bbbb...bbbbbbb................',
    '.b...####.........................................',
    '.bb...............................................',
    '.bb..............~~~......~~~...~~~......~~~......',
    '.bbb.............~~~.....~~~~...~~~~....bb~~......',
    '.#bbb............###....~~~~~...~~~~~...bbb.......',
  ],

  surfaces: window.ARENA_ORDINARY.surfaces,

  // Zero-prop adopted authority (A15/A16/A20/A21) — no colliders under blockout.
  props: [],

  boundaryPolicy: { decorativeRows: 0, id: 'amendment-04-08-2026-default' },
};
