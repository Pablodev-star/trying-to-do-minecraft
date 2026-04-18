import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

const STORAGE_KEY = 'minecraft_v1_worlds';
const WORLD_SIZE = 24;
const MAX_HEIGHT = 8;
const BLOCK_SIZE = 1;
const MOVE_SPEED = 7;

const randomSeed = () => Math.floor(Math.random() * 10 ** 9).toString();

const mainMenu = document.querySelector('#main-menu');
const worldsMenu = document.querySelector('#worlds-menu');
const worldList = document.querySelector('#world-list');
const btnSolo = document.querySelector('#btn-solo');
const btnBack = document.querySelector('#btn-back');
const btnOpenWorld = document.querySelector('#btn-open-world');
const btnNewWorld = document.querySelector('#btn-new-world');
const seedDialog = document.querySelector('#seed-dialog');
const btnRandomSeed = document.querySelector('#btn-random-seed');
const btnCustomSeed = document.querySelector('#btn-custom-seed');
const btnSaveCustom = document.querySelector('#btn-save-custom');
const btnCancel = document.querySelector('#btn-cancel');
const seedInput = document.querySelector('#seed-input');
const menuScreen = document.querySelector('.menu-screen');
const gameView = document.querySelector('#game-view');
const gameCanvas = document.querySelector('#game-canvas');
const btnExitWorld = document.querySelector('#btn-exit-world');

let selectedWorldId = null;
let customSeedEnabled = false;

const gameState = {
  renderer: null,
  scene: null,
  camera: null,
  raycaster: null,
  yaw: 0,
  pitch: 0,
  keys: new Set(),
  blocks: new Map(),
  currentWorldId: null,
  animationFrame: null,
  lastTime: 0,
};

const normalizeWorld = (world) => ({
  id: typeof world.id === 'string' ? world.id : `world-${Date.now()}`,
  name: typeof world.name === 'string' && world.name.trim() ? world.name : 'Mundo sin nombre',
  seed: typeof world.seed === 'string' && world.seed.trim() ? world.seed : randomSeed(),
  removedBlocks: Array.isArray(world.removedBlocks) ? world.removedBlocks : [],
  createdAt: typeof world.createdAt === 'string' ? world.createdAt : new Date().toISOString(),
});

const loadWorlds = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeWorld);
  } catch {
    return [];
  }
};

const saveWorlds = (worlds) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds));
};

const updateWorld = (id, updater) => {
  const worlds = loadWorlds();
  const index = worlds.findIndex((world) => world.id === id);
  if (index === -1) return;
  worlds[index] = updater(worlds[index]);
  saveWorlds(worlds);
};

const createWorld = (seed) => {
  const worlds = loadWorlds();
  const worldNumber = worlds.length + 1;
  const world = {
    id: `world-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    name: `Mundo ${worldNumber}`,
    seed,
    removedBlocks: [],
    createdAt: new Date().toISOString(),
  };

  worlds.unshift(world);
  saveWorlds(worlds);
  renderWorlds();
};

const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Fecha desconocida' : date.toLocaleDateString('es-ES');
};

const renderWorlds = () => {
  const worlds = loadWorlds();
  worldList.innerHTML = '';

  if (worlds.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-worlds';
    li.textContent = 'Aún no tienes mundos. Crea uno nuevo.';
    worldList.append(li);
    btnOpenWorld.disabled = true;
    selectedWorldId = null;
    return;
  }

  worlds.forEach((world) => {
    const li = document.createElement('li');
    li.className = 'world-item';

    if (world.id === selectedWorldId) {
      li.classList.add('selected');
    }

    li.addEventListener('click', () => {
      selectedWorldId = world.id;
      renderWorlds();
      btnOpenWorld.disabled = false;
    });

    const title = document.createElement('strong');
    title.textContent = world.name;

    const seed = document.createElement('small');
    seed.textContent = `Seed: ${world.seed}`;

    const created = document.createElement('small');
    created.textContent = `Creado: ${formatDate(world.createdAt)}`;

    li.append(title, seed, created);
    worldList.append(li);
  });

  btnOpenWorld.disabled = !selectedWorldId;
};

const showWorldsMenu = () => {
  mainMenu.classList.add('hidden');
  worldsMenu.classList.remove('hidden');
  renderWorlds();
};

const showMainMenu = () => {
  worldsMenu.classList.add('hidden');
  mainMenu.classList.remove('hidden');
};

const openSeedDialog = () => {
  customSeedEnabled = false;
  seedInput.value = '';
  seedInput.disabled = true;

  if (typeof seedDialog.showModal === 'function') {
    seedDialog.showModal();
    return;
  }

  const useCustom = window.confirm('¿Quieres elegir una seed personalizada? (Cancelar = aleatoria)');
  if (!useCustom) {
    createWorld(randomSeed());
    return;
  }

  const manualSeed = window.prompt('Escribe la seed (si la dejas vacía se genera una aleatoria):', '');
  createWorld((manualSeed || '').trim() || randomSeed());
};

const stringHash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const makeRng = (seedText) => {
  let state = stringHash(seedText);
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const keyFromPos = (x, y, z) => `${x},${y},${z}`;

const ensureEngine = () => {
  if (gameState.renderer) return;

  gameState.renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
  gameState.renderer.setPixelRatio(window.devicePixelRatio);
  gameState.scene = new THREE.Scene();
  gameState.scene.background = new THREE.Color('#8cc6ff');

  gameState.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  gameState.camera.position.set(WORLD_SIZE / 2, MAX_HEIGHT + 2, WORLD_SIZE / 2);

  gameState.raycaster = new THREE.Raycaster();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x667777, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(20, 40, 20);
  gameState.scene.add(hemi, sun);

  window.addEventListener('resize', () => {
    gameState.camera.aspect = window.innerWidth / window.innerHeight;
    gameState.camera.updateProjectionMatrix();
    gameState.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener('keydown', (event) => {
    gameState.keys.add(event.code);
  });

  document.addEventListener('keyup', (event) => {
    gameState.keys.delete(event.code);
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== gameCanvas) return;
    gameState.yaw -= event.movementX * 0.002;
    gameState.pitch -= event.movementY * 0.002;
    gameState.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, gameState.pitch));
  });

  gameCanvas.addEventListener('click', () => {
    if (document.pointerLockElement !== gameCanvas) {
      gameCanvas.requestPointerLock();
      return;
    }

    mineBlock();
  });

  gameState.renderer.setSize(window.innerWidth, window.innerHeight);
};

const clearBlocks = () => {
  gameState.blocks.forEach((mesh) => {
    gameState.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  gameState.blocks.clear();
};

const createBlock = (x, y, z, material) => {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  gameState.scene.add(mesh);
  gameState.blocks.set(keyFromPos(x, y, z), mesh);
};

const generateTerrain = (world) => {
  clearBlocks();
  const rng = makeRng(world.seed);
  const removed = new Set(world.removedBlocks);

  const grass = new THREE.MeshLambertMaterial({ color: '#4e8a3a' });
  const dirt = new THREE.MeshLambertMaterial({ color: '#8b5a2b' });
  const stone = new THREE.MeshLambertMaterial({ color: '#737373' });

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      const columnHeight = 2 + Math.floor(rng() * MAX_HEIGHT);
      for (let y = 0; y <= columnHeight; y += 1) {
        const key = keyFromPos(x, y, z);
        if (removed.has(key)) continue;

        if (y === columnHeight) {
          createBlock(x, y, z, grass);
        } else if (y < 2) {
          createBlock(x, y, z, stone);
        } else {
          createBlock(x, y, z, dirt);
        }
      }
    }
  }

  gameState.camera.position.set(WORLD_SIZE / 2, MAX_HEIGHT + 4, WORLD_SIZE / 2);
  gameState.yaw = 0;
  gameState.pitch = -0.15;
};

const mineBlock = () => {
  if (!gameState.currentWorldId) return;

  gameState.camera.rotation.order = 'YXZ';
  gameState.camera.rotation.y = gameState.yaw;
  gameState.camera.rotation.x = gameState.pitch;

  gameState.raycaster.setFromCamera(new THREE.Vector2(0, 0), gameState.camera);
  const blockMeshes = [...gameState.blocks.values()];
  const hits = gameState.raycaster.intersectObjects(blockMeshes, false);
  if (hits.length === 0) return;

  const target = hits[0].object;
  const x = Math.floor(target.position.x);
  const y = Math.floor(target.position.y);
  const z = Math.floor(target.position.z);

  if (y <= 0) return;

  const key = keyFromPos(x, y, z);
  gameState.scene.remove(target);
  target.geometry.dispose();
  target.material.dispose();
  gameState.blocks.delete(key);

  updateWorld(gameState.currentWorldId, (world) => {
    const next = new Set(world.removedBlocks);
    next.add(key);
    return { ...world, removedBlocks: [...next] };
  });
};

const updateCamera = (delta) => {
  const forward = new THREE.Vector3(Math.sin(gameState.yaw), 0, Math.cos(gameState.yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const move = new THREE.Vector3();

  if (gameState.keys.has('KeyW')) move.add(forward);
  if (gameState.keys.has('KeyS')) move.sub(forward);
  if (gameState.keys.has('KeyD')) move.add(right);
  if (gameState.keys.has('KeyA')) move.sub(right);
  if (gameState.keys.has('Space')) move.y += 1;
  if (gameState.keys.has('ShiftLeft') || gameState.keys.has('ShiftRight')) move.y -= 1;

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_SPEED * delta);
    gameState.camera.position.add(move);
  }

  gameState.camera.rotation.order = 'YXZ';
  gameState.camera.rotation.y = gameState.yaw;
  gameState.camera.rotation.x = gameState.pitch;
};

const animate = (time = 0) => {
  if (!gameState.renderer) return;

  const delta = Math.min((time - gameState.lastTime) / 1000 || 0.016, 0.033);
  gameState.lastTime = time;

  updateCamera(delta);
  gameState.renderer.render(gameState.scene, gameState.camera);
  gameState.animationFrame = requestAnimationFrame(animate);
};

const openWorld = () => {
  if (!selectedWorldId) return;

  const world = loadWorlds().find((item) => item.id === selectedWorldId);
  if (!world) return;

  ensureEngine();
  gameState.currentWorldId = world.id;
  generateTerrain(world);

  menuScreen.classList.add('hidden');
  gameView.classList.remove('hidden');

  if (!gameState.animationFrame) {
    gameState.lastTime = 0;
    animate();
  }
};

const closeWorld = () => {
  if (document.pointerLockElement === gameCanvas) {
    document.exitPointerLock();
  }

  gameView.classList.add('hidden');
  menuScreen.classList.remove('hidden');
  showWorldsMenu();
};

btnSolo.addEventListener('click', showWorldsMenu);
btnBack.addEventListener('click', showMainMenu);
btnOpenWorld.addEventListener('click', openWorld);
btnNewWorld.addEventListener('click', openSeedDialog);
btnExitWorld.addEventListener('click', closeWorld);

btnRandomSeed.addEventListener('click', () => {
  createWorld(randomSeed());
  seedDialog.close();
});

btnCustomSeed.addEventListener('click', () => {
  customSeedEnabled = true;
  seedInput.disabled = false;
  seedInput.focus();
});

btnSaveCustom.addEventListener('click', () => {
  if (!customSeedEnabled) {
    alert('Primero selecciona "Elegir seed" o usa la opción "Aleatoria".');
    return;
  }

  const value = seedInput.value.trim();
  createWorld(value || randomSeed());
  seedDialog.close();
});

btnCancel.addEventListener('click', () => {
  seedDialog.close();
});
