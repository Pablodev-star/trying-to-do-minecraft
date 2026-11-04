// Game bootstrap: renderer, title screen, world lifecycle, loop, input and game rules.
import * as THREE from '../lib/three.module.min.js';
import { BLOCKS, B, ITEMS, I, SMELTING, SMOKER_OK, fuelTime, copyStack } from './registry.js';
import { World, worldUniforms, CS, CH, SOLID, OPAQUE } from './world.js';
import { BIOMES } from './worldgen.js';
import { Player } from './player.js';
import { Mob, ItemEntity, FallingBlock, PrimedTNT, Projectile, EndCrystal, XPOrb, makeItemMesh, MOB_INFO } from './entities.js';
import { buildModel } from './models.js';
import { UI, escapeHtml } from './ui.js';
import { tileCanvas, atlasCanvas } from './textures.js';
import { playSound, audio, unlockAudio, startMusic } from './audio.js';
import { hashString } from './noise.js';
import { blockBoxesAt } from './shapes.js';
import { enchLevel, ENCHANTS } from './enchant.js';
import { brew, potionEffects } from './effects.js';
import { ShaderPipeline, makeSkyDome } from './shaders.js';
import { Redstone, DIRS6 } from './redstone.js';
import { TouchControls, IS_TOUCH } from './touch.js';

const $ = (s) => document.querySelector(s);
const TPS = 20;
const SPLASHES = ['¡100% hecho a mano!', '¡Ahora en JavaScript!', '¡Cúbico!', '¡Sin assets robados!', '¡Píxeles procedurales!', '¡Mira, un creeper!', '¡Cuidado con los ghasts!', '¡Pico de diamante!', '¡Vuela en creativo!', '¡Ssssss...!', '¡Más de 300 objetos!', '¡El End te espera!', '¡Picar y construir!'];

class Game {
  constructor() {
    this.canvas = $('#game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.touch = IS_TOUCH;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.touch ? 1 : 1.5));
    if (this.touch) document.body.classList.add('touch');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
    this.handScene = new THREE.Scene();
    this.handCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.sunLight.position.set(0.4, 1, 0.3);
    this.scene.add(this.ambient, this.sunLight);
    this.handScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const hl = new THREE.DirectionalLight(0xffffff, 0.5); hl.position.set(-0.5, 1, 0.8); this.handScene.add(hl);
    this.entities = [];
    this.particles = new Particles(this);
    this.options = loadOptions();
    this.applyGuiScale();
    audio.volume = this.options.volume / 100;
    this.keys = {};
    this.mouse = { left: false, right: false };
    this.time = 1000;
    this.daylightLevel = 1;
    this.dimAmbient = 0;
    this.fps = 0;
    this.showDebug = false;
    this.hideHud = false;
    this.thirdPerson = 0;
    this.running = false;
    this.achievements = new Set();
    this.stats = { broken: 0, placed: 0, kills: 0 };
    this.weather = { rain: 0, target: 0, thunder: false, timer: 200 + Math.random() * 400, forced: false };
    this.flash = 0;
    this.dropGround = [];
    this.buildSky();
    try { this.pipeline = new ShaderPipeline(this.renderer, worldUniforms); } catch (e) { console.warn('Shaders no disponibles', e); this.pipeline = null; }
    this.buildHelpers();
    this.ui = new UI(this);
    this.touchControls = IS_TOUCH ? new TouchControls(this) : null;
    // On hybrid devices (touchscreen laptop, tablet + keyboard) follow the input actually in use.
    if (this.touchControls) {
      // Touch -> touch mode. Only real mouse movement or real game keys switch to desktop mode,
      // and never right after a touch (mobile browsers fire emulated mouse/key events).
      const recentTouch = () => performance.now() - (this.lastTouchAt ?? -1e9) < 1500;
      document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') { this.lastTouchAt = performance.now(); this.setTouchMode(true); } }, true);
      document.addEventListener('touchstart', () => { this.lastTouchAt = performance.now(); this.setTouchMode(true); }, { capture: true, passive: true });
      document.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || recentTouch() || !(Math.abs(e.movementX) + Math.abs(e.movementY) > 0)) return;
        this.mouseMoves = (this.mouseMoves ?? 0) + 1;
        if (this.mouseMoves > 8) this.setTouchMode(false);
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229 || recentTouch() || document.activeElement?.tagName === 'INPUT') return;
        if (/^(Key[WASD]|Space)$/.test(e.code) && this.running) this.setTouchMode(false);
      }, true);
    }
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    this.tickAcc = 0;
    this.frames = 0; this.fpsTime = 0;
    requestAnimationFrame((t) => this.loop(t));
    this.titleScreen();
  }

  // ---------------------------------------------------------------- options
  applyGuiScale() { document.documentElement.style.setProperty('--s', this.options.guiScale); }
  remeshAll() { if (this.world) for (const c of this.world.chunks.values()) c.meshDirty = true; }
  saveOptions() { try { localStorage.setItem('mc_options', JSON.stringify(this.options)); } catch { /* ignore */ } audio.volume = this.options.volume / 100; this.applyGuiScale(); }
  get difficulty() { return this.options.difficulty; }
  get difficultyMul() { return { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5 }[this.options.difficulty]; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.handCamera.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.handCamera.updateProjectionMatrix();
    this.pipeline?.setSize(w, h);
  }

  // ---------------------------------------------------------------- sky
  buildSky() {
    const sunC = document.createElement('canvas'); sunC.width = sunC.height = 16;
    let g = sunC.getContext('2d');
    g.fillStyle = '#fff8a0'; g.fillRect(2, 2, 12, 12); g.fillStyle = '#ffffe8'; g.fillRect(4, 4, 8, 8);
    const sunT = new THREE.CanvasTexture(sunC); sunT.magFilter = THREE.NearestFilter;
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: sunT, transparent: true, fog: false, depthWrite: false }));
    const moonC = document.createElement('canvas'); moonC.width = moonC.height = 16;
    g = moonC.getContext('2d');
    g.fillStyle = '#d8dcf0'; g.fillRect(3, 3, 10, 10); g.fillStyle = '#a8acc8'; g.fillRect(5, 5, 2, 2); g.fillRect(9, 8, 3, 2); g.fillRect(6, 10, 2, 1);
    const moonT = new THREE.CanvasTexture(moonC); moonT.magFilter = THREE.NearestFilter;
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: moonT, transparent: true, fog: false, depthWrite: false }));
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(400);
      sp.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false }));
    this.skyGroup = new THREE.Group();
    this.skyGroup.add(this.sun, this.moon, this.stars);
    this.scene.add(this.skyGroup);
    // clouds: blocky texture on a big plane
    const cc = document.createElement('canvas'); cc.width = cc.height = 128;
    g = cc.getContext('2d');
    const r = Math.random;
    for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; const x = (r() * 128) | 0, y = (r() * 128) | 0; g.fillRect(x, y, 4 + ((r() * 14) | 0), 3 + ((r() * 8) | 0)); }
    const ct = new THREE.CanvasTexture(cc); ct.magFilter = ct.minFilter = THREE.NearestFilter; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(4, 4);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2048, 2048), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 130;
    this.scene.add(this.clouds);
    this.skyDome = makeSkyDome(worldUniforms);
    this.scene.add(this.skyDome);
    const N = 1600;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6).fill(-999), 3));
    this.precip = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0x9ab8e8, transparent: true, opacity: 0.5, depthWrite: false }));
    this.precip.frustumCulled = false;
    this.precip.visible = false;
    this.scene.add(this.precip);
  }

  buildHelpers() {
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.selBox.visible = false;
    this.scene.add(this.selBox);
    this.crackMats = [];
    for (let i = 0; i < 10; i++) {
      const t = new THREE.CanvasTexture(tileCanvas('destroy_' + i)); t.magFilter = t.minFilter = THREE.NearestFilter;
      this.crackMats.push(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    }
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMats[0]);
    this.crack.visible = false;
    this.scene.add(this.crack);
    this.hand = new THREE.Group();
    this.handScene.add(this.hand);
  }

  // ---------------------------------------------------------------- title & world selection
  titleScreen() {
    this.running = false;
    this.releasePointer();
    this.hud(false);
    this.startPanorama();
    const splash = SPLASHES[(Math.random() * SPLASHES.length) | 0];
    const m = this.ui.menu(`
      <div class="logo-wrap"><canvas id="logo" width="460" height="90"></canvas><div class="splash">${splash}</div></div>
      <button class="mc-btn" id="t-single">Un jugador</button>
      <button class="mc-btn" id="t-multi">Multijugador</button>
      <div class="row"><button class="mc-btn half" id="t-opt">Opciones...</button><button class="mc-btn half" id="t-quit">Salir del juego</button></div>
      <div class="version">VoxelCraft 1.0 — hecho desde cero</div>
      <div class="copyright">Proyecto personal de aprendizaje. Todo el contenido gráfico y sonoro se genera por código.</div>`, 'title');
    drawLogo($('#logo'));
    $('#t-single', m).onclick = () => { playSound('click'); this.worldList(); };
    $('#t-multi', m).onclick = () => { playSound('click'); this.ui.menu('<h2>Multijugador</h2><p>El modo multijugador no está disponible en esta versión.</p><button class="mc-btn" id="mp-back">Volver</button>', 'dirt'); $('#mp-back').onclick = () => this.titleScreen(); };
    $('#t-opt', m).onclick = () => { playSound('click'); this.ui.options(() => this.titleScreen(), true); };
    $('#t-quit', m).onclick = () => { this.ui.menu('<h2>Gracias por jugar</h2><p>Puedes cerrar esta pestaña.</p><button class="mc-btn" id="q-back">Volver</button>', 'dirt'); $('#q-back').onclick = () => this.titleScreen(); };
    unlockAudioOnce();
  }

  startPanorama() {
    if (this.panorama) return;
    this.disposeWorld();
    this.dim = 'overworld';
    this.seed = hashString('panorama-' + (Date.now() / 86400000 | 0));
    this.world = new World(this, 'overworld', this.seed);
    this.scene.add(this.world.group);
    const s = this.findSpawn();
    this.panorama = { x: s.x, y: Math.max(s.y + 12, 80), z: s.z, a: 0 };
    this.player = null;
  }

  worldList() {
    const worlds = listWorlds();
    const m = this.ui.menu(`<h2>Seleccionar mundo</h2>
      <div class="world-list">${worlds.length ? worlds.map((w, i) => `<div class="world-item" data-i="${i}"><div class="w-name">${escapeHtml(w.name)}</div><div class="w-info">${new Date(w.lastPlayed).toLocaleString()} — Modo ${w.mode === 'creative' ? 'Creativo' : 'Supervivencia'}</div></div>`).join('') : '<div class="empty">No hay mundos. ¡Crea uno nuevo!</div>'}</div>
      <div class="row"><button class="mc-btn half" id="w-play" disabled>Jugar el mundo seleccionado</button><button class="mc-btn half" id="w-new">Crear nuevo mundo</button></div>
      <div class="row"><button class="mc-btn half" id="w-del" disabled>Borrar</button><button class="mc-btn half" id="w-back">Cancelar</button></div>`, 'dirt worlds');
    let sel = -1;
    m.querySelectorAll('.world-item').forEach((d) => {
      d.onclick = () => { m.querySelectorAll('.world-item').forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); sel = Number(d.dataset.i); $('#w-play').disabled = false; $('#w-del').disabled = false; };
      d.ondblclick = () => this.loadWorld(worlds[Number(d.dataset.i)].id);
    });
    $('#w-play').onclick = () => sel >= 0 && this.loadWorld(worlds[sel].id);
    $('#w-new').onclick = () => this.createWorldScreen();
    $('#w-del').onclick = () => { if (sel >= 0 && confirm(`¿Seguro que quieres borrar "${worlds[sel].name}"? ¡Se perderá para siempre!`)) { deleteWorld(worlds[sel].id); this.worldList(); } };
    $('#w-back').onclick = () => this.titleScreen();
  }

  createWorldScreen() {
    let mode = 'survival', cheats = false;
    const m = this.ui.menu(`<h2>Crear nuevo mundo</h2>
      <label class="field">Nombre del mundo<input id="c-name" value="Nuevo mundo" maxlength="32"></label>
      <button class="mc-btn" id="c-mode">Modo de juego: Supervivencia</button>
      <div class="hint" id="c-hint">Busca recursos, fabrica, sube de nivel, cuida tu salud y aliméntate.</div>
      <button class="mc-btn" id="c-cheats">Permitir trucos: NO</button>
      <label class="field">Semilla para el generador de mundos<input id="c-seed" placeholder="Déjalo en blanco para una semilla aleatoria"></label>
      <div class="row"><button class="mc-btn half" id="c-create">Crear nuevo mundo</button><button class="mc-btn half" id="c-cancel">Cancelar</button></div>`, 'dirt create');
    m.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    $('#c-mode').onclick = () => {
      mode = mode === 'survival' ? 'creative' : mode === 'creative' ? 'hardcore' : 'survival';
      $('#c-mode').textContent = 'Modo de juego: ' + { survival: 'Supervivencia', creative: 'Creativo', hardcore: 'Extremo' }[mode];
      $('#c-hint').textContent = { survival: 'Busca recursos, fabrica, sube de nivel, cuida tu salud y aliméntate.', creative: 'Recursos ilimitados, vuelo libre y destrucción instantánea de bloques.', hardcore: 'Igual que supervivencia pero bloqueado en la dificultad más alta y con una sola vida.' }[mode];
      if (mode === 'creative') { cheats = true; $('#c-cheats').textContent = 'Permitir trucos: SÍ'; }
    };
    $('#c-cheats').onclick = () => { cheats = !cheats; $('#c-cheats').textContent = 'Permitir trucos: ' + (cheats ? 'SÍ' : 'NO'); };
    $('#c-cancel').onclick = () => this.worldList();
    $('#c-create').onclick = () => {
      const name = $('#c-name').value.trim() || 'Nuevo mundo';
      const seedStr = $('#c-seed').value.trim();
      const seed = seedStr ? (/^-?\d+$/.test(seedStr) ? Number(seedStr) >>> 0 : hashString(seedStr)) : (Math.random() * 2 ** 32) >>> 0;
      const id = 'w' + Date.now().toString(36);
      const meta = { id, name, seed, mode: mode === 'hardcore' ? 'survival' : mode, hardcore: mode === 'hardcore', cheats, created: Date.now(), lastPlayed: Date.now() };
      saveWorldMeta(meta);
      this.loadWorld(id, true);
    };
  }

  // ---------------------------------------------------------------- world lifecycle
  disposeWorld() {
    for (const e of this.entities) this.scene.remove(e.mesh);
    this.entities = [];
    this.particles.clear();
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); this.world = null; }
    this.panorama = null;
  }

  loadWorld(id, fresh = false) {
    const meta = listWorlds().find((w) => w.id === id);
    if (!meta) return;
    this.ui.menu('<h2>Cargando mundo...</h2><div class="loading-bar"><div class="loading-fill" id="lf"></div></div><p id="lmsg">Generando terreno</p>', 'dirt');
    setTimeout(() => this._loadWorld(meta, fresh), 30);
  }

  _loadWorld(meta, fresh) {
    this.disposeWorld();
    this.meta = meta;
    this.seed = meta.seed;
    this.cheats = meta.cheats;
    const save = fresh ? null : migrateSave(readWorld(meta.id));
    this.dimData = save?.dims ?? {};
    this.time = save?.time ?? 1000;
    this.dragonKilled = save?.dragonKilled ?? false;
    this.villagesSpawned = new Set(save?.villagesSpawned ?? []);
    this.structuresSpawned = new Set(save?.structuresSpawned ?? []);
    this.daysAwake = save?.daysAwake ?? 0;
    if (save?.weather) Object.assign(this.weather, save.weather, { rain: save.weather.target });
    else Object.assign(this.weather, { rain: 0, target: 0, thunder: false, timer: 300 + Math.random() * 400 });
    this.keepInventory = save?.keepInventory ?? false;
    this.achievements = new Set(save?.achievements ?? []);
    this.stats = save?.stats ?? { broken: 0, placed: 0, kills: 0 };
    this.player = new Player(this);
    this.player.mode = meta.mode;
    if (meta.hardcore) this.options.difficulty = 'hard';
    const ps = save?.player;
    const dim = ps?.dim ?? 'overworld';
    this.enterDimension(dim, !ps);
    if (ps) {
      const p = this.player;
      p.pos.set(ps.pos[0], ps.pos[1], ps.pos[2]); p.yaw = ps.yaw; p.pitch = ps.pitch;
      p.health = ps.health; p.food = ps.food; p.saturation = ps.saturation; p.xp = ps.xp; p.level = ps.level;
      p.inventory = ps.inventory; p.armor = ps.armor; p.selected = ps.selected ?? 0; p.mode = ps.mode ?? meta.mode;
      p.spawnPoint = ps.spawnPoint; p.flying = ps.flying ?? false;
      this.loadChunksAround(true);
      for (const m of save.mobs ?? []) { const e = this.spawnMob(m.type, m.x, m.y, m.z, { baby: m.baby, woolColor: m.wool }); if (e) { e.tamed = m.tamed; e.home = m.home; e.customName = m.name; if (m.v) { Object.assign(e, m.v); e.applyRobe(); } if (m.tamed) e.owner = this.player; if (m.sheared) e.shear(); } }
    } else if (this.player.mode === 'creative') this.player.give(I.grass_block, 1);
    this.running = true;
    this.ui.screen = null;
    this.ui.root.classList.add('hidden'); this.ui.root.innerHTML = '';
    this.hud(true);
    this.ui.refresh();
    this.ui.chat(fresh ? (this.touch ? `Bienvenido a "${meta.name}". Joystick para moverte, arrastra para mirar, toca para usar/colocar y mantén para romper.` : `Bienvenido a "${meta.name}". Pulsa E para el inventario, T para el chat, F3 para depurar.`) : `Mundo "${meta.name}" cargado.`);
    this.lockPointer();
    this.saveTimer = 0;
    startMusic(() => this.options.volume);
  }

  enterDimension(dim, newPlayer = false) {
    if (this.world) {
      this.dimData[this.dim] = this.world.serialize();
      for (const e of this.entities) { this.scene.remove(e.mesh); if (e.home) this.villagesSpawned?.delete(e.home); }
      this.entities = [];
      this.scene.remove(this.world.group); this.world.dispose();
    }
    this.dim = dim;
    const d = this.dimData[dim];
    this.redstone = new Redstone(this);
    this.world = new World(this, dim, this.seed, d?.chunks);
    if (d?.tiles) for (const [k, v] of Object.entries(d.tiles)) this.world.tiles.set(k, v);
    this.scene.add(this.world.group);
    this.dimAmbient = dim === 'nether' ? 0.32 : dim === 'end' ? 0.28 : 0;
    worldUniforms.ambient.value = this.dimAmbient;
    this.sky = dim;
    if (newPlayer) {
      const s = this.findSpawn();
      this.player.pos.set(s.x + 0.5, s.y + 1, s.z + 0.5);
      this.player.spawnPoint = null;
      this.worldSpawn = s;
    } else if (dim === 'overworld') this.worldSpawn = this.worldSpawn ?? this.findSpawn();
    if (dim === 'end') this.setupEnd();
  }

  findSpawn() {
    const gen = this.world.gen;
    if (this.dim !== 'overworld') return { x: 0, y: 64, z: 0 };
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a / 8 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 8 * Math.PI * 2) * r);
        const h = gen.heightInfo(x, z);
        if (h.h > 62 && h.biome !== 0 && h.biome !== 1 && h.biome !== 8) {
          this.world.ensureChunk(x >> 4, z >> 4);
          const y = this.world.surfaceY(x, z);
          if (y > 0 && this.world.getBlock(x, y, z) !== B.water && !BLOCKS[this.world.getBlock(x, y, z)].name.endsWith('leaves')) return { x, y, z };
        }
      }
    }
    return { x: 0, y: 80, z: 0 };
  }

  setupEnd() {
    // obsidian spawn platform
    const px = 100, py = 48, pz = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) this.world.ensureChunk((px + dx) >> 4, (pz + dz) >> 4);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      this.world.setBlock(px + dx, py, pz + dz, B.obsidian, 0, { noUpdate: true });
      for (let dy = 1; dy <= 3; dy++) this.world.setBlock(px + dx, py + dy, pz + dz, 0, 0, { noUpdate: true });
    }
    this.player.pos.set(px + 0.5, py + 1, pz + 0.5);
    this.player.vel.set(0, 0, 0);
    if (!this.dragonKilled) {
      for (const t of this.world.gen.pillarTops()) this.addEntity(new EndCrystal(this, t.x, t.y + 0.5, t.z));
      this.spawnMob('ender_dragon', 0, 90, 0);
      this.chat('Un rugido resuena por todo el End...');
      playSound('dragon');
    } else this.activateExitPortal(false);
  }

  activateExitPortal(withEgg) {
    const w = this.world;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) w.ensureChunk(dx >> 4, dz >> 4);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz <= 4 && (dx || dz)) w.setBlock(dx, 60, dz, B.end_portal, 0, { noUpdate: true });
    if (withEgg) w.setBlock(0, 64, 0, B.dragon_egg);
  }

  onDragonDeath() {
    this.dragonKilled = true;
    this.activateExitPortal(true);
    this.chat('¡Has derrotado al Dragón del End! El portal de salida se ha abierto.');
    this.achieve('¡Libera el End!');
    playSound('levelup');
  }

  travel(to) {
    const p = this.player;
    const from = this.dim;
    this.chat(to === 'nether' ? 'Entrando en el Nether...' : to === 'end' ? 'Entrando en el End...' : 'Volviendo al mundo normal...');
    playSound('portal');
    p.portalLock = true; p.portalTime = 0;
    let tx = p.pos.x, tz = p.pos.z;
    if (from === 'overworld' && to === 'nether') { tx /= 8; tz /= 8; }
    if (from === 'nether' && to === 'overworld') { tx *= 8; tz *= 8; }
    this.enterDimension(to);
    if (to === 'end') { this.achieve('El fin?'); return; }
    if (from === 'end') {
      const s = p.spawnPoint ?? this.worldSpawn ?? this.findSpawn();
      this.world.ensureChunk(s.x >> 4, s.z >> 4);
      p.pos.set(s.x + 0.5, this.world.surfaceY(s.x, s.z) + 1, s.z + 0.5);
      return;
    }
    if (to === 'nether') this.achieve('Hacia las profundidades');
    const pos = this.findOrCreatePortal(Math.floor(tx), Math.floor(tz));
    p.pos.set(pos.x + 0.5, pos.y, pos.z + 0.5);
    p.vel.set(0, 0, 0); p.fallStart = null;
  }

  findOrCreatePortal(x, z) {
    const w = this.world;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.ensureChunk((x >> 4) + dx, (z >> 4) + dz);
    let best = null, bd = Infinity;
    for (let dx = -24; dx <= 24; dx++) for (let dz = -24; dz <= 24; dz++) for (let y = 1; y < CH - 1; y++) {
      if (w.getBlock(x + dx, y, z + dz) === B.nether_portal && w.getBlock(x + dx, y - 1, z + dz) !== B.nether_portal) {
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { x: x + dx, y, z: z + dz }; }
      }
    }
    if (best) return best;
    // find a spot with ground and room
    let spot = null;
    outer: for (let r = 0; r < 16; r += 2) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
      for (let y = this.dim === 'nether' ? 100 : CH - 10; y > 32; y--) {
        const ok = SOLID[w.getBlock(x + dx, y - 1, z + dz)] && w.getBlock(x + dx, y - 1, z + dz) !== B.lava;
        if (!ok) continue;
        let free = true;
        for (let a = 0; a < 4 && free; a++) for (let h = 0; h < 5 && free; h++) if (w.getBlock(x + dx + a - 1, y + h, z + dz) !== 0) free = false;
        if (free) { spot = { x: x + dx, y, z: z + dz }; break outer; }
      }
    }
    if (!spot) spot = { x, y: 70, z };
    const { x: sx, y: sy, z: sz } = spot;
    // platform + frame along x
    for (let a = -1; a <= 2; a++) for (let b = -1; b <= 1; b++) w.setBlock(sx + a, sy - 1, sz + b, B.obsidian, 0, { noUpdate: true });
    for (let a = -1; a <= 2; a++) for (let h = 0; h < 5; h++) for (let b = -1; b <= 1; b++) {
      if (b !== 0) { if (h < 3) w.setBlock(sx + a, sy + h, sz + b, 0, 0, { noUpdate: true }); continue; }
      const frame = a === -1 || a === 2 || h === 0 || h === 4;
      w.setBlock(sx + a, sy + h - 1, sz, frame ? B.obsidian : B.nether_portal, 0, { noUpdate: true });
    }
    return { x: sx, y: sy, z: sz };
  }

  tryLightPortal(hit) {
    const w = this.world;
    const [fx, fy, fz] = hit.face;
    const sx = hit.x + fx, sy = hit.y + fy, sz = hit.z + fz;
    for (const axis of [0, 1]) {
      const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1;
      // find bottom of interior
      let y = sy; while (y > sy - 21 && w.getBlock(sx, y - 1, sz) !== B.obsidian) { if (w.getBlock(sx, y - 1, sz) !== 0 && w.getBlock(sx, y - 1, sz) !== B.fire) break; y--; }
      if (w.getBlock(sx, y - 1, sz) !== B.obsidian) continue;
      let x0 = sx, z0 = sz;
      while (w.getBlock(x0 - ax, y, z0 - az) === 0 || w.getBlock(x0 - ax, y, z0 - az) === B.fire) { x0 -= ax; z0 -= az; if (Math.abs(x0 - sx) + Math.abs(z0 - sz) > 21) break; }
      if (w.getBlock(x0 - ax, y, z0 - az) !== B.obsidian) continue;
      let width = 0;
      while ((w.getBlock(x0 + ax * width, y, z0 + az * width) === 0 || w.getBlock(x0 + ax * width, y, z0 + az * width) === B.fire) && width < 22) width++;
      if (width < 2 || width > 21 || w.getBlock(x0 + ax * width, y, z0 + az * width) !== B.obsidian) continue;
      let height = 0, ok = true;
      for (; height < 22; height++) {
        let rowEmpty = true;
        for (let i = 0; i < width; i++) { const id = w.getBlock(x0 + ax * i, y + height, z0 + az * i); if (id !== 0 && id !== B.fire) rowEmpty = false; }
        if (!rowEmpty) break;
        if (w.getBlock(x0 - ax, y + height, z0 - az) !== B.obsidian || w.getBlock(x0 + ax * width, y + height, z0 + az * width) !== B.obsidian) { ok = false; break; }
      }
      if (!ok || height < 3) continue;
      for (let i = 0; i < width; i++) if (w.getBlock(x0 + ax * i, y + height, z0 + az * i) !== B.obsidian) ok = false;
      if (!ok) continue;
      for (let i = 0; i < width; i++) for (let h = 0; h < height; h++) w.setBlock(x0 + ax * i, y + h, z0 + az * i, B.nether_portal, axis === 0 ? 0 : 1, { noUpdate: true });
      playSound('portal');
      this.achieve('Hacia las profundidades... casi');
      return true;
    }
    return false;
  }

  checkPortalIntegrity(x, y, z) {
    const w = this.world;
    const meta = w.getMeta(x, y, z);
    const ax = meta === 0 ? 1 : 0, az = meta === 0 ? 0 : 1;
    const okN = (id) => id === B.obsidian || id === B.nether_portal;
    if (!okN(w.getBlock(x, y + 1, z)) || !okN(w.getBlock(x, y - 1, z)) || !okN(w.getBlock(x + ax, y, z + az)) || !okN(w.getBlock(x - ax, y, z - az))) {
      // break the whole portal (flood)
      const q = [[x, y, z]], seen = new Set();
      while (q.length) {
        const [a, b, c] = q.pop();
        const k = a + ',' + b + ',' + c;
        if (seen.has(k) || w.getBlock(a, b, c) !== B.nether_portal) continue;
        seen.add(k);
        w.setBlock(a, b, c, 0, 0, { noUpdate: true });
        q.push([a + ax, b, c + az], [a - ax, b, c - az], [a, b + 1, c], [a, b - 1, c]);
      }
    }
  }

  checkEndPortal(x, y, z) {
    const w = this.world;
    // search a 3x3 interior whose ring of 12 frames are all filled
    for (let cx = x - 4; cx <= x + 4; cx++) for (let cz = z - 4; cz <= z + 4; cz++) {
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) {
        const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2);
        if (ring && w.getBlock(cx + dx, y, cz + dz) !== B.end_portal_frame_eye) ok = false;
      }
      if (ok) {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.setBlock(cx + dx, y, cz + dz, B.end_portal, 0, { noUpdate: true });
        playSound('portal');
        this.chat('El portal del End se ha activado.');
        return;
      }
    }
  }

  checkGolem(x, y, z) {
    const w = this.world;
    if (w.getBlock(x, y - 1, z) !== B.iron_block || w.getBlock(x, y - 2, z) !== B.iron_block) return;
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      if (w.getBlock(x + ax, y - 1, z + az) === B.iron_block && w.getBlock(x - ax, y - 1, z - az) === B.iron_block) {
        for (const [a, b, c] of [[x, y, z], [x, y - 1, z], [x, y - 2, z], [x + ax, y - 1, z + az], [x - ax, y - 1, z - az]]) w.setBlock(a, b, c, 0);
        this.spawnMob('iron_golem', x + 0.5, y - 2, z + 0.5);
        return;
      }
    }
  }

  sleep(hit) {
    const p = this.player;
    const t = this.time % 24000;
    p.spawnPoint = { x: hit.x, y: hit.y + 1, z: hit.z };
    if (this.dim !== 'overworld') { this.explode(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 5, true); return; }
    if (t < 12541 || t > 23458) { this.chat('Solo puedes dormir de noche. Punto de reaparición establecido.'); return; }
    if (this.entities.some((e) => e instanceof Mob && e.hostile && !e.dead && e.pos.distanceTo(p.pos) < 8)) { this.chat('No puedes descansar ahora, hay monstruos cerca.'); return; }
    const fade = $('#fade'); fade.style.opacity = 1;
    this.daysAwake = 0;
    setTimeout(() => { this.time = Math.ceil(this.time / 24000) * 24000; fade.style.opacity = 0; this.chat('Buenos días.'); }, 1500);
  }

  // ---------------------------------------------------------------- saving
  saveGame() {
    if (!this.meta || !this.player) return;
    const dims = { ...this.dimData, [this.dim]: this.world.serialize() };
    const p = this.player;
    const mobs = this.entities.filter((e) => e instanceof Mob && !e.dead && !e.hostile && e.type !== 'ender_dragon' && e.pos.distanceTo(p.pos) < 96)
      .map((e) => ({ type: e.type, x: e.pos.x, y: e.pos.y, z: e.pos.z, baby: e.baby, tamed: e.tamed, sheared: e.sheared, wool: e.woolColor, home: e.home, name: e.customName, v: e.type === 'villager' ? { ...e.villagerSnapshot(), jobPos: e.jobPos, nitwit: e.nitwit } : undefined }));
    const keptVillages = this.dim === 'overworld' ? [...new Set(mobs.map((m) => m.home).filter(Boolean))] : [...this.villagesSpawned];
    const data = {
      version: 2, seed: this.seed, time: this.time, dims, villagesSpawned: keptVillages, structuresSpawned: [...this.structuresSpawned], daysAwake: this.daysAwake, weather: { target: this.weather.target, thunder: this.weather.thunder, timer: this.weather.timer }, dragonKilled: this.dragonKilled, keepInventory: this.keepInventory,
      achievements: [...this.achievements], stats: this.stats, mobs: this.dim === 'overworld' ? mobs : [],
      player: { pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, pitch: p.pitch, health: p.health, food: p.food, saturation: p.saturation, xp: p.xp, level: p.level, inventory: p.inventory, armor: p.armor, selected: p.selected, mode: p.mode, dim: this.dim, spawnPoint: p.spawnPoint, flying: p.flying },
    };
    try {
      localStorage.setItem('mc_world_' + this.meta.id, JSON.stringify(data));
      this.meta.lastPlayed = Date.now();
      saveWorldMeta(this.meta);
    } catch (e) {
      this.chat('§ No se pudo guardar el mundo (almacenamiento lleno): ' + e.message);
    }
  }

  quitToTitle() {
    this.saveGame();
    this.ui.screen = null;
    this.disposeWorld();
    this.player = null;
    this.meta = null;
    this.titleScreen();
  }

  // ---------------------------------------------------------------- entities
  addEntity(e) { this.entities.push(e); this.scene.add(e.mesh); e.sync(); return e; }
  spawnMob(type, x, y, z, opts) { if (!MOB_INFO[type]) return null; return this.addEntity(new Mob(this, type, x, y, z, opts)); }
  spawnItem(x, y, z, stack, scatter = false) {
    if (!stack || !stack.id || stack.count <= 0) return;
    const e = new ItemEntity(this, x, y, z, copyStack(stack));
    e.vel.set((Math.random() - 0.5) * (scatter ? 6 : 3), 4, (Math.random() - 0.5) * (scatter ? 6 : 3));
    this.addEntity(e);
  }
  dropStack(stack) {
    const p = this.player;
    const d = p.lookDir();
    const e = new ItemEntity(this, p.pos.x + d.x * 0.3, p.pos.y + 1.3, p.pos.z + d.z * 0.3, stack);
    e.vel.copy(d.multiplyScalar(7)).add(new THREE.Vector3(0, 2, 0));
    e.pickupDelay = 1.5;
    this.addEntity(e);
  }
  // Splash potion: affect every living thing within 4 blocks, scaled by distance
  splashPotion(pos, kind, owner) {
    this.sfx('glass');
    const effects = potionEffects(kind);
    const color = new THREE.Color(kind === 'water' ? 0x385dc6 : 0xb060ff);
    for (let i = 0; i < 24; i++) this.particles.spawn(pos.x + (Math.random() - 0.5) * 2, pos.y + Math.random(), pos.z + (Math.random() - 0.5) * 2, color, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.8, 0.08, 4);
    if (kind === 'water') { for (const e of this.entities) if (e.type === 'enderman' && e.pos.distanceTo(pos) < 4) e.hurt(1, owner); return; }
    const scaled = (d) => effects.map((ef) => ({ ...ef, t: ef.t * (1 - d / 5) }));
    const p = this.player;
    const dp = p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).distanceTo(pos);
    if (dp < 4 && p.mode === 'survival') for (const ef of scaled(dp)) p.addEffect(ef.e, ef.t, ef.a);
    for (const e of this.entities) if (e instanceof Mob && !e.dead) { const d = e.pos.distanceTo(pos); if (d < 4) e.applyPotion(scaled(d)); }
  }

  spawnItemAt(x, y, z, stack) {
    const e = new ItemEntity(this, x, y, z, copyStack(stack));
    this.addEntity(e);
    return e;
  }
  launchFirework(x, y, z) {
    const colors = [0xff4040, 0x40ff60, 0x4080ff, 0xffe040, 0xff60ff, 0x60ffff];
    const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
    const start = new THREE.Vector3(x, y, z);
    this.sfx('throw');
    setTimeout(() => {
      const top = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 14 + Math.random() * 6, (Math.random() - 0.5) * 2));
      for (let i = 0; i < 60; i++) { const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 4); this.particles.spawn(top.x, top.y, top.z, c, d, 1.2 + Math.random(), 0.12, 2); }
      this.sfx('explode');
    }, 900);
    for (let i = 0; i < 14; i++) setTimeout(() => this.particles.spawn(x, y + i * 1.2, z, new THREE.Color(0xffd080), new THREE.Vector3(0, -1, 0), 0.4, 0.08, 0), i * 60);
  }
  spawnXP(x, y, z, amount) {
    amount = Math.round(amount);
    while (amount > 0) {
      const v = amount >= 17 ? 17 : amount >= 7 ? 7 : amount >= 3 ? 3 : 1;
      amount -= v;
      this.addEntity(new XPOrb(this, x, y, z, v));
    }
  }
  spawnFallingBlock(x, y, z, id) { this.world.setBlock(x, y, z, 0, 0, { noUpdate: false }); this.addEntity(new FallingBlock(this, x, y, z, id)); }
  dropBlockItems(x, y, z, id) { this.dropsFor(id, true).forEach((s) => this.spawnItem(x + 0.5, y + 0.3, z + 0.5, s)); }
  dropTileItems(x, y, z, items) { for (const s of items) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s, true); }

  dropsFor(id, canHarvest) {
    const b = BLOCKS[id];
    if (!canHarvest) return [];
    const held = this.player?.heldItem();
    const tool = held ? ITEMS[held.id] : null;
    // shears / silk-like behaviour for leaves and grass
    if (tool?.toolType === 'shears' && (b.name.endsWith('_leaves') || b.name === 'short_grass' || b.name === 'fern' || b.name === 'cobweb')) return [{ id: b.name === 'cobweb' ? I.cobweb : id, count: 1 }];
    // silk touch: the block itself (when it has an item)
    if (enchLevel(held, 'silk_touch') && ITEMS[id] && !b.noItem && b.render !== 'liquid') {
      const silk = { lit_furnace: 'furnace', lit_smoker: 'smoker', lit_blast_furnace: 'blast_furnace', farmland_wet: 'farmland' }[b.name];
      return [{ id: silk ? I[silk] : id, count: 1 }];
    }
    if (b.drops === null) return [];
    const fortune = enchLevel(held, 'fortune');
    if (fortune && b.name.endsWith('_ore') && b.drops !== undefined) {
      const base = typeof b.drops === 'string' ? [[b.drops, 1]] : b.drops();
      const mult = Math.max(1, Math.floor(Math.random() * (fortune + 2)));
      return base.filter(([, n]) => n > 0).map(([n, c]) => ({ id: I[n], count: c * mult }));
    }
    if (b.drops === undefined) return b.noItem ? [] : [{ id, count: 1 }];
    if (typeof b.drops === 'string') return [{ id: I[b.drops], count: 1 }];
    return b.drops().filter(([, n]) => n > 0).map(([n, c]) => ({ id: I[n], count: c }));
  }

  breakBlock(x, y, z, canHarvest) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const b = BLOCKS[id];
    this.particles.blockBreak(x, y, z, id);
    playSound('break:' + b.sound);
    if (id === B.tnt && this.player.mode === 'survival') { w.setBlock(x, y, z, 0); this.addEntity(new PrimedTNT(this, x, y, z)); return; }
    w.setBlock(x, y, z, id === B.ice && this.player.mode === 'survival' && w.getBlock(x, y - 1, z) ? B.water : 0);
    if (this.player.mode === 'survival') {
      for (const s of this.dropsFor(id, canHarvest)) this.spawnItem(x + 0.5, y + 0.3, z + 0.5, s);
      const xp = { coal_ore: 1, diamond_ore: 5, emerald_ore: 5, lapis_ore: 3, redstone_ore: 2, nether_quartz_ore: 2, nether_gold_ore: 1 }[b.name];
      if (xp && canHarvest) this.spawnXP(x + 0.5, y + 0.5, z + 0.5, xp);
      this.stats.broken++;
      if (b.name.endsWith('_log')) this.achieve('¡Consigue madera!');
      if (b.name === 'diamond_ore' && canHarvest) this.achieve('¡Diamantes!');
      if (b.name === 'stone' && canHarvest) this.achieve('La edad de piedra');
    }
    // upper part of double plants / sugar cane / cactus
    const above = w.getBlock(x, y + 1, z);
    if (above === B.sugar_cane || above === B.cactus) w.neighborUpdate(x, y + 1, z);
  }

  explode(x, y, z, power, fire) {
    const w = this.world;
    playSound('explode');
    this.particles.explosion(x, y, z, power);
    const r = Math.ceil(power * 1.4);
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const drops = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r) continue;
      const bx = fx + dx, by = fy + dy, bz = fz + dz;
      const id = w.getBlock(bx, by, bz);
      if (!id) continue;
      const b = BLOCKS[id];
      if (b.hardness < 0 || id === B.obsidian || id === B.crying_obsidian || id === B.end_portal_frame || id === B.water || id === B.lava) continue;
      const res = Math.min(b.hardness * 2.5, 6);
      const intensity = power * (0.7 + Math.random() * 0.6) - d * 0.75 - res * 0.3;
      if (intensity <= 0) continue;
      if (id === B.tnt) { w.setBlock(bx, by, bz, 0, 0, { noUpdate: true }); this.addEntity(new PrimedTNT(this, bx, by, bz, 0.5 + Math.random())); continue; }
      w.setBlock(bx, by, bz, 0, 0, { noUpdate: true });
      if (Math.random() < 1 / power) for (const s of this.dropsFor(id, true)) drops.push([bx, by, bz, s]);
    }
    for (const [bx, by, bz, s] of drops) this.spawnItem(bx + 0.5, by + 0.5, bz + 0.5, s);
    // neighbour updates around the crater edge
    for (let dx = -r - 1; dx <= r + 1; dx += 2) for (let dy = -r - 1; dy <= r + 1; dy += 2) for (let dz = -r - 1; dz <= r + 1; dz += 2) w.neighborUpdate(fx + dx, fy + dy, fz + dz);
    if (fire) for (let i = 0; i < power * 6; i++) {
      const bx = fx + ((Math.random() * r * 2) | 0) - r, bz = fz + ((Math.random() * r * 2) | 0) - r;
      for (let by = fy + r; by > fy - r; by--) if (!w.getBlock(bx, by, bz) && SOLID[w.getBlock(bx, by - 1, bz)]) { w.setBlock(bx, by, bz, B.fire); break; }
    }
    // damage
    const src = new THREE.Vector3(x, y, z);
    const hurtOne = (e) => {
      const c = e.pos.clone().add(new THREE.Vector3(0, e.h / 2, 0));
      const d = c.distanceTo(src);
      if (d > power * 2) return;
      const impact = 1 - d / (power * 2);
      const dmg = ((impact * impact + impact) / 2) * 7 * power * 2 + 1;
      const dir = c.sub(src).normalize();
      if (e === this.player) { if (e.hurt(dmg * (this.difficultyMul || 0.5), 'explosion', dir)) e.vel.addScaledVector(dir, impact * 12); }
      else if (e.hurt) { e.hurtTime = 0; e.hurt(dmg, null, dir); e.vel?.addScaledVector(dir, impact * 12); }
    };
    hurtOne(this.player);
    for (const e of this.entities) if (e instanceof Mob || e instanceof EndCrystal) hurtOne(e);
    for (const e of this.entities) if (e instanceof ItemEntity && e.pos.distanceTo(src) < power) e.remove = true;
  }

  getTile(x, y, z, type) {
    const k = `${x},${y},${z}`;
    let t = this.world.tiles.get(k);
    if (!t || t.type !== type) {
      t = type === 'chest' ? { type, items: new Array(27).fill(null) }
        : type === 'dispenser' ? { type, items: new Array(9).fill(null) }
        : type === 'hopper' ? { type, items: new Array(5).fill(null) }
        : type === 'brewing' ? { type, items: [null, null, null, null, null], fuel: 0, time: 0 }
          : { type, items: [null, null, null], burn: 0, burnMax: 0, cook: 0, xp: 0 };
      if (type === 'chest' && this.dim === 'overworld' && this.world.gen.stronghold && Math.abs(x - this.world.gen.stronghold.x) < 8 && Math.abs(z - this.world.gen.stronghold.z) < 8 && !this.world.tiles.has(k)) {
        t.items[3] = { id: I.ender_pearl, count: 2, dmg: 0 }; t.items[7] = { id: I.iron_ingot, count: 4, dmg: 0 }; t.items[12] = { id: I.bread, count: 3, dmg: 0 }; t.items[20] = { id: I.blaze_rod, count: 1, dmg: 0 };
      }
      if (type === 'chest' && !this.world.tiles.has(k) && (this.world.getMeta(x, y, z) & 4)) this.fillLoot(t.items, BLOCKS[this.world.getBlock(x, y - 1, z)]?.name);
      this.world.tiles.set(k, t);
    }
    return t;
  }

  // ---------------------------------------------------------------- redstone helpers
  toggleDoor(x, y, z, want) {
    const w = this.world;
    const m = w.getMeta(x, y, z);
    const id = w.getBlock(x, y, z);
    const by = m & 4 ? y - 1 : y;
    const bm = w.getMeta(x, by, z);
    const open = want ?? !(bm & 8);
    if (open === !!(bm & 8)) return;
    const nm = ((open ? (bm + 1) : (bm + 3)) & 3) | (open ? 8 : 0);
    w.setBlock(x, by, z, id, nm, { noUpdate: true, redstone: true });
    if (w.getBlock(x, by + 1, z) === id) w.setBlock(x, by + 1, z, id, nm | 4, { noUpdate: true, redstone: true });
    this.sfx('door', x, y, z);
  }
  igniteTNT(x, y, z) { this.world.setBlock(x, y, z, 0); this.addEntity(new PrimedTNT(this, x, y, z)); this.sfx('fuse', x, y, z); }
  playNote(x, y, z, m) {
    const below = BLOCKS[this.world.getBlock(x, y - 1, z)]?.name ?? '';
    const inst = /stone|ore|brick|obsidian|netherrack/.test(below) ? 'bass' : /sand|gravel/.test(below) ? 'snare' : /glass/.test(below) ? 'click' : /gold/.test(below) ? 'bell' : /wool/.test(below) ? 'guitar' : 'harp';
    playSound(`note:${inst}:${m}`);
    this.particles.spawn(x + 0.5, y + 1.2, z + 0.5, new THREE.Color().setHSL(m / 24, 1, 0.5), new THREE.Vector3(0, 1, 0), 0.8, 0.15, 0);
  }
  dispense(x, y, z, dropper) {
    const w = this.world;
    const t = this.getTile(x, y, z, 'dispenser');
    const slots = t.items.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (!slots.length) { this.sfx('click'); return; }
    const i = slots[Math.floor(Math.random() * slots.length)];
    const s = t.items[i];
    const [dx, dy, dz] = DIRS6[w.getMeta(x, y, z) & 7];
    const fx = x + dx, fy = y + dy, fz = z + dz;
    const take = () => { s.count--; if (s.count <= 0) t.items[i] = null; };
    const it = ITEMS[s.id];
    // dropper pushes into a container in front, otherwise drops
    const front = w.tiles.get(`${fx},${fy},${fz}`);
    if (dropper && front?.items) { const free = front.items.findIndex((d) => !d || (d.id === s.id && d.count < it.stack)); if (free >= 0) { if (front.items[free]) front.items[free].count++; else front.items[free] = { ...copyStack(s, 1) }; take(); } return; }
    const pos = new THREE.Vector3(x + 0.5 + dx * 0.7, y + 0.5 + dy * 0.7, z + 0.5 + dz * 0.7);
    const dir = new THREE.Vector3(dx, dy + 0.1, dz);
    if (!dropper) {
      const throwKind = { arrow: 'arrow', snowball: 'snowball', egg: 'egg', splash_potion: 'splash', experience_bottle: 'xp_bottle' }[it.name];
      if (throwKind) { const pr = new Projectile(this, throwKind, pos, dir.multiplyScalar(throwKind === 'arrow' ? 40 : 18), null); if (throwKind === 'splash') pr.potion = s.data?.potion; this.addEntity(pr); take(); this.sfx('bow'); return; }
      if (it.name === 'fire_charge' || it.name === 'flint_and_steel') { if (!w.getBlock(fx, fy, fz)) w.setBlock(fx, fy, fz, B.fire); if (it.name === 'fire_charge') take(); return; }
      if (it.name === 'water_bucket' || it.name === 'lava_bucket') { if (!w.getBlock(fx, fy, fz) || BLOCKS[w.getBlock(fx, fy, fz)].replaceable) { w.setBlock(fx, fy, fz, it.name === 'water_bucket' ? B.water : B.lava); t.items[i] = { id: I.bucket, count: 1, dmg: 0 }; } return; }
      if (it.name === 'bucket') { const fid = w.getBlock(fx, fy, fz); if ((fid === B.water || fid === B.lava) && w.getMeta(fx, fy, fz) === 0) { w.setBlock(fx, fy, fz, 0); t.items[i] = { id: fid === B.water ? I.water_bucket : I.lava_bucket, count: 1, dmg: 0 }; } return; }
      if (it.name === 'bone_meal') { const cid = w.getBlock(fx, fy, fz); if (cid >= B.wheat_0 && cid <= B.potatoes_7 && (cid - B.wheat_0) % 8 < 7) { w.setBlock(fx, fy, fz, Math.min(cid + 3, cid - ((cid - B.wheat_0) % 8) + 7)); take(); } return; }
      if (it.name === 'tnt') { take(); this.addEntity(new PrimedTNT(this, fx, fy, fz)); return; }
      if (it.kind === 'armor') { const p = this.player; if (p.pos.distanceTo(new THREE.Vector3(fx + 0.5, fy, fz + 0.5)) < 1.5 && !p.armor[it.slot]) { p.armor[it.slot] = copyStack(s, 1); take(); this.ui.refresh(); return; } }
    }
    const e = new ItemEntity(this, pos.x, pos.y, pos.z, copyStack(s, 1));
    e.vel.copy(dir.multiplyScalar(6));
    this.addEntity(e);
    take();
    this.sfx('click');
  }

  countBookshelves(x, y, z) {
    let n = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 1; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
      if (this.world.getBlock(x + dx, y + dy, z + dz) === B.bookshelf && !this.world.getBlock(x + Math.sign(dx), y + dy, z + Math.sign(dz))) n++;
    }
    return Math.min(15, n);
  }
  fillLoot(items, below = '') {
    const extra = [];
    if (this.dim === 'end') extra.push(['elytra', 1, 1, 0.5], ['diamond', 2, 7, 0.6], ['emerald', 2, 6, 0.5], ['diamond_chestplate', 1, 1, 0.25], ['shulker_shell', 1, 2, 0.4]);
    if (/sandstone|terracotta/.test(below)) extra.push(['gold_ingot', 2, 7, 0.6], ['diamond', 1, 3, 0.25], ['emerald', 1, 3, 0.3], ['bone', 4, 6, 0.6], ['golden_apple', 1, 1, 0.2], ['enchanted_golden_apple', 1, 1, 0.03]);
    if (/blackstone|gold/.test(below)) extra.push(['gold_block', 1, 2, 0.4], ['netherite_scrap', 1, 2, 0.25], ['ancient_debris', 1, 1, 0.15], ['gold_ingot', 4, 9, 0.7]);
    if (/nether_brick|soul/.test(below)) extra.push(['nether_wart', 3, 7, 0.6], ['gold_ingot', 1, 3, 0.5], ['diamond', 1, 2, 0.2], ['saddle', 1, 1, 0.3]);
    if (/obsidian|netherrack|magma|stone_brick/.test(below)) extra.push(['obsidian', 1, 2, 0.4], ['flint_and_steel', 1, 1, 0.4], ['gold_ingot', 2, 6, 0.6], ['golden_carrot', 4, 8, 0.3]);
    for (const [name, a, b, pr] of extra) if (I[name] != null && Math.random() < pr) { let s = Math.floor(Math.random() * 27); for (let n = 0; n < 30 && items[s]; n++) s = Math.floor(Math.random() * 27); items[s] = { id: I[name], count: a + Math.floor(Math.random() * (b - a + 1)), dmg: 0 }; }
    const table = [
      ['bread', 1, 4, 0.6], ['wheat', 2, 6, 0.4], ['iron_ingot', 1, 4, 0.45], ['gold_ingot', 1, 3, 0.3], ['diamond', 1, 2, 0.1],
      ['emerald', 1, 3, 0.15], ['coal', 3, 10, 0.5], ['bone', 2, 6, 0.4], ['rotten_flesh', 1, 6, 0.4], ['string', 1, 4, 0.3],
      ['gunpowder', 1, 4, 0.3], ['redstone', 2, 6, 0.3], ['apple', 1, 3, 0.4], ['saddle', 1, 1, 0.15], ['golden_apple', 1, 1, 0.05],
      ['iron_pickaxe', 1, 1, 0.08], ['bucket', 1, 1, 0.15], ['experience_bottle', 1, 4, 0.15], ['name_tag', 1, 1, 0.12], ['nether_wart', 1, 3, 0.05], ['wheat_seeds', 2, 5, 0.4], ['book', 1, 3, 0.2], ['ender_pearl', 1, 1, 0.08],
    ];
    if (Math.random() < 0.35) { const keys = Object.keys(ENCHANTS); const k = keys[Math.floor(Math.random() * keys.length)]; items[Math.floor(Math.random() * 27)] = { id: I.enchanted_book, count: 1, dmg: 0, data: { ench: { [k]: 1 + Math.floor(Math.random() * ENCHANTS[k].max) } } }; }
    for (const [name, a, b, p] of table) {
      if (Math.random() > p) continue;
      let slot = Math.floor(Math.random() * 27); let tries = 0;
      while (items[slot] && tries++ < 30) slot = Math.floor(Math.random() * 27);
      items[slot] = { id: I[name], count: a + Math.floor(Math.random() * (b - a + 1)), dmg: 0 };
    }
  }

  // Mob spawners from dungeons and villages populating themselves
  structureTick() {
    const p = this.player, w = this.world;
    if (!p) return;
    // structure inhabitants spawn the first time the player comes close
    for (const s of w.gen.structuresNear?.(p.pos.x, p.pos.z) ?? []) {
      if (!s.info || this.structuresSpawned.has(`${this.dim}:${s.x},${s.z}`) || Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 48) continue;
      this.structuresSpawned.add(`${this.dim}:${s.x},${s.z}`);
      for (const k of ['spawn', 'spawn2', 'spawn3']) { const sp = s.info[k]; if (sp && MOB_INFO[sp[0]]) this.spawnMob(sp[0], sp[1], sp[2], sp[3]); }
    }
    // spawners
    for (const k of w.spawners) {
      const [x, y, z] = k.split(',').map(Number);
      if (w.getBlock(x, y, z) !== B.spawner) { w.spawners.delete(k); continue; }
      const d = Math.hypot(x + 0.5 - p.pos.x, y - p.pos.y, z + 0.5 - p.pos.z);
      if (d > 16) continue;
      this.particles.spawn(x + Math.random(), y + Math.random(), z + Math.random(), new THREE.Color(0xff7a20), new THREE.Vector3(0, 0.6, 0), 0.5, 0.06, 0);
      if (this.difficulty === 'peaceful' || Math.random() > 0.08) continue;
      const near = this.entities.filter((e) => e instanceof Mob && !e.dead && e.pos.distanceTo(new THREE.Vector3(x, y, z)) < 9).length;
      if (near >= 5) continue;
      const type = ['zombie', 'skeleton', 'cave_spider', 'blaze'][(w.getMeta(x, y, z) || 1) - 1] ?? 'zombie';
      for (let i = 0; i < 4; i++) {
        const sx = x + Math.floor((Math.random() - 0.5) * 7), sz = z + Math.floor((Math.random() - 0.5) * 7);
        if (!w.getBlock(sx, y, sz) && !w.getBlock(sx, y + 1, sz) && SOLID[w.getBlock(sx, y - 1, sz)]) { this.spawnMob(type, sx + 0.5, y, sz + 0.5); this.particles.burst(sx + 0.5, y + 0.5, sz + 0.5, 0x606060); break; }
      }
    }
    // villages: populate the first time the player comes close
    for (const v of w.gen.villagesNear(p.pos.x, p.pos.z)) {
      if (this.villagesSpawned.has(v.id) || Math.hypot(v.x - p.pos.x, v.z - p.pos.z) > 70) continue;
      if (!w.isLoaded(v.x, v.z)) continue;
      this.villagesSpawned.add(v.id);
      const count = 3 + v.buildings.filter((b) => b.kind !== 'farm').length;
      for (let i = 0; i < count; i++) {
        const b = v.buildings[i % v.buildings.length];
        const sx = Math.floor((b.x + v.x) / 2) + (i % 3) - 1, sz = Math.floor((b.z + v.z) / 2);
        const sy = w.surfaceY(sx, sz);
        if (sy > 0) { const e = this.spawnMob('villager', sx + 0.5, sy + 1, sz + 0.5, { baby: Math.random() < 0.2 }); if (e) { e.home = v.id; e.nitwit = Math.random() < 0.05; } }
      }
      const gy = w.surfaceY(v.x + 4, v.z + 4);
      if (gy > 0) { const e = this.spawnMob('iron_golem', v.x + 4.5, gy + 1, v.z + 4.5); if (e) e.home = v.id; }
      this.achieve('¡Una aldea!');
    }
  }

  tickFurnaces() {
    for (const [k, t] of this.world.tiles) {
      if (t.type === 'brewing') { this.tickBrewing(k, t); continue; }
      if (t.type !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!this.world.isLoaded(x, z)) continue;
      const kind = t.kind ?? 'furnace';
      const speed = kind === 'furnace' ? 1 : 2;
      const [inp, fuel, out] = t.items;
      let resultName = inp ? SMELTING[ITEMS[inp.id].name] : null;
      if (resultName && kind === 'smoker' && !SMOKER_OK.has(ITEMS[inp.id].name)) resultName = null;
      if (resultName && kind === 'blast' && !/(_ore|raw_|ancient_debris)/.test(ITEMS[inp.id].name)) resultName = null;
      const resId = resultName ? I[resultName] : null;
      const canCook = resId != null && (!out || (out.id === resId && out.count < 64));
      let changed = false;
      if (t.burn > 0) t.burn -= speed;
      if (t.burn <= 0 && canCook && fuel && fuelTime(fuel.id)) {
        t.burn = t.burnMax = fuelTime(fuel.id);
        if (ITEMS[fuel.id].name === 'lava_bucket') t.items[1] = { id: I.bucket, count: 1, dmg: 0 };
        else { fuel.count--; if (fuel.count <= 0) t.items[1] = null; }
        changed = true;
      }
      if (t.burn > 0 && canCook) {
        t.cook += speed / TPS;
        if (t.cook >= 10) {
          t.cook = 0;
          inp.count--; if (inp.count <= 0) t.items[0] = null;
          if (out) out.count++; else t.items[2] = { id: resId, count: 1, dmg: 0 };
          t.xp = (t.xp ?? 0) + 0.35;
          changed = true;
          if (resultName === 'iron_ingot') this.achieve('Adquirir hardware');
        }
      } else if (t.cook > 0) t.cook = Math.max(0, t.cook - 2 / TPS);
      const lit = t.burn > 0;
      const id = this.world.getBlock(x, y, z);
      const pair = { furnace: [B.furnace, B.lit_furnace], smoker: [B.smoker, B.lit_smoker], blast: [B.blast_furnace, B.lit_blast_furnace] }[kind];
      if (lit && id === pair[0]) this.world.setBlock(x, y, z, pair[1], this.world.getMeta(x, y, z), { keepTile: true, noUpdate: true });
      else if (!lit && id === pair[1]) this.world.setBlock(x, y, z, pair[0], this.world.getMeta(x, y, z), { keepTile: true, noUpdate: true });
      if ((changed || lit) && this.ui.screen === 'furnace' && this.ui.screenData === t && (this.world.tickCount % 4 === 0 || changed)) this.ui.renderScreen();
    }
  }

  // brewing stand: slots 0-2 bottles, 3 ingredient, 4 blaze powder (fuel)
  tickBrewing(k, t) {
    const ing = t.items[3];
    if (!t.fuel && t.items[4] && ITEMS[t.items[4].id].name === 'blaze_powder') { t.fuel = 20; t.items[4].count--; if (t.items[4].count <= 0) t.items[4] = null; }
    const ingName = ing ? ITEMS[ing.id].name : null;
    const results = [0, 1, 2].map((i) => {
      const s = t.items[i];
      if (!s || !ingName) return null;
      const it = ITEMS[s.id];
      if (it.kind !== 'potion') return null;
      if (ingName === 'gunpowder') return it.splash ? null : { id: I.splash_potion, data: { potion: s.data?.potion ?? 'water' } };
      const r = brew(s.data?.potion ?? 'water', ingName);
      return r ? { id: s.id, data: { potion: r } } : null;
    });
    const can = (t.fuel ?? 0) > 0 && results.some(Boolean);
    if (!can) { t.time = 0; return; }
    t.time = (t.time ?? 0) + 1 / TPS;
    if (t.time >= 20) {
      t.time = 0;
      results.forEach((r, i) => { if (r) t.items[i] = { id: r.id, count: 1, dmg: 0, data: r.data }; });
      ing.count--; if (ing.count <= 0) t.items[3] = null;
      t.fuel--;
      this.sfx('fizz');
    }
    if (this.ui.screen === 'brewing' && this.ui.screenData === t && this.world.tickCount % 4 === 0) this.ui.renderScreen();
  }


  // ---------------------------------------------------------------- mob spawning
  spawnTick() {
    const p = this.player;
    const w = this.world;
    let hostile = 0, passive = 0;
    for (const e of this.entities) {
      if (!(e instanceof Mob) || e.dead) continue;
      const d = e.pos.distanceTo(p.pos);
      if (e.type === 'ender_dragon') continue;
      if (d > 128 || (e.hostile && this.difficulty === 'peaceful')) { e.remove = true; if (e.home) this.villagesSpawned.delete(e.home); continue; }
      if (e.hostile && d > 48 && Math.random() < 0.02) { e.remove = true; continue; }
      if (e.hostile) hostile++; else passive++;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 40;
      const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
      if (!w.isLoaded(x, z)) continue;
      const surf = w.surfaceY(x, z);
      if (surf < 0) continue;
      if (this.dim === 'overworld') {
        const biome = w.biomeAt(x, z);
        const ground = w.getBlock(x, surf, z);
        const sky = (w.getLight(x, surf + 1, z) >> 4);
        // water creatures
        const wet = w.getBlock(x, surf, z) === B.water || w.getBlock(x, surf + 1, z) === B.water;
        if (passive < 18 && Math.random() < 0.12) {
          const wy = (() => { for (let yy = 70; yy > 30; yy--) if (w.getBlock(x, yy, z) === B.water && w.getBlock(x, yy - 3, z) === B.water) return yy - 2; return -1; })();
          if (wy > 0) {
            const warm = biome === 20, cold = biome === 21 || biome === 7 || biome === 5;
            const r2 = Math.random();
            const type = warm ? (r2 < 0.5 ? 'tropical_fish' : r2 < 0.7 ? 'dolphin' : 'squid') : cold ? (r2 < 0.6 ? 'salmon' : 'squid') : (r2 < 0.45 ? 'cod' : r2 < 0.75 ? 'squid' : r2 < 0.85 ? 'dolphin' : r2 < 0.9 && hostile < 16 ? 'abyssal_eel' : 'cod');
            const n = type.endsWith('fish') || type === 'cod' || type === 'salmon' ? 3 : 1;
            for (let i = 0; i < n; i++) this.spawnMob(type, x + 0.5 + i * 0.3, wy, z + 0.5);
            continue;
          }
        }
        void wet;
        if ((ground === B.grass_block || ground === B.sand || ground === B.snowy_grass || ground === B.mycelium || ground === B.mud) && passive < 12 && Math.random() < 0.15 && sky >= 9) {
          const pools = {
            5: ['wolf', 'sheep', 'fox', 'rabbit', 'fox'], 7: ['rabbit', 'fox', 'polar_bear'], 19: ['polar_bear', 'rabbit'], 9: ['chicken', 'parrot', 'panda', 'parrot', 'pig'],
            6: ['rabbit'], 17: [], 3: ['pig', 'cow', 'sheep', 'chicken', 'wolf', 'bee'], 14: ['sheep', 'cow'], 15: ['bee', 'rabbit', 'sheep', 'pig'],
            8: ['goat', 'llama', 'sheep'], 10: ['llama', 'horse', 'cow'], 11: ['frog', 'cow'], 18: ['frog', 'frog', 'cow'], 16: ['cow'], 1: ['turtle'],
          };
          const pool = pools[biome] ?? ['pig', 'cow', 'sheep', 'chicken', 'horse', 'cow', 'sheep', 'bee', 'cat'];
          if (!pool.length) continue;
          let type = pool[(Math.random() * pool.length) | 0];
          if (Math.random() < 0.04 && (biome === 2 || biome === 10)) type = 'villager';
          const n = type === 'villager' ? 2 : 2 + ((Math.random() * 3) | 0);
          for (let i = 0; i < n; i++) {
            const ox = x + ((Math.random() * 5) | 0) - 2, oz = z + ((Math.random() * 5) | 0) - 2;
            const sy = w.surfaceY(ox, oz);
            if (sy > 0 && [B.grass_block, B.sand, B.snowy_grass, B.mycelium, B.mud].includes(w.getBlock(ox, sy, oz))) {
              const colors = ['white', 'white', 'white', 'white', 'white', 'gray', 'light_gray', 'black', 'brown', 'pink'];
              this.spawnMob(type, ox + 0.5, sy + 1, oz + 0.5, { woolColor: colors[(Math.random() * colors.length) | 0], baby: Math.random() < 0.08 });
            }
          }
          continue;
        }
        if (this.difficulty === 'peaceful' || hostile >= 16) continue;
        if (this.difficulty !== 'peaceful' && hostile < 16 && Math.random() < 0.05 && this.daylightLevel < 0.5) {
          for (let yy = 70; yy > 40; yy--) if (w.getBlock(x, yy, z) === B.water && w.getBlock(x, yy - 1, z) === B.water) { this.spawnMob('drowned', x + 0.5, yy - 1, z + 0.5); break; }
        }
        // night wraiths hunt players who haven't slept for three nights
        if (this.daysAwake >= 3 && this.daylightLevel < 0.4 && hostile < 16 && Math.random() < 0.04 && p.pos.y > 50 && this.difficulty !== 'peaceful') { this.spawnMob('night_wraith', p.pos.x + (Math.random() - 0.5) * 20, p.pos.y + 20, p.pos.z + (Math.random() - 0.5) * 20); }
        // hostile: random y below surface in darkness
        const y = Math.random() < 0.5 ? surf + 1 : 5 + ((Math.random() * Math.max(1, surf - 5)) | 0);
        if (!SOLID[w.getBlock(x, y - 1, z)] || w.getBlock(x, y, z) || w.getBlock(x, y + 1, z)) continue;
        const l = w.getLight(x, y, z);
        const eff = Math.max((l >> 4) * this.daylightLevel, l & 15);
        if (eff > 7) continue;
        const r = Math.random();
        let type = y < 40 && r < 0.05 ? 'slime' : r < 0.03 ? 'zombie_villager' : r < 0.3 ? 'zombie' : r < 0.55 ? 'skeleton' : r < 0.77 ? 'creeper' : r < 0.94 ? 'spider' : r < 0.985 ? 'enderman' : 'witch';
        const hb = w.biomeAt(x, z);
        if (type === 'zombie' && hb === 6 && y >= surf) type = 'husk';
        if (type === 'skeleton' && (hb === 7 || hb === 19 || hb === 21) && y >= surf) type = 'stray';
        if (type === 'zombie' && w.getBlock(x, y, z) === B.water) type = 'drowned';
        if (y < 30 && Math.random() < 0.04) type = 'silverfish';
        if (hb === 16) continue; // mushroom islands are safe
        if (type === 'enderman' && (w.getBlock(x, y + 2, z))) continue;
        this.spawnMob(type, x + 0.5, y, z + 0.5);
      } else if (this.dim === 'nether') {
        if (this.difficulty === 'peaceful' || hostile >= 14) continue;
        for (let y = 100; y > 32; y--) {
          if (SOLID[w.getBlock(x, y - 1, z)] && !w.getBlock(x, y, z) && !w.getBlock(x, y + 1, z)) {
            const r = Math.random();
            const open = !w.getBlock(x, y + 4, z) && !w.getBlock(x + 2, y + 2, z) && !w.getBlock(x - 2, y + 2, z);
            const fortress = w.getBlock(x, y - 1, z) === B.nether_bricks;
            const nbiome = w.biomeAt(x, z);
            const onLava = w.getBlock(x, y - 1, z) === B.lava;
            let type = fortress ? (r < 0.45 ? 'blaze' : r < 0.85 ? 'charred_skeleton' : 'magma_blob') : r < 0.12 && open ? 'ghast' : r < 0.18 ? 'magma_blob' : 'zombified_piglin';
            if (!fortress && nbiome === 22) type = r < 0.4 ? 'hellboar' : r < 0.8 ? 'ash_goblin' : 'zombified_piglin';
            if (!fortress && nbiome === 23) type = r < 0.85 ? 'enderman' : 'lava_wader';
            if (!fortress && nbiome === 24) type = r < 0.5 ? 'skeleton' : r < 0.8 ? 'ghast' : 'enderman';
            if (!fortress && nbiome === 25) type = r < 0.7 ? 'magma_blob' : 'ghast';
            if (!fortress && nbiome === 12 && r > 0.85) type = 'ash_goblin';
            if (onLava) type = 'lava_wader';
            this.spawnMob(type, x + 0.5, type === 'ghast' ? y + 3 : y, z + 0.5);
            break;
          }
        }
      } else if (this.dim === 'end') {
        if (this.difficulty === 'peaceful' || hostile >= 8) continue;
        if (w.getBlock(x, surf, z) === B.end_stone) this.spawnMob('enderman', x + 0.5, surf + 1, z + 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- chunks
  loadChunksAround(sync = false) {
    const p = this.player ?? { pos: new THREE.Vector3(this.panorama.x, 0, this.panorama.z) };
    const rd = this.player ? this.options.renderDistance : 5;
    const pcx = Math.floor(p.pos.x / CS), pcz = Math.floor(p.pos.z / CS);
    const need = [];
    for (let dz = -rd; dz <= rd; dz++) for (let dx = -rd; dx <= rd; dx++) {
      if (dx * dx + dz * dz > rd * rd + 1) continue;
      if (!this.world.getChunk(pcx + dx, pcz + dz)) need.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
    }
    need.sort((a, b) => a[2] - b[2]);
    const t0 = performance.now();
    for (const [cx, cz] of need) {
      this.world.ensureChunk(cx, cz);
      if (!sync && performance.now() - t0 > 8) break;
      if (sync && performance.now() - t0 > 4000) break;
    }
    if (sync) { for (let i = 0; i < 8; i++) this.world.processDirty(p.pos.x, p.pos.z, 1000); }
    // unload
    for (const c of [...this.world.chunks.values()]) {
      if (Math.abs(c.cx - pcx) > rd + 2 || Math.abs(c.cz - pcz) > rd + 2) this.world.unloadChunk(c);
    }
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    this.canvas.addEventListener('mousedown', (e) => {
      unlockAudioOnce();
      if (this.touch) return; // touches are handled by TouchControls
      if (!this.running || this.ui.isOpen()) return;
      if (!this.locked) { this.lockPointer(); return; }
      this.onMouse(e.button, true);
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.player || this.ui.isOpen()) return;
      const s = 0.0022 * this.options.sensitivity / 100;
      this.player.yaw -= e.movementX * s;
      this.player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.player.pitch - e.movementY * s));
    });
    document.addEventListener('wheel', (e) => {
      if (!this.running || this.ui.isOpen() || !this.player) return;
      const p = this.player;
      p.selected = (p.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      p.using = null;
      this.ui.refresh(); this.ui.showHeldName();
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.running && !this.ui.isOpen() && !this.ignoreUnlock) this.ui.pause();
      this.ignoreUnlock = false;
    });
  }
  itemDef(id) { return ITEMS[id]; }
  setTouchMode(on) {
    if (on) this.mouseMoves = 0;
    if (on === this.touch) return;
    this.touch = on;
    document.body.classList.toggle('touch', on);
    if (on) { if (document.pointerLockElement) { this.ignoreUnlock = true; document.exitPointerLock(); } if (this.running && !this.ui.isOpen()) this.locked = true; }
    else if (!document.pointerLockElement) this.locked = false; // next click requests real pointer lock
    if (this.ui.screen) this.ui.renderScreen();
  }
  lockPointer() {
    if (this.touch) { this.locked = true; this.requestFullscreen(); return; }
    try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* not supported */ } }
  requestFullscreen() {
    if (this.fsTried || document.fullscreenElement) return;
    this.fsTried = true;
    const el = document.documentElement;
    try { const r = el.requestFullscreen?.({ navigationUI: 'hide' }); r?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); } catch { /* not supported */ }
  }
  releasePointer() { if (this.touch) { this.locked = false; return; } if (document.pointerLockElement) { this.ignoreUnlock = true; document.exitPointerLock(); } }

  onMouse(button, down) {
    const p = this.player;
    if (!p || p.dead) return;
    if (button === 0) {
      this.mouse.left = down;
      if (down) { p.attack(); if (p.mode === 'creative') p.placeCooldown = 0; }
    } else if (button === 2) {
      this.mouse.right = down;
      if (down) { p.placeCooldown = 0; p.use(); }
    } else if (button === 1 && down) {
      const h = p.pick();
      if (h?.block) {
        let id = h.block.id;
        if (id === B.lit_furnace) id = B.furnace;
        if (!ITEMS[id]) return;
        const idx = p.inventory.findIndex((s, i) => i < 9 && s && s.id === id);
        if (idx >= 0) p.selected = idx;
        else if (p.mode === 'creative') { const empty = p.inventory.findIndex((s, i) => i < 9 && !s); if (empty >= 0) p.selected = empty; p.inventory[p.selected] = { id, count: 1, dmg: 0 }; }
        this.ui.refresh(); this.ui.showHeldName();
      }
    }
  }

  onKey(e, down) {
    const code = e.code;
    if (['F1', 'F2', 'F3', 'F5', 'Tab', 'Space'].includes(code) && this.running) e.preventDefault();
    if (!this.running || !this.player) return;
    const ui = this.ui;
    const p = this.player;
    if (ui.screen === 'chat') return;
    if (down) {
      if (ui.isOpen()) {
        if (code === 'Escape' || (code === 'KeyE' && !['pause', 'options', 'death'].includes(ui.screen) && document.activeElement?.tagName !== 'INPUT')) {
          if (ui.screen === 'death') return;
          if (ui.screen === 'options') return;
          ui.close();
          return;
        }
        if (code.startsWith('Digit') && ui.slotDefs) { const n = Number(code.slice(5)) - 1; if (n >= 0 && n < 9) ui.hotbarSwap(n); }
        if (code === 'KeyQ') ui.dropHovered(e.ctrlKey);
        return;
      }
      if (code === 'Escape') { ui.pause(); return; }
      if (code === 'KeyE') { ui.open(p.mode === 'creative' ? 'creative' : 'inventory'); return; }
      if (code === 'KeyT' || code === 'Enter') { e.preventDefault(); ui.openChat(''); return; }
      if (code === 'Slash') { e.preventDefault(); ui.openChat('/'); return; }
      if (code === 'F3') { this.showDebug = !this.showDebug; return; }
      if (code === 'F1') { this.hideHud = !this.hideHud; this.hud(!this.hideHud); return; }
      if (code === 'F2') { this.screenshot(); return; }
      if (code === 'F5') { this.thirdPerson = (this.thirdPerson + 1) % 3; return; }
      if (code.startsWith('Digit')) { const n = Number(code.slice(5)) - 1; if (n >= 0 && n < 9) { p.selected = n; p.using = null; ui.refresh(); ui.showHeldName(); } }
      if (code === 'KeyQ') {
        const s = p.heldItem();
        if (s) { const n = e.ctrlKey ? s.count : 1; this.dropStack(copyStack(s, n)); s.count -= n; if (s.count <= 0) p.inventory[p.selected] = null; ui.refresh(); }
      }
      if (code === 'Space' && !e.repeat) {
        const now = performance.now();
        if ((p.mode === 'creative') && now - (this.lastSpace ?? 0) < 300) { p.flying = !p.flying; p.vel.y = 0; }
        this.lastSpace = now;
      }
      if (code === 'KeyW' && !e.repeat) {
        const now = performance.now();
        if (now - (this.lastW ?? 0) < 300) this.keys.sprintTap = true;
        this.lastW = now;
      }
    }
    if (code === 'KeyW' && !down) this.keys.sprintTap = false;
    this.keys[code] = down;
  }

  input() {
    if (this.touchControls && this.touch) return this.touchControls.input();
    const k = this.keys;
    return {
      forward: k.KeyW, back: k.KeyS, left: k.KeyA, right: k.KeyD, jump: k.Space,
      sneak: k.ShiftLeft || k.ShiftRight, sprint: k.ControlLeft || k.sprintTap || k.ControlRight,
    };
  }

  hud(show) { $('#hud').classList.toggle('hidden', !show); }

  screenshot() {
    this.render();
    const a = document.createElement('a');
    a.download = `captura-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.href = this.canvas.toDataURL('image/png');
    a.click();
    this.chat('Captura de pantalla guardada.');
  }

  chat(msg) { this.ui.chat(msg); }
  achieve(name) {
    if (this.achievements.has(name)) return;
    this.achievements.add(name);
    const t = $('#toast');
    t.innerHTML = `<div class="toast-title">¡Logro obtenido!</div><div>${escapeHtml(name)}</div>`;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
    playSound('levelup');
  }
  sfx(name, x, y, z) {
    if (x != null && this.player) {
      const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
      if (d > 24) return;
      playSound(name, 1 - d / 24);
    } else playSound(name);
  }
  biomeName(x, z) { return BIOMES[this.world.biomeAt(x, z)]?.name ?? '?'; }

  onPlayerDeath() {
    playSound('hurt');
    this.mouse.left = this.mouse.right = false;
    if (this.meta?.hardcore) {
      this.ui.screen = 'death';
      this.releasePointer();
      const m = this.ui.menu(`<h1 class="death-title">¡Fin del juego!</h1><p>${escapeHtml(this.player.deathMessage)}</p><p>Estabas en modo extremo. El mundo pasa a modo espectador.</p><button class="mc-btn" id="h-spec">Espectar el mundo</button><button class="mc-btn" id="h-title">Pantalla de título</button>`, 'death-menu');
      m.querySelector('#h-spec').onclick = () => { this.player.respawn(); this.player.mode = 'spectator'; this.ui.screen = null; this.ui.root.classList.add('hidden'); this.lockPointer(); };
      m.querySelector('#h-title').onclick = () => this.quitToTitle();
      return;
    }
    this.ui.death(this.player.deathMessage, this.player.xpTotal);
  }

  respawn() {
    const p = this.player;
    p.respawn();
    if (this.dim !== 'overworld') this.enterDimension('overworld');
    const s = p.spawnPoint ?? this.worldSpawn ?? this.findSpawn();
    this.world.ensureChunk(s.x >> 4, s.z >> 4);
    let y = s.y;
    if (p.spawnPoint && this.world.getBlock(s.x, s.y - 1, s.z) !== B.bed) { this.chat('Tu cama ha desaparecido o está obstruida.'); p.spawnPoint = null; }
    if (!p.spawnPoint) y = this.world.surfaceY(s.x, s.z) + 1;
    p.pos.set(s.x + 0.5, y, s.z + 0.5);
    this.ui.refresh();
  }

  // ---------------------------------------------------------------- chat commands
  handleChat(msg) {
    if (!msg.startsWith('/')) { this.chat('<Jugador> ' + msg); return; }
    const [cmd, ...args] = msg.slice(1).split(/\s+/);
    const p = this.player;
    const needCheats = !['help', 'seed'].includes(cmd);
    if (needCheats && !this.cheats) { this.chat('No tienes permiso para usar comandos (trucos desactivados).'); return; }
    const num = (v, base) => (v?.startsWith('~') ? base + (Number(v.slice(1)) || 0) : Number(v));
    switch (cmd) {
      case 'help': this.chat('Comandos: /gamemode, /time, /tp, /give, /kill, /summon, /seed, /difficulty, /xp, /spawnpoint, /locate, /clear, /gamerule keepInventory, /setblock, /weather, /heal'); break;
      case 'gamemode': case 'gm': {
        const m = { survival: 'survival', s: 'survival', 0: 'survival', creative: 'creative', c: 'creative', 1: 'creative', spectator: 'spectator', sp: 'spectator', 3: 'spectator', adventure: 'survival', a: 'survival', 2: 'survival' }[args[0]];
        if (!m) { this.chat('Uso: /gamemode <survival|creative|spectator>'); break; }
        p.mode = m; if (m !== 'creative') p.flying = m === 'spectator';
        this.chat(`Modo de juego cambiado a ${{ survival: 'Supervivencia', creative: 'Creativo', spectator: 'Espectador' }[m]}`);
        this.ui.refresh(); break;
      }
      case 'time': {
        const v = args[1];
        const t = { day: 1000, noon: 6000, night: 13000, midnight: 18000, sunrise: 23000, sunset: 12000 }[v] ?? Number(v);
        if (args[0] === 'set' && !Number.isNaN(t)) { this.time = Math.floor(this.time / 24000) * 24000 + t; this.chat('Hora establecida en ' + t); }
        else if (args[0] === 'add' && !Number.isNaN(t)) { this.time += t; }
        else if (args[0] === 'query') this.chat('Hora: ' + Math.floor(this.time % 24000));
        else this.chat('Uso: /time set <day|night|noon|midnight|n>');
        break;
      }
      case 'tp': case 'teleport': {
        const x = num(args[0], p.pos.x), y = num(args[1], p.pos.y), z = num(args[2], p.pos.z);
        if ([x, y, z].some(Number.isNaN)) { this.chat('Uso: /tp <x> <y> <z>'); break; }
        p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.fallStart = null; this.chat(`Teletransportado a ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`); break;
      }
      case 'give': {
        const name = (args[0] ?? '').replace('minecraft:', '');
        const id = I[name];
        if (id == null) { this.chat('Objeto desconocido: ' + name); break; }
        const n = Math.max(1, Math.min(2304, Number(args[1]) || 1));
        const left = p.give(id, n);
        if (left) this.spawnItem(p.pos.x, p.pos.y + 1, p.pos.z, { id, count: left });
        this.chat(`Dado ${n} x ${ITEMS[id].display}`); break;
      }
      case 'kill': if (args[0] === '@e') { for (const e of this.entities) if (e instanceof Mob) e.remove = true; this.chat('Entidades eliminadas'); } else { p.mode = p.mode === 'survival' ? 'survival' : p.mode; p.health = 0; p.die('void'); } break;
      case 'summon': {
        const type = (args[0] ?? '').replace('minecraft:', '');
        if (!MOB_INFO[type]) { this.chat('Entidad desconocida. Disponibles: ' + Object.keys(MOB_INFO).join(', ')); break; }
        const d = p.lookDir();
        this.spawnMob(type, p.pos.x + d.x * 3, p.pos.y + 0.5, p.pos.z + d.z * 3);
        this.chat('Generado ' + type); break;
      }
      case 'seed': this.chat('Semilla: ' + this.seed); break;
      case 'difficulty': if (['peaceful', 'easy', 'normal', 'hard'].includes(args[0])) { this.options.difficulty = args[0]; this.saveOptions(); this.chat('Dificultad: ' + args[0]); } else this.chat('Uso: /difficulty <peaceful|easy|normal|hard>'); break;
      case 'xp': { const n = Number(args[0]) || 0; if (String(args[0]).endsWith('L')) for (let i = 0; i < parseInt(args[0], 10); i++) p.addXP(xpForLevelLocal(p.level)); else p.addXP(n); this.chat('Experiencia añadida'); break; }
      case 'spawnpoint': p.spawnPoint = { x: Math.floor(p.pos.x), y: Math.floor(p.pos.y), z: Math.floor(p.pos.z) }; this.worldSpawn = p.spawnPoint; this.chat('Punto de reaparición establecido'); break;
      case 'locate': {
        if (this.dim !== 'overworld') { this.chat('Solo en el mundo normal'); break; }
        if (args[0] === 'village' || args[0] === 'aldea') {
          const vs = this.world.gen.villagesNear(p.pos.x, p.pos.z, 3).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
          this.chat(vs.length ? `Aldea más cercana en ${vs[0].x}, ${vs[0].h}, ${vs[0].z}` : 'No hay aldeas cerca');
        } else { const s = this.world.gen.stronghold; this.chat(`Fortaleza más cercana en ${s.x}, ~, ${s.z} (usa /locate village para aldeas)`); }
        break;
      }
      case 'clear': p.inventory.fill(null); this.ui.refresh(); this.chat('Inventario vaciado'); break;
      case 'gamerule': if (args[0] === 'keepInventory') { this.keepInventory = args[1] === 'true'; this.chat('keepInventory = ' + this.keepInventory); } else this.chat('Reglas: keepInventory'); break;
      case 'setblock': {
        const x = num(args[0], Math.floor(p.pos.x)), y = num(args[1], Math.floor(p.pos.y)), z = num(args[2], Math.floor(p.pos.z));
        const id = B[(args[3] ?? '').replace('minecraft:', '')];
        if (id == null || [x, y, z].some(Number.isNaN)) { this.chat('Uso: /setblock x y z <bloque>'); break; }
        this.world.setBlock(Math.floor(x), Math.floor(y), Math.floor(z), id); break;
      }
      case 'heal': p.health = 20; p.food = 20; p.saturation = 5; this.ui.refresh(); break;
      case 'weather': {
        const v = args[0];
        if (!['clear', 'rain', 'thunder'].includes(v)) { this.chat('Uso: /weather <clear|rain|thunder> [segundos]'); break; }
        this.weather.target = v === 'clear' ? 0 : 1;
        this.weather.thunder = v === 'thunder';
        this.weather.timer = Number(args[1]) || 300 + Math.random() * 600;
        this.chat({ clear: 'El tiempo se ha despejado', rain: 'Empieza a llover', thunder: 'Se acerca una tormenta' }[v]);
        break;
      }
      case 'dimension': case 'dim': if (['overworld', 'nether', 'end'].includes(args[0])) this.travel(args[0]); else this.chat('Uso: /dimension <overworld|nether|end>'); break;
      default: this.chat('Comando desconocido. Escribe /help');
    }
  }

  // ---------------------------------------------------------------- per-frame updates
  updateSky(dt = 0) {
    const t = this.time % 24000;
    const angle = (t / 24000) * Math.PI * 2; // 0 = sunrise
    let bright = Math.sin(angle) * 2 + 0.5;
    bright = Math.max(0, Math.min(1, bright));
    const d = this.dim;
    const U = worldUniforms;
    const fog = U.fogColor.value;
    const wx = this.weather;
    // weather fades in/out smoothly
    wx.rain += Math.sign(wx.target - wx.rain) * Math.min(Math.abs(wx.target - wx.rain), dt * 0.2);
    const rain = d === 'overworld' ? wx.rain : 0;
    U.rain.value = rain;
    U.cameraPos.value.copy(this.camera.position);
    const sunUp = Math.sin(angle);
    if (d === 'overworld') {
      this.daylightLevel = (0.2 + 0.8 * bright) * (1 - 0.35 * rain) + this.flash * 0.8;
      U.daylight.value = this.daylightLevel;
      const day = new THREE.Color(0x9fc6ff), night = new THREE.Color(0x0a0c18), sunset = new THREE.Color(0xf0904a);
      const c = night.clone().lerp(day, bright);
      const s = Math.max(0, 1 - Math.abs(Math.sin(angle)) * 4);
      c.lerp(sunset, s * 0.35);
      const gray = new THREE.Color(0x6a7280).multiplyScalar(0.25 + 0.75 * bright);
      c.lerp(gray, rain * 0.75);
      if (this.flash > 0) c.lerp(new THREE.Color(0xe8e8ff), this.flash);
      const sky = new THREE.Color(0x4a82ff).lerp(new THREE.Color(0x060818), 1 - bright).lerp(gray, rain * 0.8);
      const p = this.player;
      if (p && p.headInWater) c.set(0x10308a);
      if (p && p.headInLava) c.set(0xc04000);
      fog.copy(c);
      U.skyColor.value.copy(sky);
      this.scene.background = c;
      // sun / moon light for shaders
      const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.28).normalize();
      const lightDir = sunUp > -0.05 ? sunDir : sunDir.clone().negate();
      U.sunDir.value.copy(lightDir.y < 0.06 ? lightDir.clone().setY(0.06).normalize() : lightDir);
      if (sunUp > -0.05) {
        const low = Math.max(0, 1 - sunUp * 3);
        U.sunColor.value.setRGB(1.0, 0.92 - low * 0.35, 0.8 - low * 0.55).multiplyScalar(Math.min(1, 0.25 + sunUp * 3) * (1 - rain * 0.8));
      } else U.sunColor.value.setRGB(0.32, 0.38, 0.55).multiplyScalar(Math.min(1, -sunUp * 3) * (1 - rain * 0.8));
      U.hasSky.value = 1;
      U.shadowStrength.value = 1 - rain * 0.7;
      const cam = this.camera.position;
      this.skyGroup.position.copy(cam);
      this.skyDome.position.copy(cam);
      this.skyDome.visible = true;
      const sx = Math.cos(angle) * 300, sy = Math.sin(angle) * 300, sz = 0.28 * 300;
      this.sun.position.set(sx, sy, sz); this.sun.lookAt(new THREE.Vector3());
      this.moon.position.set(-sx, -sy, -sz); this.moon.lookAt(new THREE.Vector3());
      this.sun.material.opacity = 1 - rain; this.moon.material.opacity = 1 - rain;
      this.stars.material.opacity = Math.max(0, 1 - bright * 1.5) * (1 - rain);
      this.skyGroup.visible = true;
      this.clouds.visible = this.options.clouds;
      this.clouds.position.set(cam.x, 130, cam.z);
      this.clouds.material.map.offset.set((cam.x / 2048 * 4) + this.time * 0.00002, cam.z / 2048 * 4);
      this.clouds.material.color.setScalar((0.3 + 0.7 * bright) * (1 - rain * 0.45));
      this.clouds.material.opacity = 0.8 + rain * 0.2;
      this.ambient.intensity = (0.25 + 0.5 * bright) * (1 - rain * 0.3);
      this.sunLight.intensity = (0.2 + 0.5 * bright) * (1 - rain * 0.5);
    } else {
      this.daylightLevel = 0;
      U.daylight.value = 0;
      U.hasSky.value = 0;
      U.sunColor.value.setRGB(0, 0, 0);
      const c = new THREE.Color(d === 'nether' ? 0x3a0d0d : 0x15101e);
      if (this.player?.headInLava) c.set(0xc04000);
      fog.copy(c);
      U.skyColor.value.copy(c);
      this.scene.background = c;
      this.skyDome.visible = false;
      this.skyGroup.visible = d === 'end';
      if (d === 'end') { this.skyGroup.position.copy(this.camera.position); this.sun.visible = this.moon.visible = false; this.stars.material.opacity = 0.5; }
      this.clouds.visible = false;
      this.ambient.intensity = 0.55; this.sunLight.intensity = 0.25;
    }
    if (d === 'overworld') { this.sun.visible = this.moon.visible = true; }
    U.ambient.value = this.player?.hasEffect?.('night_vision') ? Math.max(this.dimAmbient, 0.85) : this.dimAmbient;
    const rd = (this.player ? this.options.renderDistance : 5) * CS;
    const p = this.player;
    if (p && (p.headInWater || p.headInLava)) { U.fogNear.value = 0; U.fogFar.value = p.headInLava ? 3 : 18; }
    else if (d === 'nether') { U.fogNear.value = 10; U.fogFar.value = Math.min(rd, 72); }
    else { U.fogNear.value = rd * (0.55 - rain * 0.25); U.fogFar.value = rd * (0.95 - rain * 0.2); }
  }

  // ---------------------------------------------------------------- weather
  updateWeather(dt) {
    const wx = this.weather;
    if (!this.player || this.dim !== 'overworld') { this.precip.visible = false; return; }
    wx.timer -= dt;
    if (wx.timer <= 0 && !wx.forced) {
      // random weather cycle (roughly like the original: long clear spells, shorter storms)
      const raining = wx.target > 0;
      wx.target = raining ? 0 : 1;
      wx.thunder = !raining && Math.random() < 0.3;
      wx.timer = raining ? 300 + Math.random() * 600 : 120 + Math.random() * 240;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    if (wx.thunder && wx.rain > 0.7 && Math.random() < dt / 12) {
      this.flash = 1;
      setTimeout(() => this.sfx('thunder'), 300 + Math.random() * 1500);
      // lightning may ignite the ground near the player
      const p = this.player;
      const lx = Math.floor(p.pos.x + (Math.random() - 0.5) * 60), lz = Math.floor(p.pos.z + (Math.random() - 0.5) * 60);
      if (this.world.isLoaded(lx, lz)) { const ly = this.world.surfaceY(lx, lz); if (ly > 0 && !this.world.getBlock(lx, ly + 1, lz)) this.world.setBlock(lx, ly + 1, lz, B.fire); }
    }
    const rain = wx.rain;
    const pts = this.precip;
    pts.visible = rain > 0.02;
    if (!pts.visible) return;
    const p = this.player.pos;
    const biome = this.world.biomeAt(Math.floor(p.x), Math.floor(p.z));
    const snow = biome === 7 || p.y > 105 || (biome === 5 && p.y > 90);
    const desert = biome === 6 || biome === 10;
    if (desert) { pts.visible = false; return; }
    const pos = pts.geometry.attributes.position;
    const n = pos.count / 2;
    const active = Math.floor(n * rain);
    const speed = snow ? 3 : 22;
    for (let i = 0; i < n; i++) {
      let x = pos.getX(i * 2), y = pos.getY(i * 2), z = pos.getZ(i * 2);
      const far = Math.abs(x - p.x) > 18 || Math.abs(z - p.z) > 18;
      if (i >= active) { pos.setXYZ(i * 2, 0, -999, 0); pos.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      y -= speed * dt;
      if (snow) { x += Math.sin(this.time * 0.05 + i) * dt * 0.6; }
      const ground = this.dropGround[i] ?? -999;
      if (far || y < ground || y < p.y - 12) {
        x = p.x + (Math.random() - 0.5) * 36; z = p.z + (Math.random() - 0.5) * 36; y = p.y + 8 + Math.random() * 14;
        const gx = Math.floor(x), gz = Math.floor(z);
        let top = this.world.isLoaded(gx, gz) ? this.world.surfaceY(gx, gz) + 1 : -999;
        for (let yy = 127; yy > top; yy--) { const id = this.world.getBlock(gx, yy, gz); if (id && (OPAQUE[id] || BLOCKS[id].name.endsWith('_leaves'))) { top = yy + 1; break; } }
        this.dropGround[i] = top;
        if (top > y) y = -999;
        if (!snow && top > p.y - 6 && Math.random() < 0.02) this.particles.spawn(x, top + 0.05, z, new THREE.Color(0x9ab4e0), new THREE.Vector3(0, 1.5, 0), 0.2, 0.05, 8);
      }
      const len = snow ? 0.12 : 0.7;
      pos.setXYZ(i * 2, x, y, z);
      pos.setXYZ(i * 2 + 1, x + (snow ? 0.08 : 0.02), y + len, z);
    }
    pos.needsUpdate = true;
    pts.material.color.set(snow ? 0xffffff : 0x9ab8e8);
    pts.material.opacity = (snow ? 0.9 : 0.55) * Math.min(1, rain * 1.5);
    pts.material.linewidth = 1;
    this.rainSound = (this.rainSound ?? 0) - dt;
    if (!snow && this.rainSound <= 0) { this.rainSound = 0.35; this.sfx('rain'); }
  }

  updateCamera(dt) {
    const p = this.player;
    if (!p) {
      const pa = this.panorama;
      if (!pa) return;
      pa.a += dt * 0.05;
      this.camera.position.set(pa.x, pa.y, pa.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(-0.25, pa.a, 0);
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
      return;
    }
    const eye = p.eyePos();
    this.camera.rotation.order = 'YXZ';
    let bobX = 0, bobY = 0;
    if (this.options.bobbing && p.onGround && !p.flying) { const sp = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 5); bobX = Math.sin(p.bob * 2.2) * 0.04 * sp; bobY = Math.abs(Math.cos(p.bob * 2.2)) * 0.05 * sp; }
    if (this.thirdPerson) {
      const dir = p.lookDir();
      const back = this.thirdPerson === 1 ? -1 : 1;
      const dist = 4;
      const hit = this.world.raycast(eye, dir.clone().multiplyScalar(back), dist);
      const d = hit ? Math.max(0.5, hit.dist - 0.3) : dist;
      this.camera.position.copy(eye).addScaledVector(dir, back * d);
      this.camera.lookAt(eye);
    } else {
      this.camera.position.set(eye.x + bobX * Math.cos(p.yaw), eye.y + bobY, eye.z - bobX * Math.sin(p.yaw));
      this.camera.rotation.set(p.pitch, p.yaw, 0);
    }
    let fov = this.options.fov;
    if (p.sprinting) fov *= 1.12;
    if (p.flying && p.sprinting) fov *= 1.05;
    if (p.using?.kind === 'bow') fov *= 1 - Math.min(1, p.using.time) * 0.15;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();
    // third person body
    if (this.thirdPerson && !this.playerModel) { const m = buildModel('player'); this.playerModel = m; this.scene.add(m.root); }
    if (this.playerModel) {
      this.playerModel.root.visible = !!this.thirdPerson && p.mode !== 'spectator';
      this.playerModel.root.position.copy(p.pos);
      this.playerModel.root.rotation.y = p.yaw + Math.PI;
      const P = this.playerModel.parts;
      const sw = Math.sin(p.bob * 2.2) * Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 4);
      P.leg0.rotation.x = sw; P.leg1.rotation.x = -sw; P.arm0.rotation.x = -sw; P.arm1.rotation.x = sw - p.swing * 1.5;
      P.head.rotation.x = -p.pitch;
      if (p.sneaking) P.body.rotation.x = 0.4; else P.body.rotation.x = 0;
    }
  }

  updateHand(dt) {
    const p = this.player;
    this.hand.visible = !!p && !this.thirdPerson && p.mode !== 'spectator' && !this.hideHud;
    if (!this.hand.visible) return;
    const held = p.heldItem();
    const id = held?.id ?? 0;
    if (this.handItem !== id) {
      this.handItem = id;
      this.hand.clear();
      if (!id) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.8), new THREE.MeshLambertMaterial({ color: 0xd8a47f }));
        arm.position.set(0.45, -0.45, -0.5); arm.rotation.set(0.3, -0.25, 0.1);
        this.hand.add(arm);
      } else {
        const m = makeItemMesh(id, 0.55);
        const isBlock = id < 1024 && BLOCKS[id]?.render !== 'cross' && m.geometry.type === 'BoxGeometry';
        if (isBlock) { m.position.set(0.5, -0.45, -0.75); m.rotation.set(0.1, 0.8, 0); }
        else { m.position.set(0.5, -0.32, -0.6); m.rotation.set(0, -1.4, 0.4); }
        this.hand.add(m);
      }
    }
    const sw = p.swing;
    const phase = Math.sin((1 - sw) * Math.PI);
    let bob = 0, bobX = 0;
    if (this.options.bobbing && p.onGround) { const sp = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 5); bob = Math.abs(Math.cos(p.bob * 2.2)) * 0.03 * sp; bobX = Math.sin(p.bob * 2.2) * 0.03 * sp; }
    this.hand.position.set(bobX - phase * 0.25, -bob + phase * 0.12 - (p.using?.kind === 'eat' ? Math.abs(Math.sin(p.using.time * 20)) * 0.05 - 0.1 : 0), -phase * 0.15);
    this.hand.rotation.set(-phase * 0.8, phase * 0.4, 0);
    if (p.using?.kind === 'eat') this.hand.position.x -= 0.25;
    if (p.using?.kind === 'bow') { this.hand.position.x -= 0.25; this.hand.rotation.y = 0.4; this.hand.position.z += Math.min(1, p.using.time) * 0.1; }
    const l = this.lightAtPlayer();
    this.hand.traverse((o) => {
      if (!o.material?.color) return;
      if (!o.userData.base) o.userData.base = o.material.color.clone();
      o.material.color.copy(o.userData.base).multiplyScalar(l);
    });
  }

  lightAtPlayer() {
    const p = this.player;
    const l = this.world.getLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.6), Math.floor(p.pos.z));
    return Math.max(0.15, (l >> 4) / 15 * this.daylightLevel, (l & 15) / 15, this.dimAmbient);
  }

  updateSelection() {
    const p = this.player;
    const h = p && !p.dead && p.mode !== 'spectator' ? p.pick() : null;
    if (h?.block) {
      const b = BLOCKS[h.block.id];
      const { x, y, z } = h.block;
      let box;
      if (b.render === 'cross') box = [0.15, 0, 0.15, 0.85, 0.8, 0.85];
      else if (b.box || b.shape) {
        box = [1, 1, 1, 0, 0, 0];
        for (const bx of blockBoxesAt(this.world, b, x, y, z)) for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], bx[k] - [x, y, z][k]); box[k + 3] = Math.max(box[k + 3], bx[k + 3] - [x, y, z][k]); }
      } else box = [0, 0, 0, 1, 1, 1];
      this.selBox.visible = true;
      this.selBox.position.set(x + (box[0] + box[3]) / 2, y + (box[1] + box[4]) / 2, z + (box[2] + box[5]) / 2);
      this.selBox.scale.set(box[3] - box[0], box[4] - box[1], box[5] - box[2]);
    } else this.selBox.visible = false;
    if (p?.mining) {
      this.crack.visible = true;
      this.crack.position.set(p.mining.x + 0.5, p.mining.y + 0.5, p.mining.z + 0.5);
      this.crack.material = this.crackMats[Math.min(9, Math.floor(p.mining.progress * 10))];
    } else this.crack.visible = false;
  }

  pickupItems() {
    const p = this.player;
    if (p.dead || p.mode === 'spectator') return;
    for (const e of this.entities) {
      if (e instanceof ItemEntity && !e.remove && e.pickupDelay <= 0) {
        const dy = e.pos.y - p.pos.y;
        if (Math.abs(e.pos.x - p.pos.x) < 1.3 && Math.abs(e.pos.z - p.pos.z) < 1.3 && dy > -0.75 && dy < 2.3) {
          const left = p.give(e.stack.id, e.stack.count, e.stack.dmg, e.stack.data);
          if (left < e.stack.count) { playSound('pop'); if (ITEMS[e.stack.id].name.endsWith('_log')) this.achieve('¡Consigue madera!'); if (e.stack.id === I.diamond) this.achieve('¡Diamantes!'); }
          if (left <= 0) e.remove = true; else e.stack.count = left;
        }
      }
      if (e instanceof Projectile && e.kind === 'arrow' && e.stuck && e.pickup && e.pos.distanceTo(p.pos) < 1.8) {
        if (p.mode === 'survival') p.give(I.arrow, 1);
        e.remove = true; playSound('pop');
      }
    }
  }

  tick() {
    // fixed-rate world tick (20 tps)
    this.time++;
    if (this.time % 24000 === 0) this.daysAwake = (this.daysAwake ?? 0) + 1;
    this.world.tick();
    this.redstone?.update();
    if (this.world.tickCount % 2 === 0) this.tickFurnaces();
    if (this.world.tickCount % 20 === 0 && this.player && !this.player.dead) { this.spawnTick(); this.structureTick(); }
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25; // keep the simulation real-time on slow devices (physics is sub-stepped)
    this.frames++; this.fpsTime += dt;
    if (this.fpsTime >= 1) { this.fps = this.frames; this.frames = 0; this.fpsTime = 0; }
    if (!this.world) return;
    const paused = this.ui.screen === 'pause' || this.ui.screen === 'options';
    if (this.running && this.player && !paused) {
      const p = this.player;
      this.tickAcc += dt;
      let n = 0;
      while (this.tickAcc >= 1 / TPS && n < 5) { this.tick(); this.tickAcc -= 1 / TPS; n++; }
      if (n === 5) this.tickAcc = 0;
      const inp = this.ui.isOpen() ? {} : this.input();
      // sub-step physics for stability
      const steps = Math.ceil(dt / 0.02);
      for (let i = 0; i < steps; i++) p.update(dt / steps, inp);
      if (!this.ui.isOpen() && this.locked) {
        p.updateMining(dt, this.mouse.left);
        if (this.mouse.right && !p.using) { if (p.placeCooldown <= 0) p.use(); }
        p.updateUse(dt, this.mouse.right);
      } else { p.mining = null; if (p.using) p.updateUse(dt, false); }
      for (const e of this.entities) { e.update(dt); e.sync(); }
      if (p.vehicle && !p.vehicle.remove) p.pos.copy(p.vehicle.seat ? p.vehicle.seat() : p.vehicle.pos.clone().add(new THREE.Vector3(0, p.vehicle.h * 0.75, 0)));
      for (const e of this.entities) if (e.remove) { this.scene.remove(e.mesh); disposeTree(e.mesh); if (e instanceof Mob && e.dead) this.stats.kills++; }
      this.entities = this.entities.filter((e) => !e.remove);
      this.pickupItems();
      this.saveTimer += dt;
      if (this.saveTimer > 45) { this.saveTimer = 0; this.saveGame(); }
      if (Math.random() < dt * 4) this.ui.refresh();
      this.ui.updateHUD(dt);
    }
    if (this.touchControls) this.touchControls.show(this.touch && this.running && !!this.player && !this.ui.isOpen() && !this.hideHud);
    if (this.panorama) this.time = 3000;
    this.particles.update(dt);
    this.loadChunksAround();
    const pp = this.player?.pos ?? this.camera.position;
    this.world.processDirty(pp.x, pp.z, 6);
    this.updateCamera(dt);
    this.updateSky(dt);
    this.updateWeather(dt);
    if (this.player) { this.updateHand(dt); this.updateSelection(); }
    worldUniforms.time.value = now / 1000;
    this.render();
  }

  render() {
    const useShaders = this.options.shaders && this.pipeline && this.world;
    worldUniforms.shaderOn.value = useShaders ? 1 : 0;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    if (useShaders) {
      const center = this.player ? this.player.pos.clone() : this.camera.position.clone();
      center.set(Math.floor(center.x), Math.floor(center.y), Math.floor(center.z));
      if (this.dim === 'overworld') {
        this.shadowFrame = (this.shadowFrame ?? 0) + 1;
        if (this.shadowFrame % (this.touch ? 3 : 1) === 0) this.pipeline.renderShadows(this.scene, this.world.group, center, worldUniforms.sunDir.value);
      }
      const sunPos = this.camera.position.clone().addScaledVector(worldUniforms.sunDir.value, 300);
      const sunVisible = this.dim === 'overworld' && Math.sin((this.time % 24000) / 24000 * Math.PI * 2) > -0.02;
      this.pipeline.renderScene(this.scene, this.camera, sunPos, sunVisible && this.weather.rain < 0.5, !!this.player?.headInWater);
      this.renderer.setRenderTarget(null);
    } else this.renderer.render(this.scene, this.camera);
    if (this.player && this.hand.visible) {
      this.renderer.clearDepth();
      this.handCamera.fov = 70;
      this.renderer.render(this.handScene, this.handCamera);
    }
  }

  // inventory player preview
  renderPlayerPreview() {
    if (!this.previewRenderer) {
      this.previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
      this.previewRenderer.setSize(100, 150);
      this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.previewScene = new THREE.Scene();
      this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(1, 1, 2); this.previewScene.add(dl);
      this.previewCam = new THREE.PerspectiveCamera(30, 100 / 150, 0.1, 20);
      this.previewCam.position.set(0, 1.1, 4.4);
      this.previewModel = buildModel('player');
      this.previewScene.add(this.previewModel.root);
    }
    const yaw = ((this.ui.mouseX ?? 0) / window.innerWidth - 0.5) * 1.5;
    this.previewModel.root.rotation.y = yaw;
    this.previewModel.parts.head.rotation.x = (((this.ui.mouseY ?? 0) / window.innerHeight) - 0.5) * 0.8;
    this.previewRenderer.render(this.previewScene, this.previewCam);
    const c = this.previewRenderer.domElement;
    c.className = 'preview-canvas';
    return c;
  }
}

function xpForLevelLocal(l) { return l < 16 ? 2 * l + 7 : l < 31 ? 5 * l - 38 : 9 * l - 158; }

function disposeTree(o) {
  o.traverse((c) => { if (c.geometry && c.geometry.type !== 'BoxGeometry_shared') c.geometry.dispose?.(); });
}

// ---------------------------------------------------------------- particles
class Particles {
  constructor(game) { this.game = game; this.list = []; this.geo = new THREE.BoxGeometry(1, 1, 1); this.colorCache = new Map(); }
  colorOf(id) {
    if (this.colorCache.has(id)) return this.colorCache.get(id);
    const b = BLOCKS[id];
    const t = typeof b.tex === 'string' ? b.tex : b.tex.side;
    const c = tileCanvas(t);
    let col = [128, 128, 128];
    if (c) {
      const d = c.getContext('2d').getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
      if (n) col = [r / n, g / n, bl / n];
      if (b.tint) col = [col[0] * 0.5, col[1] * 0.75, col[2] * 0.35];
    }
    const color = new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255);
    this.colorCache.set(id, color);
    return color;
  }
  spawn(x, y, z, color, vel, life, size = 0.08, gravity = 12) {
    if (this.list.length > 400) return;
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
    m.scale.setScalar(size);
    m.position.set(x, y, z);
    this.game.scene.add(m);
    this.list.push({ m, vel, life, gravity });
  }
  blockBreak(x, y, z, id) {
    const c = this.colorOf(id);
    for (let i = 0; i < 16; i++) {
      const col = c.clone().multiplyScalar(0.8 + Math.random() * 0.4);
      this.spawn(x + Math.random(), y + Math.random(), z + Math.random(), col, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 0.6 + Math.random() * 0.5, 0.1);
    }
  }
  explosion(x, y, z, power) {
    const lum = this.game.world?.hasSky ? 0.35 + 0.55 * this.game.daylightLevel : 0.5;
    for (let i = 0; i < 10 * power; i++) {
      const g = (0.45 + Math.random() * 0.35) * lum;
      this.spawn(x + (Math.random() - 0.5) * power * 1.5, y + (Math.random() - 0.5) * power * 1.5, z + (Math.random() - 0.5) * power * 1.5, new THREE.Color(g, g, g), new THREE.Vector3((Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2), 0.4 + Math.random() * 0.6, 0.12 + Math.random() * 0.2, -0.5);
    }
  }
  burst(x, y, z, color) { for (let i = 0; i < 10; i++) this.spawn(x + (Math.random() - 0.5), y + (Math.random() - 0.5), z + (Math.random() - 0.5), new THREE.Color(color), new THREE.Vector3(0, 1, 0), 1, 0.08, 0); }
  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.m.position.addScaledVector(p.vel, dt);
      if (this.game.world && p.gravity > 0) {
        const id = this.game.world.getBlock(Math.floor(p.m.position.x), Math.floor(p.m.position.y), Math.floor(p.m.position.z));
        if (SOLID[id]) { p.vel.set(0, 0, 0); }
      }
    }
    for (const p of this.list) if (p.life <= 0) { this.game.scene.remove(p.m); p.m.material.dispose(); }
    this.list = this.list.filter((p) => p.life > 0);
  }
  clear() { for (const p of this.list) { this.game.scene.remove(p.m); p.m.material.dispose(); } this.list = []; }
}

// ---------------------------------------------------------------- logo
function drawLogo(c) {
  const F = {
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  };
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const word = 'VOXELCRAFT';
  const grass = tileCanvas('grass_side');
  const px = 8, gap = 1;
  const stone = tileCanvas('stone'), cobble = tileCanvas('cobblestone');
  const total = word.length * (5 + gap) * px - gap * px;
  const ox = (c.width - total) / 2, oy = 14;
  // depth
  for (let depth = 6; depth >= 0; depth--) {
    let x = ox;
    for (const ch of word) {
      const rows = F[ch];
      for (let ry = 0; ry < 7; ry++) for (let rx = 0; rx < 5; rx++) {
        if (rows[ry][rx] !== '1') continue;
        const X = x + rx * px + depth, Y = oy + ry * px + depth;
        if (depth > 0) { g.fillStyle = depth > 3 ? '#1a1a1a' : '#3a3a3a'; g.fillRect(X, Y, px, px); }
        else {
          g.drawImage(ry === 0 ? grass : ry < 4 ? stone : cobble, (rx * 3) % 12, ry === 0 ? 0 : (ry * 2) % 12, 4, 4, X, Y, px, px);
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(X, Y, px, 1);
        }
      }
      x += (5 + gap) * px;
    }
  }
}

// ---------------------------------------------------------------- storage helpers
function loadOptions() {
  const def = { fov: 70, renderDistance: IS_TOUCH ? 4 : 6, sensitivity: 100, volume: 60, guiScale: IS_TOUCH ? (Math.min(innerWidth, innerHeight) < 500 ? 1.5 : 2) : 2, difficulty: 'normal', bobbing: true, clouds: !IS_TOUCH, shaders: false, fancy: !IS_TOUCH };
  try { return { ...def, ...JSON.parse(localStorage.getItem('mc_options') || '{}') }; } catch { return def; }
}
function listWorlds() { try { return JSON.parse(localStorage.getItem('mc_worlds') || '[]').sort((a, b) => b.lastPlayed - a.lastPlayed); } catch { return []; } }
function saveWorldMeta(meta) {
  const l = listWorlds().filter((w) => w.id !== meta.id);
  l.push(meta);
  localStorage.setItem('mc_worlds', JSON.stringify(l));
}
function deleteWorld(id) {
  localStorage.setItem('mc_worlds', JSON.stringify(listWorlds().filter((w) => w.id !== id)));
  localStorage.removeItem('mc_world_' + id);
}
// Version 1 saves stored items from id 256; version 2 moves them to 1024 to make room for blocks.
function migrateSave(save) {
  if (!save || (save.version ?? 1) >= 2) return save;
  const fix = (s) => { if (s && s.id >= 256) s.id += 1024 - 256; };
  const p = save.player;
  if (p) { (p.inventory ?? []).forEach(fix); (p.armor ?? []).forEach(fix); }
  for (const d of Object.values(save.dims ?? {})) for (const t of Object.values(d.tiles ?? {})) (t.items ?? []).forEach(fix);
  save.version = 2;
  return save;
}
function readWorld(id) { try { return JSON.parse(localStorage.getItem('mc_world_' + id)); } catch { return null; } }

let audioUnlocked = false;
function unlockAudioOnce() { if (audioUnlocked) return; audioUnlocked = true; unlockAudio(); }

void atlasCanvas; void OPAQUE;
window.game = new Game();
