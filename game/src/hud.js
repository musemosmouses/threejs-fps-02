// HUD: all DOM readouts — health, ammo, money, timer, score, killfeed,
// crosshair, banners, buy menu, plant bar and a live minimap. The sim
// calls setters; this module never reads game state on its own.
import { MAP } from './map.js';
import { SHOP } from './weapons.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const minimap = el('minimap');
  const mctx = minimap ? minimap.getContext('2d') : null;
  let bannerTimer = null;
  let objectiveTimer = null;
  let playCb = null;
  let buyCb = null;

  const buyEl = el('buymenu');
  if (buyEl) {
    buyEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-buy]');
      if (row && buyCb) buyCb(row.dataset.buy);
    });
  }
  const playBtn = el('play');
  if (playBtn) playBtn.addEventListener('click', () => { if (playCb) playCb(); });

  return {
    onPlay(cb) { playCb = cb; },
    onBuy(cb) { buyCb = cb; },
    setHealth(hp, armor) {
      const h = el('health-num');
      if (h) h.textContent = Math.ceil(hp);
      const hb = el('health-bar');
      if (hb) hb.style.width = `${Math.max(0, hp)}%`;
      const ab = el('armor-bar');
      if (ab) ab.style.width = `${Math.max(0, armor)}%`;
      const aw = el('armor-wrap');
      if (aw) aw.style.opacity = armor > 0 ? '1' : '0.25';
    },
    setAmmo(mag, reserve, name) {
      const m = el('ammo-mag');
      if (m) m.textContent = mag;
      const r = el('ammo-reserve');
      if (r) r.textContent = `/ ${reserve}`;
      const w = el('weapon-name');
      if (w) w.textContent = name || '';
      const a = el('ammo');
      if (a) a.classList.toggle('empty', mag === 0);
    },
    setMoney(m) {
      const e = el('money');
      if (e) e.textContent = `$${m}`;
    },
    setTimer(t) {
      const e = el('timer');
      if (e) e.textContent = t <= 0 ? '0:00' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      if (e) e.classList.toggle('low', t <= 15 && t > 0);
    },
    setScore(ember, ashen) {
      const e = el('score-teams');
      if (e) e.textContent = `${ember} : ${ashen}`;
    },
    setAlive(ember, ashen) {
      const e = el('alive');
      if (e) e.textContent = `${ember}v${ashen}`;
    },
    setRound(n) {
      const e = el('round-num');
      if (e) e.textContent = `ROUND ${n}`;
    },
    setCrosshairGap(px) {
      const c = el('crosshair');
      if (c) c.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(kill, holdMs = 120) {
      const h = el('hitmarker');
      if (!h) return;
      h.classList.add('on');
      h.classList.toggle('kill', !!kill);
      clearTimeout(h._t);
      h._t = setTimeout(() => h.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      const v = el('vignette');
      if (!v) return;
      v.classList.add('on');
      clearTimeout(v._t);
      v._t = setTimeout(() => v.classList.remove('on'), 180);
    },
    damageFrom(angleDeg) {
      const d = el('damage-dir');
      if (!d) return;
      d.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
      d.classList.add('on');
      clearTimeout(d._t);
      d._t = setTimeout(() => d.classList.remove('on'), 500);
    },
    killfeed(killer, victim, weapon, headshot) {
      const feed = el('killfeed');
      if (!feed) return;
      const row = document.createElement('div');
      row.className = 'kf-row';
      const kc = killer.team === 'ember' ? 'ember' : 'ashen';
      const vc = victim.team === 'ember' ? 'ember' : 'ashen';
      row.innerHTML = `<span class="${kc}">${killer.name}</span> <span class="kf-w">${headshot ? '◉ ' : ''}${weapon}</span> <span class="${vc}">${victim.name}</span>`;
      feed.prepend(row);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    hideBanner() {
      const b = el('banner');
      if (!b) return;
      b.classList.remove('on');
      clearTimeout(bannerTimer);
    },
    showBanner(title, sub, seconds = 2.5) {
      const b = el('banner');
      if (!b) return;
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub || '';
      b.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => b.classList.remove('on'), seconds * 1000);
    },
    flashObjective(text) {
      const o = el('objective');
      if (!o) return;
      o.textContent = text;
      o.classList.add('on');
      clearTimeout(objectiveTimer);
      objectiveTimer = setTimeout(() => o.classList.remove('on'), 4000);
    },
    setPlantProgress(frac, label) {
      const w = el('plant-wrap');
      if (!w) return;
      w.style.display = frac > 0 ? 'block' : 'none';
      const bar = el('plant-bar');
      if (bar) bar.style.width = `${Math.round(frac * 100)}%`;
      const lab = el('plant-label');
      if (lab) lab.textContent = label || '';
    },
    setBombStatus(text) {
      const e = el('bomb-status');
      if (e) e.textContent = text || '';
    },
    setBuyOpen(open, money, loadout) {
      if (!buyEl) return;
      buyEl.hidden = !open;
      if (!open || !loadout) return;
      const m = el('buy-money');
      if (m) m.textContent = `$${money}`;
      const list = el('buy-list');
      if (!list) return;
      list.innerHTML = '';
      for (const item of SHOP) {
        const owned = item.id in loadout.weapons;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.dataset.buy = item.id;
        row.disabled = money < item.price;
        row.innerHTML = `<span class="buy-name">${item.label}${owned ? ' ✓' : ''}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
        list.appendChild(row);
      }
      const keys = el('buy-keys');
      if (keys) keys.textContent = 'B close · 1-9 quick buy';
    },
    showOverlay(mode, data = {}) {
      const ov = el('overlay');
      if (!ov) return;
      ov.hidden = false;
      const title = el('overlay-title');
      const copy = el('overlay-copy');
      const btn = el('play');
      if (mode === 'start') {
        title.textContent = 'CINDERGATE';
        copy.textContent = 'Foundry Row. 5v5 — plant the charge at A or B, or clear the Ashen. Click to play.';
        btn.textContent = 'Click to play';
      } else if (mode === 'paused') {
        title.textContent = 'PAUSED';
        copy.textContent = 'Click to resume. Your team is holding the line.';
        btn.textContent = 'Resume';
      } else if (mode === 'end') {
        title.textContent = data.won ? 'CINDERGATE TAKEN' : 'CINDERGATE LOST';
        copy.textContent = data.sub || '';
        btn.textContent = 'Play again';
      }
    },
    hideOverlay() {
      const ov = el('overlay');
      if (ov) ov.hidden = true;
    },
    setFlash(opacity) {
      const f = el('flash');
      if (f) f.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    },
    drawMinimap(view) {
      if (!mctx) return;
      const W = minimap.width, H = minimap.height;
      const b = MAP.bounds;
      const sx = (x) => ((x - b.x0) / (b.x1 - b.x0)) * W;
      const sz = (z) => ((z - b.z0) / (b.z1 - b.z0)) * H;
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = 'rgba(12,16,20,0.82)';
      mctx.fillRect(0, 0, W, H);
      // Walls / cover.
      mctx.fillStyle = '#5a6068';
      for (const box of MAP.boxes) {
        const [cx, cz, w, d] = box;
        mctx.fillRect(sx(cx - w / 2), sz(cz - d / 2), Math.max(1, (w / (b.x1 - b.x0)) * W), Math.max(1, (d / (b.z1 - b.z0)) * H));
      }
      // Sites.
      for (const [key, s] of Object.entries(MAP.sites)) {
        mctx.strokeStyle = key === 'A' ? '#f07830' : '#6f9fb8';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.arc(sx(s.cx), sz(s.cz), (s.r / (b.x1 - b.x0)) * W, 0, Math.PI * 2);
        mctx.stroke();
        mctx.fillStyle = mctx.strokeStyle;
        mctx.font = 'bold 11px system-ui';
        mctx.textAlign = 'center';
        mctx.fillText(key, sx(s.cx), sz(s.cz) + 4);
      }
      // Bomb.
      if (view.bomb) {
        mctx.fillStyle = '#ffd23e';
        mctx.beginPath();
        mctx.arc(sx(view.bomb.x), sz(view.bomb.z), 4, 0, Math.PI * 2);
        mctx.fill();
      }
      // Teammates.
      for (const t of view.teammates) {
        mctx.fillStyle = '#f07830';
        mctx.beginPath();
        mctx.arc(sx(t.x), sz(t.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      // Visible enemies.
      for (const t of view.enemies) {
        mctx.fillStyle = '#ff4d4d';
        mctx.beginPath();
        mctx.arc(sx(t.x), sz(t.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      // Player arrow.
      const px = sx(view.player.x), pz = sz(view.player.z);
      mctx.save();
      mctx.translate(px, pz);
      mctx.rotate(Math.atan2(Math.sin(view.player.yaw), Math.cos(view.player.yaw)) * -1 + Math.PI);
      mctx.fillStyle = '#ffffff';
      mctx.beginPath();
      mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    },
  };
}
