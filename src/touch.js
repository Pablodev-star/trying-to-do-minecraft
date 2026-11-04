// Touch controls for phones and tablets: virtual joystick, look by dragging,
// tap to use/place, hold to mine, and on-screen buttons.

// Any sign of a touchscreen enables touch controls; on hybrid devices the game then
// switches to keyboard/mouse as soon as those are actually used (see Game.setTouchMode).
export const IS_TOUCH = /[?&]touch=1/.test(location.search) || (!/[?&]touch=0/.test(location.search) && (
  (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window ||
  (window.matchMedia?.('(pointer: coarse)').matches ?? false) || (window.matchMedia?.('(any-pointer: coarse)').matches ?? false) ||
  /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent)));

const HOLD_MS = 280;       // hold this long without moving => mine / continuous use
const TAP_MOVE = 12;       // px of movement that turns a touch into a look-drag

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.move = { x: 0, z: 0, active: false };
    this.jump = false;
    this.sneak = false;
    this.look = null;     // active look touch
    this.joy = null;      // active joystick touch id
    this.build();
    this.bind();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="t-joy"><div class="t-joy-knob"></div></div>
      <div class="t-btn t-jump" data-act="jump" aria-label="Saltar">▲</div>
      <div class="t-btn t-sneak" data-act="sneak" aria-label="Agacharse">●</div>
      <div class="t-top">
        <div class="t-btn small" data-act="pause" aria-label="Pausa">II</div>
        <div class="t-btn small" data-act="chat" aria-label="Chat">T</div>
        <div class="t-btn small" data-act="camera" aria-label="Cámara">F5</div>
        <div class="t-btn small" data-act="drop" aria-label="Soltar">Q</div>
        <div class="t-btn small" data-act="inventory" aria-label="Inventario">E</div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.joyEl = root.querySelector('.t-joy');
    this.knob = root.querySelector('.t-joy-knob');
    this.sneakBtn = root.querySelector('.t-sneak');
    this.jumpBtn = root.querySelector('.t-jump');
  }

  show(v) { this.root.classList.toggle('hidden', !v); if (!v) this.reset(); }

  reset() {
    this.move = { x: 0, z: 0, active: false };
    this.jump = false; this.joy = null;
    this.jumpBtn.classList.remove('on');
    this.knob.style.transform = 'translate(-50%, -50%)';
    if (this.look) this.endLook(false);
  }

  input() {
    return {
      analog: true, ax: this.move.x, az: this.move.z,
      forward: this.move.z < -0.3, back: this.move.z > 0.3, left: this.move.x < -0.3, right: this.move.x > 0.3,
      jump: this.jump, sneak: this.sneak,
      sprint: this.move.active && Math.hypot(this.move.x, this.move.z) > 0.92 && this.move.z < -0.6,
    };
  }

  bind() {
    const g = this.game;
    // joystick
    this.joyEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joy = t.identifier;
      this.updateJoy(t);
    }, { passive: false });
    const joyMove = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.joy) { e.preventDefault(); this.updateJoy(t); }
    };
    const joyEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.joy) {
        this.joy = null; this.move = { x: 0, z: 0, active: false };
        this.knob.style.transform = 'translate(-50%, -50%)';
      }
    };
    this.joyEl.addEventListener('touchmove', joyMove, { passive: false });
    this.joyEl.addEventListener('touchend', joyEnd);
    this.joyEl.addEventListener('touchcancel', joyEnd);

    // buttons
    for (const b of this.root.querySelectorAll('.t-btn')) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.button(b.dataset.act, true, b); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); this.button(b.dataset.act, false, b); }, { passive: false });
      b.addEventListener('touchcancel', () => this.button(b.dataset.act, false, b));
    }

    // look / tap / hold on the game canvas
    const c = g.canvas;
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!g.running || g.ui.isOpen() || !g.player) return;
      if (this.look) return;
      const t = e.changedTouches[0];
      this.look = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now(), moved: false, holding: false };
      this.look.timer = setTimeout(() => this.startHold(), HOLD_MS);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const L = this.look;
      if (!L) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== L.id) continue;
        const dx = t.clientX - L.x, dy = t.clientY - L.y;
        L.x = t.clientX; L.y = t.clientY;
        if (!L.moved && Math.hypot(t.clientX - L.sx, t.clientY - L.sy) > TAP_MOVE) { L.moved = true; if (!L.holding) clearTimeout(L.timer); }
        if (L.moved) {
          const p = g.player;
          if (!p) return;
          const s = 0.0055 * g.options.sensitivity / 100;
          p.yaw -= dx * s;
          p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch - dy * s));
        }
      }
    }, { passive: false });
    const end = (e) => {
      const L = this.look;
      if (!L) return;
      for (const t of e.changedTouches) if (t.identifier === L.id) this.endLook(true);
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', (e) => { if (this.look) for (const t of e.changedTouches) if (t.identifier === this.look.id) this.endLook(false); });

    // hotbar: tap to select
    document.getElementById('hotbar')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const p = g.player;
      if (!p) return;
      const slots = [...document.querySelectorAll('.hb-slot')];
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('.hb-slot');
      const i = slots.indexOf(el);
      if (i >= 0) { p.selected = i; p.using = null; g.ui.refresh(); g.ui.showHeldName(); }
    }, { passive: false });
  }

  updateJoy(t) {
    const r = this.joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const max = r.width / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.move = { x: dx / max, z: dy / max, active: true };
  }

  startHold() {
    const g = this.game, L = this.look;
    if (!L || L.moved || !g.player) return;
    L.holding = true;
    const held = g.player.heldItem();
    const it = held ? g.itemDef(held.id) : null;
    // food / bow: hold to use; otherwise hold to mine (or keep attacking)
    if (it && (it.food || it.toolType === 'bow')) { L.use = true; g.player.placeCooldown = 0; g.player.use(); g.mouse.right = true; }
    else { g.player.attack(); g.mouse.left = true; }
  }

  endLook(released) {
    const g = this.game, L = this.look;
    if (!L) return;
    clearTimeout(L.timer);
    this.look = null;
    if (L.holding) { g.mouse.left = false; g.mouse.right = false; return; }
    if (!released || L.moved || !g.player || g.ui.isOpen()) return;
    // quick tap: hit a mob if aimed at one, otherwise use / place
    const target = g.player.pick();
    if (target?.entity && !(g.player.heldItem() && ['shears', 'bone', 'bucket', 'wheat', 'carrot', 'wheat_seeds', 'potato'].includes(g.itemDef(g.player.heldItem().id)?.name)) && target.entity.type !== 'villager') g.player.attack();
    else { g.player.placeCooldown = 0; g.player.use(); }
  }

  button(act, down, el) {
    const g = this.game, ui = g.ui, p = g.player;
    if (!p) return;
    if (act === 'jump') {
      this.jump = down;
      el.classList.toggle('on', down);
      if (down) {
        const now = performance.now();
        if (p.mode === 'creative' && now - (this.lastJump ?? 0) < 300) { p.flying = !p.flying; p.vel.y = 0; }
        this.lastJump = now;
      }
      return;
    }
    if (!down) return;
    if (act === 'sneak') { this.sneak = !this.sneak; el.classList.toggle('on', this.sneak); }
    else if (act === 'pause') ui.pause();
    else if (act === 'chat') ui.openChat('');
    else if (act === 'inventory') ui.open(p.mode === 'creative' ? 'creative' : 'inventory');
    else if (act === 'camera') g.thirdPerson = (g.thirdPerson + 1) % 3;
    else if (act === 'drop') {
      const s = p.heldItem();
      if (s) { g.dropStack({ ...s, count: 1, data: s.data ? JSON.parse(JSON.stringify(s.data)) : undefined }); s.count--; if (s.count <= 0) p.inventory[p.selected] = null; ui.refresh(); }
    }
  }
}
