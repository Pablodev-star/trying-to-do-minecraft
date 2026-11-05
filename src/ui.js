// HUD and every GUI screen (inventory, crafting, furnace, chest, creative, trading, menus).
import { ITEMS, I, BLOCKS, matchRecipe, SMELTING, fuelTime, creativeTabs, maxStack, sameKind, copyStack } from './registry.js';
import { iconFor } from './icons.js';
import { xpForLevel } from './player.js';
import { tileCanvas } from './textures.js';
import { ENCHANTS, enchName, tableOffers, anvilCombine, canApply, isEnchanted } from './enchant.js';
import { PROFESSIONS, LEVEL_NAMES, LEVEL_XP, offerPrice, addTradeXP } from './villagers.js';
import { EFFECTS, potionName, potionColor, potionEffects, ROMAN, fmtTime, BREW_INGREDIENTS } from './effects.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clone = (s) => copyStack(s);

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.hud = $('#hud');
    this.screen = null;     // current open screen name
    this.cursor = null;     // item on cursor
    this.craft2 = new Array(4).fill(null);
    this.craft3 = new Array(9).fill(null);
    this.work = new Array(3).fill(null);   // temporary input slots of anvil / grindstone / smithing / enchanting / stonecutter
    this.creativeTab = 0; this.creativeScroll = 0; this.creativeSearch = '';
    this.chatLines = [];
    this.buildHUD();
    setupIconVars();
    this.tooltip = el('div', 'tooltip hidden');
    document.body.appendChild(this.tooltip);
    this.cursorEl = el('div', 'cursor-item hidden');
    document.body.appendChild(this.cursorEl);
    document.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.cursorEl.style.left = e.clientX + 'px'; this.cursorEl.style.top = e.clientY + 'px';
      this.tooltip.style.left = e.clientX + 14 + 'px'; this.tooltip.style.top = e.clientY - 26 + 'px';
    });
  }

  // ---------------------------------------------------------------- HUD
  buildHUD() {
    this.hud.innerHTML = `
      <div id="crosshair"></div>
      <div id="bossbar" class="hidden"><div class="bb-name">Dragón del End</div><div class="bb-bar"><div class="bb-fill"></div></div></div>
      <div id="debug" class="hidden"></div>
      <div id="chat"></div>
      <div id="helditem-name"></div>
      <div id="hotbar-wrap">
        <div id="stats"><div id="hearts"></div><div id="armorbar"></div><div id="food"></div><div id="air"></div></div>
        <div id="xp"><div id="xp-fill"></div><div id="xp-level"></div></div>
        <div id="hotbar"></div>
      </div>
      <div id="effects"></div>
      <div id="vignette"></div>
      <div id="hurt-flash"></div>
      <div id="portal-overlay"></div>`;
    const hb = $('#hotbar');
    for (let i = 0; i < 9; i++) hb.appendChild(el('div', 'hb-slot'));
    hb.appendChild(el('div', 'hb-sel'));
  }

  refresh() {
    const p = this.game.player;
    if (!p) return;
    const slots = this.hud.querySelectorAll('.hb-slot');
    for (let i = 0; i < 9; i++) this.fillSlot(slots[i], p.inventory[i]);
    $('.hb-sel').style.left = `calc(var(--s) * ${-1 + p.selected * 20}px)`;
    const surv = p.mode === 'survival';
    $('#stats').style.visibility = surv ? 'visible' : 'hidden';
    $('#xp').style.visibility = surv ? 'visible' : 'hidden';
    // hearts
    let h = '';
    for (let i = 0; i < 10; i++) {
      const v = p.health - i * 2;
      h += `<span class="icon heart ${v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty'} ${p.hurtTime > 0 ? 'blink' : ''}"></span>`;
    }
    $('#hearts').innerHTML = h;
    let f = '';
    for (let i = 0; i < 10; i++) { const v = p.food - i * 2; f += `<span class="icon food ${v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty'}"></span>`; }
    $('#food').innerHTML = f;
    const ap = p.armorPoints();
    let a = '';
    if (ap > 0) for (let i = 0; i < 10; i++) { const v = ap - i * 2; a += `<span class="icon armor ${v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty'}"></span>`; }
    $('#armorbar').innerHTML = a;
    let air = '';
    if (p.headInWater || p.air < 15) for (let i = 0; i < 10; i++) air += `<span class="icon bubble ${p.air > i * 1.5 ? 'full' : 'empty'}"></span>`;
    $('#air').innerHTML = air;
    $('#xp-fill').style.width = (p.xp / xpForLevel(p.level) * 100) + '%';
    $('#xp-level').textContent = p.level > 0 ? p.level : '';
    const efs = Object.entries(p.effects ?? {}).filter(([, v]) => v.t > 0);
    $('#effects').innerHTML = efs.map(([k, v]) => `<div class="effect" style="border-color:#${EFFECTS[k].c.toString(16).padStart(6, '0')}"><span class="ef-dot" style="background:#${EFFECTS[k].c.toString(16).padStart(6, '0')}"></span>${EFFECTS[k].n}${v.a ? ' ' + ROMAN[v.a] : ''} <span class="ef-t">${fmtTime(v.t)}</span></div>`).join('');
    if (p.absorb > 0) $('#hearts').insertAdjacentHTML('beforeend', '<span class="absorb">' + '♥'.repeat(Math.ceil(p.absorb / 2)) + '</span>');
  }
  inventoryChanged() {
    this.refresh();
    if (this.screen && !['pause', 'options', 'death', 'chat'].includes(this.screen)) this.renderScreen();
  }

  fillSlot(div, stack) {
    if (!stack) { div.innerHTML = ''; return; }
    const it = ITEMS[stack.id];
    if (!it) { div.innerHTML = ''; return; }
    const tint = it.kind === 'potion' ? potionColor(stack.data?.potion) : null;
    let html = `<img src="${iconFor(stack.id, tint)}" draggable="false">`;
    if (isEnchanted(stack) || it.name === 'enchanted_book' || it.name === 'experience_bottle') html += '<span class="glint"></span>';
    if (stack.count > 1) html += `<span class="count">${stack.count}</span>`;
    if (stack.dmg && it.durability) {
      const r = 1 - stack.dmg / it.durability;
      html += `<span class="dura"><span style="width:${r * 100}%;background:hsl(${r * 120},100%,50%)"></span></span>`;
    }
    div.innerHTML = html;
  }

  showHeldName() {
    const p = this.game.player;
    const s = p.heldItem();
    const e = $('#helditem-name');
    e.textContent = s ? ITEMS[s.id].display : '';
    e.style.opacity = 1;
    clearTimeout(this.heldTimer);
    this.heldTimer = setTimeout(() => { e.style.opacity = 0; }, 2000);
  }

  chat(msg) {
    this.chatLines.push({ msg, t: performance.now() });
    if (this.chatLines.length > 50) this.chatLines.shift();
    this.renderChat();
  }
  renderChat(all = false) {
    const now = performance.now();
    const c = $('#chat');
    c.innerHTML = this.chatLines.filter((l) => all || now - l.t < 10000).slice(-10).map((l) => `<div class="chat-line">${escapeHtml(l.msg)}</div>`).join('');
  }

  updateHUD(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    $('#hurt-flash').style.opacity = p.hurtTime > 0 ? p.hurtTime : 0;
    $('#portal-overlay').style.opacity = Math.min(0.85, p.portalTime / 4);
    if (this.chatLines.length && !this.chatOpen) this.renderChat();
    const dbg = $('#debug');
    if (g.showDebug) {
      dbg.classList.remove('hidden');
      const bx = Math.floor(p.pos.x), by = Math.floor(p.pos.y), bz = Math.floor(p.pos.z);
      const l = g.world.getLight(bx, by, bz);
      const dirs = ['Sur (+Z)', 'Oeste (-X)', 'Norte (-Z)', 'Este (+X)'];
      let a = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
      dbg.innerHTML = `VoxelCraft (${g.fps} fps, ${g.world.chunks.size} chunks)<br>
        Dimensión: ${g.dim}<br>XYZ: ${p.pos.x.toFixed(3)} / ${p.pos.y.toFixed(3)} / ${p.pos.z.toFixed(3)}<br>
        Bloque: ${bx} ${by} ${bz}<br>Chunk: ${bx >> 4} ${bz >> 4}<br>Mirando: ${dirs[Math.round(a / 90) & 3]} (${a.toFixed(1)})<br>
        Bioma: ${g.biomeName(bx, bz)}<br>Luz: ${l & 15} bloque, ${l >> 4} cielo<br>
        Entidades: ${g.entities.length}<br>Día ${Math.floor(g.time / 24000)}, hora ${Math.floor(g.time % 24000)}<br>Semilla: ${g.seed}`;
      void dt;
    } else dbg.classList.add('hidden');
    const boss = g.entities.find((e) => e.type === 'ender_dragon' && !e.dead);
    const bb = $('#bossbar');
    if (boss) { bb.classList.remove('hidden'); $('.bb-fill', bb).style.width = (boss.health / boss.maxHealth * 100) + '%'; } else bb.classList.add('hidden');
    // animate heart blink / low health shake
    if (p.health <= 4 && p.mode === 'survival') this.hud.querySelectorAll('.heart').forEach((h, i) => { h.style.transform = `translateY(${Math.sin(performance.now() / 60 + i * 2) > 0.5 ? -1 : 0}px)`; });
  }

  // ---------------------------------------------------------------- screens
  isOpen() { return !!this.screen; }
  open(name, data, key) {
    this.screen = name; this.screenData = data; this.screenKey = key;
    this.root.classList.remove('hidden');
    this.game.releasePointer();
    this.renderScreen();
  }
  close() {
    if (!this.screen) return;
    const p = this.game.player;
    // return crafting grid and cursor items
    const ret = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i]) { const left = p.give(arr[i].id, arr[i].count, arr[i].dmg, arr[i].data); if (left) this.game.spawnItem(p.pos.x, p.pos.y + 1.2, p.pos.z, { ...arr[i], count: left }); arr[i] = null; } };
    ret(this.craft2); ret(this.craft3); ret(this.work);
    if (this.cursor) { ret([this.cursor]); this.cursor = null; }
    this.screen = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.tooltip.classList.add('hidden');
    this.cursorEl.classList.add('hidden');
    this.game.lockPointer();
    this.refresh();
  }

  renderScreen() {
    const name = this.screen;
    if (!name) return;
    if (name === 'pause' || name === 'options' || name === 'death' || name === 'chat') return; // static screens rendered separately
    const p = this.game.player;
    const keepScroll = $('.creative-grid', this.root)?.scrollTop;
    this.root.innerHTML = '';
    const panel = el('div', 'panel inv-panel ' + name);
    this.root.appendChild(panel);
    this.slotDefs = [];
    const addSlot = (parent, def, cls = '') => {
      const d = el('div', 'slot ' + cls);
      d.dataset.i = this.slotDefs.length;
      this.slotDefs.push(def);
      this.fillSlot(d, def.get());
      parent.appendChild(d);
      return d;
    };
    const invSlot = (i) => ({ get: () => p.inventory[i], set: (v) => { p.inventory[i] = v; }, group: i < 9 ? 'hotbar' : 'main', idx: i });
    const playerInv = (parent) => {
      const main = el('div', 'grid g9');
      for (let i = 9; i < 36; i++) addSlot(main, invSlot(i));
      const hot = el('div', 'grid g9 hotrow');
      for (let i = 0; i < 9; i++) addSlot(hot, invSlot(i));
      parent.appendChild(el('div', 'label', 'Inventario'));
      parent.appendChild(main); parent.appendChild(hot);
    };
    const gridSlot = (arr, i, onChange) => ({ get: () => arr[i], set: (v) => { arr[i] = v; onChange?.(); }, group: 'craft' });
    const outputSlot = (getRes, consume) => ({ get: getRes, set: () => {}, output: true, consume, group: 'output' });

    if (name === 'inventory' || name === 'crafting') {
      const top = el('div', 'inv-top');
      panel.appendChild(top);
      const size = name === 'crafting' ? 3 : 2;
      const arr = size === 3 ? this.craft3 : this.craft2;
      if (name === 'inventory') {
        const armor = el('div', 'armor-col');
        for (let i = 0; i < 4; i++) {
          const a = i;
          addSlot(armor, { get: () => p.armor[a], set: (v) => { p.armor[a] = v; }, armor: a, group: 'armor' }, 'armor-slot a' + a);
        }
        top.appendChild(armor);
        const preview = el('div', 'player-preview');
        preview.appendChild(this.game.renderPlayerPreview());
        top.appendChild(preview);
      } else panel.insertBefore(el('div', 'label', 'Fabricación'), top);
      const craft = el('div', 'craft-area');
      if (name === 'inventory') craft.appendChild(el('div', 'label', 'Fabricación'));
      const g = el('div', 'grid g' + size);
      for (let i = 0; i < size * size; i++) addSlot(g, gridSlot(arr, i));
      const row = el('div', 'craft-row');
      row.appendChild(g);
      row.appendChild(el('div', 'arrow'));
      const liveResult = () => { const r = matchRecipe(arr.map((s) => (s ? s.id : 0)), size); return r ? { id: r.id, count: r.count, dmg: 0 } : null; };
      addSlot(row, outputSlot(liveResult, () => { for (let i = 0; i < arr.length; i++) if (arr[i]) { arr[i].count--; if (arr[i].count <= 0) arr[i] = null; } }), 'big');
      craft.appendChild(row);
      top.appendChild(craft);
      playerInv(panel);
    } else if (name === 'furnace') {
      const te = this.screenData;
      panel.appendChild(el('div', 'label', { smoker: 'Ahumador', blast: 'Alto horno' }[te.kind] ?? 'Horno'));
      const f = el('div', 'furnace-area');
      const col = el('div', 'furnace-col');
      addSlot(col, { get: () => te.items[0], set: (v) => { te.items[0] = v; }, group: 'f_in' });
      const flame = el('div', 'flame'); flame.innerHTML = `<div class="flame-fill" style="height:${te.burnMax ? te.burn / te.burnMax * 100 : 0}%"></div>`;
      col.appendChild(flame);
      addSlot(col, { get: () => te.items[1], set: (v) => { te.items[1] = v; }, group: 'f_fuel' });
      f.appendChild(col);
      const arrow = el('div', 'arrow progress'); arrow.innerHTML = `<div class="arrow-fill" style="width:${te.cook / 10 * 100}%"></div>`;
      f.appendChild(arrow);
      addSlot(f, { get: () => te.items[2], set: (v) => { te.items[2] = v; }, output: true, takeAll: true, consume: () => { te.items[2] = null; this.game.player.addXP(Math.ceil(te.xp ?? 0)); te.xp = 0; }, group: 'f_out' }, 'big');
      panel.appendChild(f);
      playerInv(panel);
    } else if (name === 'chest') {
      const te = this.screenData;
      panel.appendChild(el('div', 'label', 'Cofre'));
      const g = el('div', 'grid g9');
      for (let i = 0; i < 27; i++) { const k = i; addSlot(g, { get: () => te.items[k], set: (v) => { te.items[k] = v; }, group: 'chest' }); }
      panel.appendChild(g);
      playerInv(panel);
    } else if (name === 'creative') {
      const tabs = creativeTabs();
      const tabBar = el('div', 'tabs');
      tabs.forEach((t, i) => {
        const b = el('div', 'tab' + (i === this.creativeTab ? ' active' : ''), `<img src="${iconFor(I[t.icon])}">`);
        b.title = t.name;
        b.onclick = () => { this.creativeTab = i; this.creativeScroll = 0; this.renderScreen(); };
        tabBar.appendChild(b);
      });
      const invTab = el('div', 'tab' + (this.creativeTab === -1 ? ' active' : ''), `<img src="${iconFor(I.chest)}">`);
      invTab.title = 'Inventario de supervivencia';
      invTab.onclick = () => { this.creativeTab = -1; this.renderScreen(); };
      tabBar.appendChild(invTab);
      panel.appendChild(tabBar);
      if (this.creativeTab === -1) {
        const armor = el('div', 'armor-row');
        for (let i = 0; i < 4; i++) { const a = i; addSlot(armor, { get: () => p.armor[a], set: (v) => { p.armor[a] = v; }, armor: a, group: 'armor' }, 'armor-slot a' + a); }
        panel.appendChild(el('div', 'label', 'Inventario'));
        panel.appendChild(armor);
        const main = el('div', 'grid g9');
        for (let i = 9; i < 36; i++) addSlot(main, invSlot(i));
        panel.appendChild(main);
      } else {
        const tab = tabs[this.creativeTab];
        const head = el('div', 'creative-head');
        head.appendChild(el('div', 'label', tab.name));
        const search = el('input', 'search');
        search.placeholder = 'Buscar...';
        search.value = this.creativeSearch;
        search.oninput = () => { this.creativeSearch = search.value; this.renderScreen(); const s = $('.search', this.root); s.focus(); s.setSelectionRange(s.value.length, s.value.length); };
        search.onkeydown = (e) => e.stopPropagation();
        head.appendChild(search);
        panel.appendChild(head);
        let items = tab.items;
        if (this.creativeSearch) {
          const q = this.creativeSearch.toLowerCase();
          items = ITEMS.filter((it) => it && (it.display.toLowerCase().includes(q) || it.name.includes(q))).map((it) => it.id);
        }
        const g = el('div', 'grid g9 creative-grid');
        for (const id of items) addSlot(g, { get: () => ({ id, count: 1, dmg: 0 }), set: () => {}, creative: true, group: 'creative' });
        panel.appendChild(g);
        if (keepScroll) g.scrollTop = keepScroll;
      }
      const hot = el('div', 'grid g9 hotrow');
      for (let i = 0; i < 9; i++) addSlot(hot, invSlot(i));
      const bottom = el('div', 'creative-bottom');
      bottom.appendChild(hot);
      addSlot(bottom, { get: () => null, set: () => {}, trash: true, group: 'trash' }, 'trash');
      panel.appendChild(bottom);
    } else if (name === 'container') {
      const d = this.screenData;
      panel.appendChild(el('div', 'label', d.title));
      const g = el('div', 'grid g' + d.cols + ' center-grid');
      for (let i = 0; i < d.tile.items.length; i++) { const k = i; addSlot(g, { get: () => d.tile.items[k], set: (v) => { d.tile.items[k] = v; }, group: 'chest' }); }
      panel.appendChild(g);
      playerInv(panel);
    } else if (name === 'brewing') {
      const te = this.screenData;
      panel.appendChild(el('div', 'label', 'Soporte para pociones'));
      const area = el('div', 'brew-area');
      const top = el('div', 'brew-top');
      addSlot(top, { get: () => te.items[4], set: (v) => { te.items[4] = v; }, group: 'b_fuel', accept: (s) => ITEMS[s.id].name === 'blaze_powder' }, 'fuel-slot');
      const fuel = el('div', 'brew-fuel'); fuel.innerHTML = `<div style="width:${(te.fuel ?? 0) / 20 * 100}%"></div>`; top.appendChild(fuel);
      addSlot(top, { get: () => te.items[3], set: (v) => { te.items[3] = v; }, group: 'b_ing', accept: (s) => BREW_INGREDIENTS.has(ITEMS[s.id].name) });
      const prog = el('div', 'brew-prog'); prog.innerHTML = `<div style="height:${(te.time ?? 0) / 20 * 100}%"></div>`; top.appendChild(prog);
      area.appendChild(top);
      const bottles = el('div', 'brew-bottles');
      for (let i = 0; i < 3; i++) { const k = i; addSlot(bottles, { get: () => te.items[k], set: (v) => { te.items[k] = v; }, group: 'b_bottle', accept: (s) => ITEMS[s.id].kind === 'potion' || ITEMS[s.id].name === 'glass_bottle', max: 1 }); }
      area.appendChild(bottles);
      panel.appendChild(area);
      playerInv(panel);
    } else if (name === 'enchanting') {
      const pos = this.screenData;
      panel.appendChild(el('div', 'label', 'Encantar'));
      const area = el('div', 'ench-area');
      const left = el('div', 'ench-left');
      addSlot(left, { get: () => this.work[0], set: (v) => { this.work[0] = v; }, group: 'work', max: 1 });
      addSlot(left, { get: () => this.work[1], set: (v) => { this.work[1] = v; }, group: 'work', accept: (s) => ITEMS[s.id].name === 'lapis_lazuli' });
      area.appendChild(left);
      const opts = el('div', 'ench-opts');
      const target = this.work[0];
      const shelves = this.game.countBookshelves(pos.x, pos.y, pos.z);
      const canEnch = target && !isEnchanted(target) && Object.keys(ENCHANTS).some((k) => canApply(k, target.id) && ITEMS[target.id].name !== 'enchanted_book');
      const offers = canEnch ? tableOffers(target.id, shelves, (p.enchSeed ??= (Math.random() * 1e9) | 0) + target.id) : [];
      [0, 1, 2].forEach((i) => {
        const o = offers[i];
        const lapis = this.work[1]?.count ?? 0;
        const ok = o && Object.keys(o.ench).length && (p.mode === 'creative' || (p.level >= o.cost && lapis >= i + 1));
        const first = o && Object.entries(o.ench)[0];
        const b = el('button', 'ench-opt' + (ok ? '' : ' off'), o && first ? `<span class="rune">${'ᚠᚢᚦᚨᚱᚲ'.slice(0, 3 + i)}</span><span class="ench-hint">${enchName(first[0], first[1])}...</span><span class="ench-cost">${o.cost}</span>` : '');
        b.title = o ? `Coste: ${i + 1} lapislázuli y ${o.cost} niveles` : '';
        b.onclick = () => {
          if (!ok) { this.game.sfx('no'); return; }
          const isBook = ITEMS[target.id].name === 'book';
          this.work[0] = { id: isBook ? I.enchanted_book : target.id, count: 1, dmg: target.dmg ?? 0, data: { ...(target.data ?? {}), ench: o.ench } };
          if (p.mode !== 'creative') { p.level -= i + 1; this.work[1].count -= i + 1; if (this.work[1].count <= 0) this.work[1] = null; }
          p.enchSeed = (Math.random() * 1e9) | 0;
          this.game.sfx('levelup'); this.game.achieve('¡Encantador!');
          this.afterClick();
        };
        opts.appendChild(b);
      });
      area.appendChild(opts);
      panel.appendChild(area);
      panel.appendChild(el('div', 'hint dark', `Estanterías cerca: ${shelves}/15`));
      playerInv(panel);
    } else if (name === 'anvil' || name === 'grindstone' || name === 'smithing') {
      const title = { anvil: 'Reparar y nombrar', grindstone: 'Reparar y desencantar', smithing: 'Mejorar equipamiento' }[name];
      panel.appendChild(el('div', 'label', title));
      const area = el('div', 'work-area');
      if (name === 'anvil') {
        const inp = el('input', 'rename'); inp.placeholder = this.work[0] ? (this.work[0].data?.name ?? ITEMS[this.work[0].id].display) : '';
        inp.value = this.renameText ?? '';
        inp.onkeydown = (e) => e.stopPropagation();
        inp.oninput = () => { this.renameText = inp.value; this.renderScreen(); const r = $('.rename', this.root); r.focus(); r.setSelectionRange(r.value.length, r.value.length); };
        panel.appendChild(inp);
      }
      const row = el('div', 'craft-row');
      addSlot(row, { get: () => this.work[0], set: (v) => { this.work[0] = v; if (!v) this.renameText = ''; }, group: 'work', max: name === 'smithing' ? 1 : undefined });
      row.appendChild(el('div', 'plus', '+'));
      addSlot(row, { get: () => this.work[1], set: (v) => { this.work[1] = v; }, group: 'work' });
      row.appendChild(el('div', 'arrow'));
      const res = this.workResult(name);
      const affordable = res && (name !== 'anvil' || p.mode === 'creative' || p.level >= res.cost);
      addSlot(row, { get: () => (affordable ? res.stack : null), set: () => {}, output: true, takeAll: true, consume: () => this.consumeWork(name, res), group: 'output' }, 'big');
      area.appendChild(row);
      if (name === 'anvil' && res) area.appendChild(el('div', 'cost ' + (p.level >= res.cost || p.mode === 'creative' ? 'ok' : 'bad'), `Coste de experiencia: ${res.cost}`));
      panel.appendChild(area);
      playerInv(panel);
    } else if (name === 'stonecutter') {
      panel.appendChild(el('div', 'label', 'Cortapiedras'));
      const area = el('div', 'work-area');
      const row = el('div', 'craft-row');
      addSlot(row, { get: () => this.work[0], set: (v) => { this.work[0] = v; }, group: 'work' });
      const opts = el('div', 'grid g4 cut-opts');
      const inName = this.work[0] ? ITEMS[this.work[0].id].name : null;
      const outs = inName ? stonecutterOutputs(inName) : [];
      for (const [n, c] of outs) {
        addSlot(opts, { get: () => (this.work[0]?.count > 0 && ITEMS[this.work[0].id].name === inName ? { id: I[n], count: c, dmg: 0 } : null), set: () => {}, output: true, consume: () => { this.work[0].count--; if (this.work[0].count <= 0) this.work[0] = null; }, group: 'output' });
      }
      row.appendChild(opts);
      area.appendChild(row);
      panel.appendChild(area);
      playerInv(panel);
    } else if (name === 'trade') {
      const v = this.screenData;
      const prof = PROFESSIONS[v.profession];
      panel.classList.add('wide');
      panel.appendChild(el('div', 'label', `${prof?.n ?? 'Aldeano'} - ${LEVEL_NAMES[v.vlevel - 1]}`));
      const next = LEVEL_XP[v.vlevel] ?? null;
      const bar = el('div', 'vxp'); bar.innerHTML = `<div style="width:${next ? Math.min(100, (v.vxp - LEVEL_XP[v.vlevel - 1]) / (next - LEVEL_XP[v.vlevel - 1]) * 100) : 100}%"></div>`;
      panel.appendChild(bar);
      const list = el('div', 'trades');
      for (const o of v.offers) {
        const row = el('div', 'trade' + (o.uses >= o.maxUses ? ' sold' : ''));
        const price = offerPrice(v, o, v.rep);
        const cost = el('div', 'slot'); this.fillSlot(cost, { id: I[o.cost[0]], count: price });
        if (price < o.cost[1]) cost.insertAdjacentHTML('beforeend', `<span class="old-price">${o.cost[1]}</span>`);
        row.appendChild(cost);
        if (o.cost2) { const c2 = el('div', 'slot'); this.fillSlot(c2, { id: I[o.cost2[0]], count: o.cost2[1] }); row.appendChild(c2); }
        row.appendChild(el('div', 'arrow small' + (o.uses >= o.maxUses ? ' x' : '')));
        const out = el('div', 'slot'); this.fillSlot(out, { id: I[o.give[0]], count: o.give[1], data: o.data });
        out.title = o.data?.ench ? Object.entries(o.data.ench).map(([k, l]) => enchName(k, l)).join(', ') : ITEMS[I[o.give[0]]].display;
        row.appendChild(out);
        const btn = el('button', 'mc-btn small', o.uses >= o.maxUses ? 'Agotado' : 'Comerciar');
        btn.onclick = () => {
          if (o.uses >= o.maxUses) { this.game.sfx('no'); return; }
          const has = p.mode === 'creative' || (p.countItem(I[o.cost[0]]) >= price && (!o.cost2 || p.countItem(I[o.cost2[0]]) >= o.cost2[1]));
          if (!has) { this.game.sfx('no'); return; }
          if (p.mode !== 'creative') { p.takeItem(I[o.cost[0]], price); if (o.cost2) p.takeItem(I[o.cost2[0]], o.cost2[1]); }
          const left = p.give(I[o.give[0]], o.give[1], 0, o.data ? JSON.parse(JSON.stringify(o.data)) : undefined);
          if (left) this.game.spawnItem(p.pos.x, p.pos.y + 1, p.pos.z, { id: I[o.give[0]], count: left, data: o.data });
          o.uses++;
          v.rep = Math.min(100, (v.rep ?? 0) + 1);
          addTradeXP(v, o.xp);
          this.game.spawnXP(v.pos.x, v.pos.y + 1, v.pos.z, 3 + Math.floor(Math.random() * 4));
          this.game.sfx('trade');
          this.game.achieve('¿Qué te pongo?');
          this.renderScreen();
        };
        row.appendChild(btn);
        list.appendChild(row);
      }
      panel.appendChild(list);
      const rep = v.rep ?? 0;
      panel.appendChild(el('div', 'hint dark', `Reputación con este aldeano: ${rep > 0 ? '+' : ''}${rep}${rep >= 20 ? ' (descuentos)' : rep <= -20 ? ' (precios altos)' : ''}`));
      playerInv(panel);
    }
    // bind slot events
    panel.querySelectorAll('.slot[data-i]').forEach((d) => {
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const i = Number(d.dataset.i);
        if (e.pointerType === 'touch') {
          // tap = left click, long press = right click; quick-move toggle acts as Shift
          clearTimeout(this.pressTimer);
          this.pressFired = false;
          this.pressTimer = setTimeout(() => { this.pressFired = true; this.clickSlot(i, 2, this.quickMove); }, 380);
          const sx = e.clientX, sy = e.clientY;
          const done = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); };
          const up = () => { clearTimeout(this.pressTimer); done(); if (!this.pressFired) this.clickSlot(i, 0, this.quickMove); };
          const cancel = () => { clearTimeout(this.pressTimer); this.pressFired = true; done(); }; // finger dragged: it's a scroll
          const move = (ev) => { if (ev.pointerId === e.pointerId && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) cancel(); };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
          document.addEventListener('pointercancel', cancel);
          return;
        }
        this.clickSlot(i, e.button, e.shiftKey);
      });
      d.addEventListener('mouseenter', () => { this.hover = Number(d.dataset.i); this.showTooltip(); });
      d.addEventListener('mouseleave', () => { this.hover = null; this.tooltip.classList.add('hidden'); });
      d.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    panel.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.game.touch) {
      const bar = el('div', 'touch-bar');
      const qm = el('button', 'mc-btn small' + (this.quickMove ? ' on' : ''), this.quickMove ? 'Mover rápido: SÍ' : 'Mover rápido: NO');
      qm.onclick = () => { this.quickMove = !this.quickMove; this.renderScreen(); };
      const close = el('button', 'mc-btn small', 'Cerrar');
      close.onclick = () => this.close();
      bar.append(qm, close);
      panel.appendChild(bar);
      bar.insertAdjacentHTML('beforeend', '<span class="touch-hint">Toca: coger/dejar · Mantén: mitad/uno</span>');
    }
    this.renderCursor();
  }

  workResult(name) {
    const [a, b] = this.work;
    const p = this.game.player;
    if (name === 'anvil') {
      if (!a) return null;
      const it = ITEMS[a.id];
      const mat = { iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond', netherite: 'netherite_ingot', stone: 'cobblestone', wooden: 'oak_planks', leather: 'leather', chainmail: 'iron_ingot' }[it.name.split('_')[0]];
      const materialOk = b && mat && ITEMS[b.id].name === mat;
      const r = anvilCombine(a, b, materialOk, this.renameText ? this.renameText : null);
      if (!r || (r.cost >= 40 && p.mode !== 'creative')) return null;
      return r;
    }
    if (name === 'grindstone') {
      if (!a && !b) return null;
      if (a && b && a.id !== b.id) return null;
      const base = a ?? b;
      const it = ITEMS[base.id];
      if (!it.durability && ITEMS[base.id].name !== 'enchanted_book') return null;
      const out = copyStack(base, 1);
      if (a && b && it.durability) out.dmg = Math.max(0, it.durability - ((it.durability - (a.dmg ?? 0)) + (it.durability - (b.dmg ?? 0)) + Math.floor(it.durability * 0.05)));
      const xp = Object.values({ ...(a?.data?.ench ?? {}), ...(b?.data?.ench ?? {}) }).reduce((s, l) => s + l * 3, 0);
      if (out.data) { delete out.data.ench; delete out.data.repairCost; if (!Object.keys(out.data).length) delete out.data; }
      if (ITEMS[out.id].name === 'enchanted_book') out.id = I.book;
      if (!xp && !(a && b)) return null;
      return { stack: out, xp };
    }
    if (name === 'smithing') {
      if (!a || !b || ITEMS[b.id].name !== 'netherite_ingot') return null;
      const n = ITEMS[a.id].name;
      if (!n.startsWith('diamond_')) return null;
      const target = I['netherite_' + n.slice(8)];
      if (target == null) return null;
      return { stack: { ...copyStack(a, 1), id: target } };
    }
    return null;
  }
  consumeWork(name, res) {
    const p = this.game.player;
    if (!res) return;
    if (name === 'anvil') {
      if (p.mode !== 'creative') p.level = Math.max(0, p.level - res.cost);
      this.work[0] = null;
      if (this.work[1]) { const used = res.units ?? 1; this.work[1].count -= used; if (this.work[1].count <= 0) this.work[1] = null; }
      this.renameText = '';
      this.game.sfx('anvil');
    } else if (name === 'grindstone') {
      this.work[0] = null; this.work[1] = null;
      if (res.xp) this.game.spawnXP(p.pos.x, p.pos.y + 1, p.pos.z, res.xp);
      this.game.sfx('grind');
    } else if (name === 'smithing') {
      this.work[0] = null; this.work[1].count--; if (this.work[1].count <= 0) this.work[1] = null;
      this.game.sfx('anvil');
    }
  }

  showTooltip() {
    const def = this.slotDefs?.[this.hover];
    const s = def?.get();
    if (!s || this.cursor || this.game.touch) { this.tooltip.classList.add('hidden'); return; }
    const it = ITEMS[s.id];
    const title = s.data?.name ? `<i>${escapeHtml(s.data.name)}</i>` : it.kind === 'potion' ? potionName(s.data?.potion, it.splash) : it.display;
    let html = `<div class="tt-name ${it.name.includes('golden_apple') || it.name === 'totem' || isEnchanted(s) ? (isEnchanted(s) ? 'ench' : 'rare') : ''}">${title}</div>`;
    for (const [k, l] of Object.entries(s.data?.ench ?? {})) html += `<div class="tt-line gray">${enchName(k, l)}</div>`;
    if (it.kind === 'potion') {
      const efs = potionEffects(s.data?.potion);
      if (!efs.length) html += '<div class="tt-line gray">Sin efectos</div>';
      for (const ef of efs) html += `<div class="tt-line ${EFFECTS[ef.e].good ? 'blue' : 'red'}">${EFFECTS[ef.e].n}${ef.a ? ' ' + ROMAN[ef.a] : ''}${ef.t ? ` (${fmtTime(ef.t * (it.splash ? 0.75 : 1))})` : ''}</div>`;
    }
    if (it.damage && it.kind === 'tool') html += `<div class="tt-line">+${it.damage} de daño</div>`;
    if (it.armor) html += `<div class="tt-line blue">+${it.armor} de armadura</div>`;
    if (it.durability && s.dmg) html += `<div class="tt-line gray">Durabilidad: ${it.durability - s.dmg} / ${it.durability}</div>`;
    if (it.food && it.food[0]) html += `<div class="tt-line gray">Alimento: ${it.food[0]}</div>`;
    if (this.game.showDebug) html += `<div class="tt-line gray">minecraft:${it.name}</div>`;
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
  }

  renderCursor() {
    if (this.cursor) { this.cursorEl.classList.remove('hidden'); this.fillSlot(this.cursorEl, this.cursor); }
    else this.cursorEl.classList.add('hidden');
  }

  clickSlot(i, button, shift) {
    const def = this.slotDefs[i];
    const p = this.game.player;
    const stack = def.get();
    const creative = p.mode === 'creative';
    if (def.trash) { if (shift && creative) { p.inventory.fill(null); } this.cursor = null; this.afterClick(); return; }
    if (def.creative) {
      const max = maxStack(stack.id);
      if (shift) p.give(stack.id, max);
      else if (this.cursor && this.cursor.id === stack.id && button === 0) this.cursor.count = Math.min(max, this.cursor.count + 1);
      else if (this.cursor) this.cursor = null;
      else this.cursor = { id: stack.id, count: button === 0 ? 1 : max, dmg: 0 };
      this.afterClick(); return;
    }
    if (def.output) {
      if (!stack) return;
      if (shift) {
        // craft as many as possible
        for (let n = 0; n < 64; n++) {
          const s = def.get();
          if (!s) break;
          const left = p.give(s.id, s.count, s.dmg, s.data);
          def.consume();
          if (left) { this.game.spawnItem(p.pos.x, p.pos.y + 1, p.pos.z, { ...s, count: left }); break; }
          if (def.takeAll) break;
          this.renderScreen();
        }
        this.game.sfx('craft');
      } else {
        if (this.cursor && (!sameKind(this.cursor, stack) || this.cursor.count + stack.count > maxStack(stack.id))) return;
        if (this.cursor) this.cursor.count += stack.count; else this.cursor = clone(stack);
        def.consume();
      }
      this.afterClick(); return;
    }
    if (shift && stack) {
      // quick move
      const targets = this.quickMoveTargets(def);
      let s = clone(stack);
      for (const t of targets) {
        if (!s) break;
        const cur = t.get();
        if (t.armor != null) { if (ITEMS[s.id].slot === t.armor && !cur) { t.set(s); s = null; } continue; }
        if (sameKind(cur, s)) { const n = Math.min(s.count, maxStack(s.id) - cur.count); cur.count += n; s.count -= n; if (s.count <= 0) s = null; }
      }
      for (const t of targets) {
        if (!s) break;
        if (t.armor != null) continue;
        if (!t.get()) { t.set(s); s = null; }
      }
      def.set(s);
      this.afterClick(); return;
    }
    if (def.armor != null && this.cursor && ITEMS[this.cursor.id].slot !== def.armor) return;
    if (def.accept && this.cursor && !def.accept(this.cursor)) return;
    if (def.max === 1 && this.cursor && !stack && button === 0 && this.cursor.count > 1) { def.set(copyStack(this.cursor, 1)); this.cursor.count--; this.afterClick(); return; }
    const max = stack ? maxStack(stack.id) : 64;
    if (button === 0) {
      if (!this.cursor) { this.cursor = stack; def.set(null); }
      else if (!stack) { def.set(this.cursor); this.cursor = null; }
      else if (sameKind(stack, this.cursor)) {
        const n = Math.min(this.cursor.count, max - stack.count);
        stack.count += n; this.cursor.count -= n;
        if (this.cursor.count <= 0) this.cursor = null;
        def.set(stack);
      } else { def.set(this.cursor); this.cursor = stack; }
    } else if (button === 2) {
      if (!this.cursor && stack) {
        const half = Math.ceil(stack.count / 2);
        this.cursor = copyStack(stack, half);
        stack.count -= half;
        def.set(stack.count > 0 ? stack : null);
      } else if (this.cursor) {
        if (!stack) { def.set(copyStack(this.cursor, 1)); this.cursor.count--; }
        else if (sameKind(stack, this.cursor) && stack.count < max) { stack.count++; this.cursor.count--; def.set(stack); }
        else { def.set(this.cursor); this.cursor = stack; }
        if (this.cursor && this.cursor.count <= 0) this.cursor = null;
      }
    } else if (button === 1 && creative && stack) {
      this.cursor = { id: stack.id, count: maxStack(stack.id), dmg: 0 };
    }
    this.afterClick();
  }

  quickMoveTargets(def) {
    const defs = this.slotDefs;
    const by = (groups) => defs.filter((d) => groups.includes(d.group));
    const it = ITEMS[def.get().id];
    switch (def.group) {
      case 'hotbar':
        if (this.screen === 'chest' || this.screen === 'container') return by(['chest']);
        if (this.screen === 'furnace') return SMELTING[it.name] ? by(['f_in']) : fuelTime(it.id) ? by(['f_fuel']) : by(['main']);
        if (it.armor != null && this.screen === 'inventory') return [...by(['armor']), ...by(['main'])];
        return by(['main']);
      case 'main':
        if (this.screen === 'chest' || this.screen === 'container') return by(['chest']);
        if (this.screen === 'furnace') return SMELTING[it.name] ? by(['f_in']) : fuelTime(it.id) ? by(['f_fuel']) : by(['hotbar']);
        if (it.armor != null && this.screen === 'inventory') return [...by(['armor']), ...by(['hotbar'])];
        return by(['hotbar']);
      default:
        return [...by(['hotbar']), ...by(['main'])].sort((a, b) => (b.group === 'hotbar') - (a.group === 'hotbar')).reverse();
    }
  }

  afterClick() {
    this.renderScreen();
    this.refresh();
    this.showTooltip();
  }

  hotbarSwap(n) {
    if (this.hover == null) return false;
    const def = this.slotDefs?.[this.hover];
    if (!def || def.output || def.creative || def.trash) {
      if (def?.creative) { this.game.player.inventory[n] = { ...def.get(), count: maxStack(def.get().id) }; this.afterClick(); return true; }
      return false;
    }
    const p = this.game.player;
    const a = def.get(), b = p.inventory[n];
    def.set(b); p.inventory[n] = a;
    this.afterClick();
    return true;
  }

  dropHovered(all) {
    if (this.hover == null) return;
    const def = this.slotDefs?.[this.hover];
    const s = def?.get();
    if (!s || def.output || def.creative) return;
    const n = all ? s.count : 1;
    this.game.dropStack(copyStack(s, n));
    s.count -= n;
    def.set(s.count > 0 ? s : null);
    this.afterClick();
  }

  openTrade(villager) { this.open('trade', villager); }

  // ---------------------------------------------------------------- menus
  menu(html, cls = '') {
    this.root.innerHTML = `<div class="menu ${cls}">${html}</div>`;
    this.root.classList.remove('hidden');
    return this.root.firstChild;
  }
  pause() {
    this.screen = 'pause';
    this.game.releasePointer();
    const m = this.menu(`<h2>Menú de juego</h2>
      <button class="mc-btn" id="m-back">Volver al juego</button>
      <div class="row"><button class="mc-btn half" id="m-adv">Logros</button><button class="mc-btn half" id="m-stats">Estadísticas</button></div>
      <button class="mc-btn" id="m-opt">Opciones...</button>
      <button class="mc-btn" id="m-quit">Guardar y salir al título</button>`, 'pause-menu');
    $('#m-back', m).onclick = () => this.close();
    $('#m-opt', m).onclick = () => this.options(() => this.pause());
    $('#m-quit', m).onclick = () => this.game.quitToTitle();
    $('#m-adv', m).onclick = () => this.game.chat('Logros: ' + (this.game.achievements.size ? [...this.game.achievements].join(', ') : 'ninguno todavía'));
    $('#m-stats', m).onclick = () => this.game.chat(`Bloques rotos: ${this.game.stats.broken}, colocados: ${this.game.stats.placed}, mobs: ${this.game.stats.kills}`);
  }
  options(back, fromTitle = false) {
    this.screen = 'options';
    const o = this.game.options;
    const m = this.menu(`<h2>Opciones</h2>
      <div class="opt-grid">
        <label>Campo de visión: <span id="o-fov-v">${o.fov}</span><input type="range" id="o-fov" min="30" max="110" value="${o.fov}"></label>
        <label>Distancia de renderizado: <span id="o-rd-v">${o.renderDistance}</span> chunks<input type="range" id="o-rd" min="2" max="12" value="${o.renderDistance}"></label>
        <label>Sensibilidad: <span id="o-sens-v">${o.sensitivity}</span>%<input type="range" id="o-sens" min="10" max="200" value="${o.sensitivity}"></label>
        <label>Volumen: <span id="o-vol-v">${o.volume}</span>%<input type="range" id="o-vol" min="0" max="100" value="${o.volume}"></label>
        <label>Escala de interfaz: <span id="o-gui-v">${o.guiScale}</span><input type="range" id="o-gui" min="1" max="4" step="0.5" value="${o.guiScale}"></label>
        <button class="mc-btn" id="o-diff">Dificultad: ${{ peaceful: 'Pacífico', easy: 'Fácil', normal: 'Normal', hard: 'Difícil' }[o.difficulty]}</button>
        <button class="mc-btn" id="o-bob">Movimiento de cámara: ${o.bobbing ? 'SÍ' : 'NO'}</button>
        <button class="mc-btn" id="o-clouds">Nubes: ${o.clouds ? '3D' : 'NO'}</button>
        <button class="mc-btn" id="o-particles">Partículas: ${o.particles === false ? 'Mínimas' : 'Todas'}</button>
        <button class="mc-btn" id="o-fancy">Gráficos: ${o.fancy ? 'Detallados' : 'Rápidos'}</button>
        <button class="mc-btn ${o.shaders ? 'on' : ''}" id="o-shaders">Shaders: ${o.shaders ? 'SÍ' : 'NO'}</button>
        <div class="opt-note">Shaders: sombras, agua con reflejos, plantas que se mueven con el viento, rayos de sol y colores cinematográficos. Necesitan un equipo potente.</div>
      </div>
      <button class="mc-btn" id="o-done">Listo</button>`, 'options-menu' + (fromTitle ? ' dirt' : ''));
    const bind = (id, key, after) => {
      const inp = $('#' + id, m);
      inp.oninput = () => { o[key] = Number(inp.value); $('#' + id + '-v', m).textContent = inp.value; after?.(); };
    };
    bind('o-fov', 'fov'); bind('o-rd', 'renderDistance'); bind('o-sens', 'sensitivity'); bind('o-vol', 'volume');
    bind('o-gui', 'guiScale', () => this.game.applyGuiScale());
    $('#o-diff', m).onclick = () => { const l = ['peaceful', 'easy', 'normal', 'hard']; o.difficulty = l[(l.indexOf(o.difficulty) + 1) % 4]; this.options(back, fromTitle); };
    $('#o-bob', m).onclick = () => { o.bobbing = !o.bobbing; this.options(back, fromTitle); };
    $('#o-clouds', m).onclick = () => { o.clouds = !o.clouds; this.options(back, fromTitle); };
    $('#o-particles', m).onclick = () => { o.particles = o.particles === false; this.options(back, fromTitle); };
    $('#o-fancy', m).onclick = () => { o.fancy = !o.fancy; this.game.remeshAll(); this.options(back, fromTitle); };
    $('#o-shaders', m).onclick = () => { o.shaders = !o.shaders; if (o.shaders && !this.game.pipeline) { o.shaders = false; this.game.chat('Tu navegador no soporta los shaders.'); } this.game.saveOptions(); this.options(back, fromTitle); };
    $('#o-done', m).onclick = () => { this.game.saveOptions(); back(); };
  }
  death(msg, score) {
    this.screen = 'death';
    this.game.releasePointer();
    const m = this.menu(`<h1 class="death-title">¡Has muerto!</h1><p>${escapeHtml(msg)}</p><p>Puntuación: <span class="yellow">${score}</span></p>
      <button class="mc-btn" id="d-respawn">Reaparecer</button><button class="mc-btn" id="d-title">Pantalla de título</button>`, 'death-menu');
    $('#d-respawn', m).onclick = () => { this.screen = null; this.root.classList.add('hidden'); this.root.innerHTML = ''; this.game.respawn(); this.game.lockPointer(); };
    $('#d-title', m).onclick = () => this.game.quitToTitle();
  }
  openChat(prefix = '') {
    this.screen = 'chat';
    this.chatOpen = true;
    this.game.releasePointer();
    this.root.classList.remove('hidden');
    this.root.innerHTML = '<input id="chat-input" maxlength="256" autocomplete="off">';
    this.renderChat(true);
    const inp = $('#chat-input');
    inp.value = prefix;
    setTimeout(() => inp.focus(), 0);
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value.trim(); this.closeChat(); if (v) this.game.handleChat(v); }
      else if (e.key === 'Escape') this.closeChat();
    };
  }
  closeChat() {
    this.chatOpen = false;
    this.screen = null;
    this.root.classList.add('hidden'); this.root.innerHTML = '';
    this.game.lockPointer();
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export { escapeHtml };
void BLOCKS;

// ---------------------------------------------------------------- HUD icon sprites (drawn from scratch)
function sprite(rows, pal) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return `url(${c.toDataURL()})`;
}
function halfPal(rows, pal, emptyPal) {
  // left half full, right half empty
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const p = x < r.length / 2 ? pal : emptyPal; if (p[ch]) { g.fillStyle = p[ch]; g.fillRect(x, y, 1, 1); } }));
  return `url(${c.toDataURL()})`;
}
function setupIconVars() {
  const root = document.documentElement.style;
  const heart = ['.XX...XX.', 'XrrX.XrrX', 'XrwrXrrrX', 'XrrrrrrrX', 'XrrrrrrrX', '.XrrrrrX.', '..XrrrX..', '...XrX...', '....X....'];
  const hFull = { X: '#000', r: '#e01818', w: '#ffb0b0' }, hEmpty = { X: '#000', r: '#3a1010', w: '#3a1010' };
  root.setProperty('--heart-full', sprite(heart, hFull));
  root.setProperty('--heart-empty', sprite(heart, hEmpty));
  root.setProperty('--heart-half', halfPal(heart, hFull, hEmpty));
  const food = ['.....XX..', '....XbbX.', '...XbhbX.', '..XbbbbX.', '.XbbbbX..', 'XwXbbX...', 'XwwXX....', '.XwX.....', '..X......'];
  const fFull = { X: '#2a1404', b: '#b5651d', h: '#e09a50', w: '#f0e8d8' }, fEmpty = { X: '#2a1404', b: '#3a2a1a', h: '#3a2a1a', w: '#4a4a4a' };
  root.setProperty('--food-full', sprite(food, fFull));
  root.setProperty('--food-empty', sprite(food, fEmpty));
  root.setProperty('--food-half', halfPal(food, fEmpty, fFull));
  const armor = ['.XXX.XXX.', 'XgggXgggX', 'XgwgggggX', '.XgggggX.', '.XgggggX.', '.XgggggX.', '.XgggggX.', '.XXXXXXX.', '.........'];
  const aFull = { X: '#1a1a1a', g: '#c8c8c8', w: '#ffffff' }, aEmpty = { X: '#1a1a1a', g: '#3a3a3a', w: '#3a3a3a' };
  root.setProperty('--armor-full', sprite(armor, aFull));
  root.setProperty('--armor-empty', sprite(armor, aEmpty));
  root.setProperty('--armor-half', halfPal(armor, aFull, aEmpty));
  root.setProperty('--armor-empty-slot', sprite(armor, { X: '#555', g: '#9a9a9a', w: '#9a9a9a' }));
  const bubble = ['..XXXX...', '.XwbbbX..', 'XwbbbbbX.', 'XbbbbbbX.', 'XbbbbbbX.', '.XbbbbX..', '..XXXX...', '.........', '.........'];
  root.setProperty('--bubble-full', sprite(bubble, { X: '#0a1a6a', b: '#3a6ad8', w: '#d0e8ff' }));
  // dirt menu background
  const d = tileCanvas('dirt');
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); g.drawImage(d, 0, 0); g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, 16, 16);
  root.setProperty('--dirt-bg', `url(${c.toDataURL()})`);
}

// stone-cutter recipes: input -> [[output, count]]
function stonecutterOutputs(n) {
  const map = {
    stone: [['stone_slab', 2], ['stone_stairs', 1], ['stone_bricks', 1], ['stone_brick_slab', 2], ['stone_brick_stairs', 1], ['smooth_stone', 1]],
    cobblestone: [['cobblestone_slab', 2], ['cobblestone_stairs', 1]],
    stone_bricks: [['stone_brick_slab', 2], ['stone_brick_stairs', 1]],
    bricks: [['brick_slab', 2], ['brick_stairs', 1]],
    sandstone: [['sandstone_slab', 2], ['sandstone_stairs', 1]],
    smooth_stone: [['smooth_stone_slab', 2]],
    quartz_block: [['quartz_slab', 2], ['quartz_stairs', 1]],
    nether_bricks: [['nether_brick_slab', 2], ['nether_brick_stairs', 1], ['nether_brick_fence', 1]],
    purpur_block: [['purpur_slab', 2], ['purpur_stairs', 1]],
    end_stone: [['end_stone_bricks', 1]],
    granite: [['granite', 1]], diorite: [['diorite', 1]], andesite: [['andesite', 1]],
  };
  return (map[n] ?? []).filter(([o]) => I[o] != null);
}
