/* Brawl & Seek â€” global config.
 * Visual system v1.0 (LOCKED 07-07-2026) + gameplay constants live here so no
 * module hard-codes a colour or a tuning number. The Concept Brief wins on any
 * design fact; this file is the single place those facts become code.
 */
window.CFG = {
  // Build stamp â€” bump n + the ?v= token in index.html on EVERY commit, together.
  // PM caught a real drift (v27: ?v= tokens bumped, this constant wasn't â€” the
  // live stamp still read "v26" on v27 content). tools/test_touch.py now
  // asserts n === the max ?v= token in index.html, so this can't silently
  // desync again.
    BUILD: { n: 66, date: '09-08-2026', milestone: 'ACID LAKES ARENA PROMOTED' },

  // Palette â€” the six locked roles. Never invent a colour per deliverable.
  palette: {
    navy:    '#1E2340', // background
    yellow:  '#FFC800', // primary accent / display / the player
    magenta: '#FF4FA0', // the paint (camo motif)
    teal:    '#35E0D0', // the tell (interactive / you-are-here ripple)
    chalk:   '#F6F4EF', // text on dark
    ink:     '#14172B', // text on light / outlines
  },

  // World / arena
  tile: 64,            // world px per tile (the camera maps this to the footage-measured screen scale)
  camera: {
    // Directive 001A audit: source world x=116..1201 (1085px), y=0..575
    // (576px); two independent wall runs measure 43px/tile. Ground-contact
    // anchors at 30/45/60s median to x=.486/y=.582. Do not infer from UI.
    source: { tilePx: 43, fieldW: 1085, fieldH: 576 },
    viewTiles: { x: 25.23, y: 13.40 },
    anchor: { x: 0.486, y: 0.582 },
  },

  // The mechanic (Concept Brief Â§"The mechanic")
  repaintTime: 1.0,    // seconds of stillness to fully paint in (M3 toggle: 0.5 / 1 / 2)
  playerSpeed: 4.2,    // tiles per second
  playerRadius: 0.34,  // as a fraction of a tile (collision half-extent)
  camoAlpha: 0.24,     // "strong, not perfect" â€” floor of the hidden silhouette's opacity

  /* Character art â€” PLACEHOLDER vector tokens. Explicit light/body/dark triples
   * (not computed) so the player's signed-off M1 look stays pixel-identical.
   * These get replaced wholesale in the art pass (Fankit first, then our own
   * Brawl-style fan art) â€” the renderer must stay swap-friendly. */
  characters: {
    player: { name: 'YOU', body: '#FFC800', light: '#FFD84A', dark: '#E0A800' },
    dummies: [
      { name: 'PIP',  body: '#7BD389', light: '#9CE3A6', dark: '#57B267' },
      { name: 'ZED',  body: '#C08BE8', light: '#D6ABF3', dark: '#9C68C6' },
      { name: 'MOX',  body: '#FF8A5C', light: '#FFA97F', dark: '#DB6A3F' },
      { name: 'KIRA', body: '#6FC3E8', light: '#95D8F3', dark: '#4A9DC4' },
      { name: 'BOLT', body: '#E8C46F', light: '#F3D894', dark: '#C4A04A' },
      // +2 (20-07-2026, PM-approved dummies 5->7 for the 16x9 widescreen
      // crop). PROVISIONAL roster picks, flagged for confirmation same as
      // everything else this pass â€” not yet cross-checked against the
      // "older brawlers = deepest Fankit coverage" heuristic or a formal
      // green-count/UI-palette collision pass the way the original 5 were.
      { name: 'RUST', body: '#D46A4A', light: '#E8896A', dark: '#B0492E' },
      { name: 'GRIT',  body: '#A8ADC4', light: '#C3C7DB', dark: '#82869E' },
      { name: 'NOVA',  body: '#6ED0B0', light: '#9AE4CB', dark: '#3E9E80' },
    ],
    seeker: { name: 'SEEKER', body: '#FF4F6D', light: '#FF7A92', dark: '#C93450' },
  },
};


