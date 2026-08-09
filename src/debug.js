/* Brawl & Seek — on-screen debug overlay, toggled by ?debug=1. This is the
 * ground-truth instrument: a device recording with this on tells us exactly what
 * the touch path and the movement code are doing, frame by frame. Nothing here
 * changes gameplay — it only reads and draws.
 *
 * Shows: every raw active touch point (where iOS thinks your fingers are), the
 * stick anchor + current vector, intended vs actually-applied velocity, which
 * axes collision blocked this frame, and the iOS gotchas — preventDefault
 * success, touch-action, visualViewport offset (Safari toolbar show/hide), and
 * the selected arena bundle identity. */
(function () {
  let svg, panel, on = false, lastT = 0, fps = 0;
  const SV = 'http://www.w3.org/2000/svg';

  function init() {
    on = true;
    svg = document.createElementNS(SV, 'svg');
    Object.assign(svg.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '20', pointerEvents: 'none' });
    document.body.appendChild(svg);

    panel = document.createElement('pre');
    Object.assign(panel.style, {
      position: 'fixed', left: '8px', top: '64px', zIndex: '21', margin: '0',
      font: '11px/1.35 ui-monospace,Menlo,Consolas,monospace', color: '#F6F4EF',
      background: 'rgba(10,12,24,.82)', border: '1px solid rgba(53,224,208,.35)',
      borderRadius: '8px', padding: '7px 9px', pointerEvents: 'none', whiteSpace: 'pre',
      maxWidth: '62vw', letterSpacing: '.2px',
    });
    document.body.appendChild(panel);
  }

  function n(v) { return (v < 0 ? '' : ' ') + v.toFixed(0); }
  function f2(v) { return (v < 0 ? '' : ' ') + v.toFixed(2); }
  function safeCssPx(cs, name) { const n = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(n) ? Math.round(n) : 0; }
  function docViewport() { return document.documentElement; }

  function frame() {
    if (!on) return;
    const now = performance.now();
    if (lastT) fps = Math.round(0.85 * fps + 0.15 * (1000 / Math.max(1, now - lastT)));
    lastT = now;

    const d = Input.debug();
    const pd = (Player.dbg) || { tvx: 0, tvy: 0, vx: 0, vy: 0, blockedX: false, blockedY: false, hasInput: false };
    const vv = window.visualViewport;
    const bundleName = window.ARENA_BUNDLE.name;
    const bundleIsBlockout = window.ARENA_BUNDLE.isBlockout;
    const bundleKind = bundleIsBlockout ? 'BLOCKOUT' : 'ORDINARY';
    const doc = docViewport();
    const cs = getComputedStyle(doc);
    const safe = {
      top: safeCssPx(cs, '--safe-top'),
      right: safeCssPx(cs, '--safe-right'),
      bottom: safeCssPx(cs, '--safe-bottom'),
      left: safeCssPx(cs, '--safe-left'),
    };
    const fit = (window.Game && typeof Game.fitInfo === 'function') ? Game.fitInfo() : null;
    const rect = d.geometry ? d.geometry.rect : null;

    // ---- SVG layer ----
    let g = '';
    // raw touch points
    for (const t of d.touches) {
      g += `<circle cx="${t.x}" cy="${t.y}" r="26" fill="none" stroke="#35E0D0" stroke-width="2"/>`;
      g += `<circle cx="${t.x}" cy="${t.y}" r="4" fill="#35E0D0"/>`;
      g += `<text x="${t.x + 30}" y="${t.y}" fill="#35E0D0" font-size="12" font-family="monospace">#${t.id}</text>`;
    }
    // stick anchor + vector
    if (d.anchor) {
      g += `<circle cx="${d.anchor.x}" cy="${d.anchor.y}" r="6" fill="none" stroke="#FFC800" stroke-width="2"/>`;
      if (d.cur) g += `<line x1="${d.anchor.x}" y1="${d.anchor.y}" x2="${d.cur.x}" y2="${d.cur.y}" stroke="#FFC800" stroke-width="3"/>`;
    }
    // player screen position + velocity arrows (intended = yellow, applied = magenta)
    if (window.Game && Game.scale) {
      const sx = Game.off.x + Player.x * Game.scale, sy = Game.off.y + Player.y * Game.scale;
      const s = 0.11;
      g += `<circle cx="${sx}" cy="${sy}" r="5" fill="#F6F4EF"/>`;
      g += `<line x1="${sx}" y1="${sy}" x2="${sx + pd.tvx * s}" y2="${sy + pd.tvy * s}" stroke="#FFC800" stroke-width="3" opacity=".9"/>`;
      g += `<line x1="${sx}" y1="${sy}" x2="${sx + pd.vx * s}" y2="${sy + pd.vy * s}" stroke="#FF4FA0" stroke-width="3" opacity=".9"/>`;
    }
    svg.innerHTML = g;

    // ---- text panel ----
    const ta = (() => { const el = document.getElementById('stage'); return el ? getComputedStyle(el).touchAction : '?'; })();
    const touchList = d.touches.map((t) => `#${t.id}(${t.x.toFixed(0)},${t.y.toFixed(0)})`).join(' ') || '—';
    panel.textContent = [
      `DEBUG  mode:${d.mode}   fps:${fps}`,
      `ARENA BUNDLE: ${bundleKind}  name:${bundleName}  isBlockout:${bundleIsBlockout}`,
      `touches(${d.touches.length}): ${touchList}`,
      `anchor: ${d.anchor ? `(${d.anchor.x.toFixed(0)},${d.anchor.y.toFixed(0)})` : '—'}  cur: ${d.cur ? `(${d.cur.x.toFixed(0)},${d.cur.y.toFixed(0)})` : '—'}`,
      `stick vec: (${f2(d.vec.x)},${f2(d.vec.y)})  mag ${d.mag.toFixed(2)}`,
      `intended v: (${n(pd.tvx)},${n(pd.tvy)}) px/s`,
      `applied  v: (${n(pd.vx)},${n(pd.vy)}) px/s`,
      `blocked:  X:${pd.blockedX ? 'YES' : 'no'}  Y:${pd.blockedY ? 'YES' : 'no'}   input:${pd.hasInput ? 'yes' : 'no'}`,
      `player: hidden:${Player.hidden} prog ${Player.progress.toFixed(2)} still ${Player.still.toFixed(1)}s found:${Player.found}`,
      `round: ${Round.phase} t=${Round.elapsed.toFixed(1)}s left=${Round.timeLeft().toFixed(0)}s repaint=${Round.repaintTime().toFixed(1)}s`,
      `score: ${Math.round(Round.score)} rate ${Round.rate.toFixed(1)}/s camp ${Round.camp.toFixed(1)}s  found ${Round.foundCount} alive ${Round.hidersAlive()}`,
      `seekers(${Seekers.active().length}) spd ${Seekers.speedOf().toFixed(2)}: ${Seekers.list.map((s) => `${s.state}/hp${Math.max(0, s.health)}/m${s.mistakes}`).join(' ') || '—'}`,
      `tags in flight: ${Tags.list.length}  cd: ${Seekers.list.map((s) => Math.max(0, s.tagCd).toFixed(2)).join(' ') || '—'}`,
      `view: ${STATE.view}  surfaces: ${Object.entries(STATE.camoSurfaces).filter(([, v]) => v).map(([k]) => k).join('+') || 'none'}  repaint ${STATE.repaintTime}s  tell:${STATE.rippleTell ? 'on' : 'off'}`,
      `speed x${STATE.speedScale.toFixed(2)}  (player ${(CFG.playerSpeed * STATE.speedScale).toFixed(2)} · seeker ${Seekers.speedOf().toFixed(2)} · tag ${(TUNING.seeker.baseSpeed * TUNING.tag.speedMult * STATE.speedScale).toFixed(2)} tiles/s)`,
      `pd:${d.pdOk ? 'ok' : 'NO'}  last:${d.lastType}  evts:${d.evtCount}`,
      `rotation: ${d.rotation ? 'mobile-portrait' : 'upright'}  stage: ${d.geometry ? d.geometry.width.toFixed(0) + '×' + d.geometry.height.toFixed(0) + ' rect(' + d.geometry.rect.left.toFixed(0) + ',' + d.geometry.rect.top.toFixed(0) + '→' + d.geometry.rect.right.toFixed(0) + ',' + d.geometry.rect.bottom.toFixed(0) + ')' : '?'}`,
      `FIT: rot:${d.rotation ? 'on' : 'off'} innerW/H:${innerWidth}x${innerHeight} docW/H:${doc.clientWidth}x${doc.clientHeight} vvW/H:${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}@${Math.round(vv.offsetTop)}` : 'n/a'} screen:${screen.width}x${screen.height} rect:${rect ? `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}` : 'n/a'} axes:${fit && fit.active ? `${fit.longAxis}x${fit.shortAxis}` : 'inactive'} safe(T,R,B,L):${safe.top}/${safe.right}/${safe.bottom}/${safe.left}`,
      `vv: off(${vv ? vv.offsetLeft.toFixed(0) + ',' + vv.offsetTop.toFixed(0) : '?'}) h ${vv ? vv.height.toFixed(0) : '?'} / inner ${innerHeight}  dpr ${window.devicePixelRatio}`,
      `touch-action(stage): ${ta}`,
    ].join('\n');
  }

  window.Debug = { init, frame, get on() { return on; } };
})();
