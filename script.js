import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

const STORAGE_KEY = 'minecraft_v1_worlds';
const WORLD_SIZE = 24;
const BLOCK_SIZE = 1;
const MOVE_SPEED = 4.6;
const JUMP_SPEED = 7.2;
const GRAVITY = 18;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.62;
const MAP_TOP_Y = 6;
const MAP_DEPTH = 14;

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
const hotbarEl = document.querySelector('#hotbar');
const inventoryPanel = document.querySelector('#inventory-panel');
const inventoryGrid = document.querySelector('#inventory-grid');

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
  playerPos: new THREE.Vector3(WORLD_SIZE / 2, MAP_TOP_Y + 1, WORLD_SIZE / 2),
  velocityY: 0,
  onGround: false,
  materials: null,
  mining: {
    active: false,
    targetKey: null,
    progress: 0,
    duration: 0.75,
    overlay: null,
    crackTextures: [],
  },
  inventory: Array.from({ length: 36 }, () => null),
  selectedHotbar: 0,
  carriedItem: null,
  inventoryOpen: false,
};

const normalizeWorld = (world) => ({
  id: typeof world.id === 'string' ? world.id : `world-${Date.now()}`,
  name: typeof world.name === 'string' && world.name.trim() ? world.name : 'Mundo sin nombre',
  seed: typeof world.seed === 'string' && world.seed.trim() ? world.seed : randomSeed(),
  removedBlocks: Array.isArray(world.removedBlocks) ? world.removedBlocks : [],
  placedBlocks: Array.isArray(world.placedBlocks) ? world.placedBlocks : [],
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
    placedBlocks: [],
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

    if (world.id === selectedWorldId) li.classList.add('selected');

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

const keyFromPos = (x, y, z) => `${x},${y},${z}`;
const BLOCK_SYMBOL = { grass: '🟩', dirt: '🟫', stone: '⬜' };

const cloneItem = (item) => (item ? { ...item } : null);

const addItemToInventory = (type, count = 1) => {
  let remaining = count;

  for (let i = 0; i < gameState.inventory.length; i += 1) {
    const slot = gameState.inventory[i];
    if (!slot || slot.type !== type || slot.count >= 64) continue;
    const space = 64 - slot.count;
    const added = Math.min(space, remaining);
    slot.count += added;
    remaining -= added;
    if (remaining === 0) {
      renderInventory();
      return true;
    }
  }

  for (let i = 0; i < gameState.inventory.length; i += 1) {
    if (gameState.inventory[i]) continue;
    const added = Math.min(64, remaining);
    gameState.inventory[i] = { type, count: added };
    remaining -= added;
    if (remaining === 0) {
      renderInventory();
      return true;
    }
  }

  renderInventory();
  return remaining === 0;
};

const renderSlots = (container, from, to, selectedIndexOffset = null) => {
  container.innerHTML = '';
  for (let i = from; i < to; i += 1) {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot';
    if (selectedIndexOffset !== null && i - from === selectedIndexOffset) slot.classList.add('selected');
    const item = gameState.inventory[i];
    slot.dataset.index = String(i);
    slot.innerHTML = item
      ? `${BLOCK_SYMBOL[item.type] ?? '□'}<span class="slot-count">${item.count}</span>`
      : '';
    slot.addEventListener('click', () => handleSlotClick(i));
    container.append(slot);
  }
};

const renderHotbar = () => {
  renderSlots(hotbarEl, 0, 9, gameState.selectedHotbar);
};

const renderInventory = () => {
  renderHotbar();
  renderSlots(inventoryGrid, 0, 36, gameState.inventoryOpen ? gameState.selectedHotbar : null);
};

const handleSlotClick = (index) => {
  const target = cloneItem(gameState.inventory[index]);
  const carried = cloneItem(gameState.carriedItem);

  if (!carried && target) {
    gameState.carriedItem = target;
    gameState.inventory[index] = null;
  } else if (carried && !target) {
    gameState.inventory[index] = carried;
    gameState.carriedItem = null;
  } else if (carried && target && carried.type === target.type && target.count < 64) {
    const moved = Math.min(64 - target.count, carried.count);
    target.count += moved;
    carried.count -= moved;
    gameState.inventory[index] = target;
    gameState.carriedItem = carried.count > 0 ? carried : null;
  } else if (carried && target) {
    gameState.inventory[index] = carried;
    gameState.carriedItem = target;
  }

  renderInventory();
};

const toggleInventory = () => {
  gameState.inventoryOpen = !gameState.inventoryOpen;
  inventoryPanel.classList.toggle('hidden', !gameState.inventoryOpen);
  if (gameState.inventoryOpen && document.pointerLockElement === gameCanvas) {
    document.exitPointerLock();
  }
  if (gameState.inventoryOpen) {
    gameState.keys.clear();
    gameState.mining.active = false;
  }
  renderInventory();
};

const makeNoiseTexture = (baseHex, variance = 20, size = 16) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(baseHex);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const jitter = (Math.random() * 2 - 1) * (variance / 255);
      const color = new THREE.Color(
        Math.min(1, Math.max(0, base.r + jitter)),
        Math.min(1, Math.max(0, base.g + jitter)),
        Math.min(1, Math.max(0, base.b + jitter)),
      );
      ctx.fillStyle = `#${color.getHexString()}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
};

const makeGrassSideTexture = () => {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < size; y += 1) {
    const isTop = y < 5;
    for (let x = 0; x < size; x += 1) {
      const base = isTop ? new THREE.Color('#4e8a3a') : new THREE.Color('#8b5a2b');
      const jitter = (Math.random() * 2 - 1) * 0.08;
      const color = new THREE.Color(
        Math.min(1, Math.max(0, base.r + jitter)),
        Math.min(1, Math.max(0, base.g + jitter)),
        Math.min(1, Math.max(0, base.b + jitter)),
      );
      ctx.fillStyle = `#${color.getHexString()}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
};

const ensureMaterials = () => {
  if (gameState.materials) return;

  const grassTop = makeNoiseTexture('#4e8a3a', 18);
  const grassSide = makeGrassSideTexture();
  const dirt = makeNoiseTexture('#8b5a2b', 20);
  const stone = makeNoiseTexture('#737373', 24);

  gameState.materials = {
    grass: [
      new THREE.MeshLambertMaterial({ map: grassSide }),
      new THREE.MeshLambertMaterial({ map: grassSide }),
      new THREE.MeshLambertMaterial({ map: grassTop }),
      new THREE.MeshLambertMaterial({ map: dirt }),
      new THREE.MeshLambertMaterial({ map: grassSide }),
      new THREE.MeshLambertMaterial({ map: grassSide }),
    ],
    dirt: new THREE.MeshLambertMaterial({ map: dirt }),
    stone: new THREE.MeshLambertMaterial({ map: stone }),
  };
};

const makeCrackTexture = (step) => {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(20,20,20,0.95)';
  ctx.lineWidth = 1 + step * 0.12;

  const lines = 6 + step * 3;
  for (let i = 0; i < lines; i += 1) {
    const x1 = Math.random() * size;
    const y1 = Math.random() * size;
    const x2 = x1 + (Math.random() * 14 - 7);
    const y2 = y1 + (Math.random() * 14 - 7);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
};

const ensureMiningOverlay = () => {
  if (gameState.mining.overlay) return;

  gameState.mining.crackTextures = Array.from({ length: 10 }, (_, i) => makeCrackTexture(i));
  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: gameState.mining.crackTextures[0],
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const overlay = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), overlayMaterial);
  overlay.visible = false;
  gameState.scene.add(overlay);
  gameState.mining.overlay = overlay;
};

const ensureEngine = () => {
  if (gameState.renderer) return;

  gameState.renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: false });
  gameState.renderer.setPixelRatio(window.devicePixelRatio);
  gameState.scene = new THREE.Scene();
  gameState.scene.background = new THREE.Color('#8cc6ff');

  gameState.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  gameState.raycaster = new THREE.Raycaster();

  ensureMaterials();
  ensureMiningOverlay();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x667777, 0.95);
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(20, 40, 20);
  gameState.scene.add(hemi, sun);

  window.addEventListener('resize', () => {
    gameState.camera.aspect = window.innerWidth / window.innerHeight;
    gameState.camera.updateProjectionMatrix();
    gameState.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) {
      toggleInventory();
      return;
    }

    if (/^Digit[1-9]$/.test(event.code)) {
      gameState.selectedHotbar = Number(event.code.replace('Digit', '')) - 1;
      renderInventory();
      return;
    }

    gameState.keys.add(event.code);
  });

  document.addEventListener('keyup', (event) => {
    gameState.keys.delete(event.code);
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== gameCanvas) return;
    gameState.yaw -= event.movementX * 0.002;
    gameState.pitch -= event.movementY * 0.002;
    gameState.pitch = Math.max(-Math.PI / 2 + 0.03, Math.min(Math.PI / 2 - 0.03, gameState.pitch));
  });

  gameCanvas.addEventListener('click', () => {
    if (document.pointerLockElement !== gameCanvas) gameCanvas.requestPointerLock();
  });

  gameCanvas.addEventListener('mousedown', (event) => {
    if (gameState.inventoryOpen) return;
    if (event.button !== 0) return;
    if (document.pointerLockElement !== gameCanvas) {
      gameCanvas.requestPointerLock();
      return;
    }

    gameState.mining.active = true;
    gameState.mining.progress = 0;
    gameState.mining.targetKey = null;
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    gameState.mining.active = false;
    gameState.mining.targetKey = null;
    gameState.mining.progress = 0;
    if (gameState.mining.overlay) gameState.mining.overlay.visible = false;
  });

  gameCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
  gameCanvas.addEventListener('mousedown', (event) => {
    if (event.button !== 2 || gameState.inventoryOpen) return;
    if (document.pointerLockElement !== gameCanvas) return;
    placeSelectedBlock();
  });

  gameState.renderer.setSize(window.innerWidth, window.innerHeight);
};

const clearBlocks = () => {
  gameState.blocks.forEach((mesh) => {
    gameState.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((mat) => mat.dispose());
    else mesh.material.dispose();
  });
  gameState.blocks.clear();
};

const createBlock = (x, y, z, material, type, placed = false) => {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData.baseMaterial = material;
  mesh.userData.type = type;
  mesh.userData.placed = placed;
  gameState.scene.add(mesh);
  gameState.blocks.set(keyFromPos(x, y, z), mesh);
};

const generateTerrain = (world) => {
  clearBlocks();
  const removed = new Set(world.removedBlocks);

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      for (let y = MAP_TOP_Y; y >= MAP_TOP_Y - MAP_DEPTH; y -= 1) {
        const key = keyFromPos(x, y, z);
        if (removed.has(key)) continue;

        if (y === MAP_TOP_Y) {
          createBlock(x, y, z, gameState.materials.grass, 'grass');
        } else if (y >= MAP_TOP_Y - 3) {
          createBlock(x, y, z, gameState.materials.dirt, 'dirt');
        } else {
          createBlock(x, y, z, gameState.materials.stone, 'stone');
        }
      }
    }
  }

  world.placedBlocks.forEach((entry) => {
    const [coord, type] = String(entry).split(':');
    const [x, y, z] = coord.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (!type || gameState.blocks.has(keyFromPos(x, y, z))) return;
    const material = gameState.materials[type] ?? gameState.materials.dirt;
    createBlock(x, y, z, material, type, true);
  });

  gameState.playerPos.set(WORLD_SIZE / 2, MAP_TOP_Y + 1.05, WORLD_SIZE / 2);
  gameState.velocityY = 0;
  gameState.onGround = false;
  gameState.yaw = 0;
  gameState.pitch = -0.1;
};

const getSunLight = (x, y, z) => {
  let blockedAbove = 0;
  for (let yy = y + 1; yy <= MAP_TOP_Y; yy += 1) {
    if (gameState.blocks.has(keyFromPos(x, yy, z))) blockedAbove += 1;
  }

  const depth = MAP_TOP_Y - y;
  const sunFactor = Math.max(0.2, 1 - blockedAbove * 0.24 - depth * 0.05);
  return Math.max(0.18, Math.min(1, sunFactor));
};

const refreshBlockLighting = () => {
  const applyLight = (baseMaterial, light) => {
    if (Array.isArray(baseMaterial)) {
      return baseMaterial.map((mat) => {
        const next = mat.clone();
        next.color.setScalar(light);
        return next;
      });
    }

    const next = baseMaterial.clone();
    next.color.setScalar(light);
    return next;
  };

  gameState.blocks.forEach((mesh, key) => {
    const [x, y, z] = key.split(',').map(Number);
    const light = getSunLight(x, y, z);
    if (Array.isArray(mesh.material)) mesh.material.forEach((mat) => mat.dispose());
    else mesh.material.dispose();
    mesh.material = applyLight(mesh.userData.baseMaterial, light);
  });
};

const overlapsSolid = (position) => {
  const minX = Math.floor(position.x - PLAYER_RADIUS);
  const maxX = Math.floor(position.x + PLAYER_RADIUS);
  const minY = Math.floor(position.y);
  const maxY = Math.floor(position.y + PLAYER_HEIGHT);
  const minZ = Math.floor(position.z - PLAYER_RADIUS);
  const maxZ = Math.floor(position.z + PLAYER_RADIUS);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (gameState.blocks.has(keyFromPos(x, y, z))) return true;
      }
    }
  }

  return false;
};

const moveWithCollisions = (dx, dy, dz) => {
  const next = gameState.playerPos.clone();
  gameState.onGround = false;

  next.x += dx;
  if (!overlapsSolid(next)) {
    gameState.playerPos.x = next.x;
  }

  next.copy(gameState.playerPos);
  next.z += dz;
  if (!overlapsSolid(next)) {
    gameState.playerPos.z = next.z;
  }

  next.copy(gameState.playerPos);
  next.y += dy;
  if (!overlapsSolid(next)) {
    gameState.playerPos.y = next.y;
  } else if (dy < 0) {
    gameState.velocityY = 0;
    gameState.onGround = true;
  } else if (dy > 0) {
    gameState.velocityY = 0;
  }
};

const raycastBlock = () => {
  if (!gameState.currentWorldId) return null;

  gameState.camera.rotation.order = 'YXZ';
  gameState.camera.rotation.y = gameState.yaw;
  gameState.camera.rotation.x = gameState.pitch;

  gameState.raycaster.setFromCamera(new THREE.Vector2(0, 0), gameState.camera);
  const blockMeshes = [...gameState.blocks.values()];
  const hits = gameState.raycaster.intersectObjects(blockMeshes, false);
  if (hits.length === 0 || hits[0].distance > 6) return null;

  const target = hits[0].object;
  const worldNormal = hits[0].face.normal.clone().transformDirection(target.matrixWorld).round();
  const x = Math.floor(target.position.x);
  const y = Math.floor(target.position.y);
  const z = Math.floor(target.position.z);

  return {
    target,
    key: keyFromPos(x, y, z),
    x,
    y,
    z,
    type: target.userData.type,
    placed: target.userData.placed,
    faceNormal: worldNormal,
  };
};

const breakBlock = (blockHit) => {
  const { target, key, type, placed } = blockHit;
  gameState.scene.remove(target);
  target.geometry.dispose();
  if (Array.isArray(target.material)) target.material.forEach((mat) => mat.dispose());
  else target.material.dispose();
  gameState.blocks.delete(key);
  addItemToInventory(type, 1);

  updateWorld(gameState.currentWorldId, (world) => {
    const removed = new Set(world.removedBlocks);
    const placedBlocks = new Set(world.placedBlocks);
    if (placed) {
      placedBlocks.delete(`${key}:${type}`);
    } else {
      removed.add(key);
    }
    return { ...world, removedBlocks: [...removed], placedBlocks: [...placedBlocks] };
  });

  refreshBlockLighting();
};

const updateMining = (delta) => {
  const overlay = gameState.mining.overlay;
  if (!overlay) return;

  if (!gameState.mining.active) {
    overlay.visible = false;
    return;
  }

  const hit = raycastBlock();
  if (!hit) {
    gameState.mining.progress = 0;
    gameState.mining.targetKey = null;
    overlay.visible = false;
    return;
  }

  if (gameState.mining.targetKey !== hit.key) {
    gameState.mining.targetKey = hit.key;
    gameState.mining.progress = 0;
  } else {
    gameState.mining.progress += delta / gameState.mining.duration;
  }

  const step = Math.min(9, Math.floor(gameState.mining.progress * 10));
  overlay.material.map = gameState.mining.crackTextures[step];
  overlay.material.needsUpdate = true;
  overlay.position.copy(hit.target.position);
  overlay.visible = true;

  if (gameState.mining.progress >= 1) {
    breakBlock(hit);
    gameState.mining.progress = 0;
    gameState.mining.targetKey = null;
    overlay.visible = false;
  }
};

const placeSelectedBlock = () => {
  const selected = gameState.inventory[gameState.selectedHotbar];
  if (!selected || selected.count <= 0) return;

  const hit = raycastBlock();
  if (!hit) return;

  const point = hit.target.position.clone();
  const placePos = point.clone().add(hit.faceNormal).floor();
  const key = keyFromPos(placePos.x, placePos.y, placePos.z);

  if (gameState.blocks.has(key)) return;
  if (placePos.y < MAP_TOP_Y - MAP_DEPTH || placePos.y > MAP_TOP_Y + 20) return;

  const testPos = gameState.playerPos.clone();
  if (
    Math.abs(testPos.x - (placePos.x + 0.5)) < PLAYER_RADIUS + 0.5 &&
    Math.abs(testPos.z - (placePos.z + 0.5)) < PLAYER_RADIUS + 0.5 &&
    Math.abs(testPos.y + PLAYER_HEIGHT / 2 - (placePos.y + 0.5)) < PLAYER_HEIGHT / 2 + 0.5
  ) {
    return;
  }

  createBlock(
    placePos.x,
    placePos.y,
    placePos.z,
    gameState.materials[selected.type] ?? gameState.materials.dirt,
    selected.type,
    true,
  );

  selected.count -= 1;
  if (selected.count <= 0) gameState.inventory[gameState.selectedHotbar] = null;

  updateWorld(gameState.currentWorldId, (world) => {
    const placedBlocks = new Set(world.placedBlocks);
    placedBlocks.add(`${key}:${selected.type}`);
    const removed = new Set(world.removedBlocks);
    removed.delete(key);
    return { ...world, placedBlocks: [...placedBlocks], removedBlocks: [...removed] };
  });

  refreshBlockLighting();
  renderInventory();
};

const updateCamera = (delta) => {
  if (gameState.inventoryOpen) {
    gameState.camera.position.set(gameState.playerPos.x, gameState.playerPos.y + EYE_HEIGHT, gameState.playerPos.z);
    gameState.camera.rotation.order = 'YXZ';
    gameState.camera.rotation.y = gameState.yaw;
    gameState.camera.rotation.x = gameState.pitch;
    return;
  }

  const forward = new THREE.Vector3(Math.sin(gameState.yaw), 0, -Math.cos(gameState.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const move = new THREE.Vector3();

  if (gameState.keys.has('KeyW')) move.add(forward);
  if (gameState.keys.has('KeyS')) move.sub(forward);
  if (gameState.keys.has('KeyD')) move.add(right);
  if (gameState.keys.has('KeyA')) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_SPEED * delta);
  }

  if (gameState.keys.has('Space') && gameState.onGround) {
    gameState.velocityY = JUMP_SPEED;
    gameState.onGround = false;
  }

  gameState.velocityY -= GRAVITY * delta;
  const dy = gameState.velocityY * delta;

  moveWithCollisions(move.x, dy, move.z);

  if (gameState.playerPos.y < MAP_TOP_Y - MAP_DEPTH + 1) {
    gameState.playerPos.y = MAP_TOP_Y + 2;
    gameState.velocityY = 0;
  }

  gameState.camera.position.set(gameState.playerPos.x, gameState.playerPos.y + EYE_HEIGHT, gameState.playerPos.z);
  gameState.camera.rotation.order = 'YXZ';
  gameState.camera.rotation.y = gameState.yaw;
  gameState.camera.rotation.x = gameState.pitch;
};

const animate = (time = 0) => {
  if (!gameState.renderer) return;

  const delta = Math.min((time - gameState.lastTime) / 1000 || 0.016, 0.033);
  gameState.lastTime = time;

  updateCamera(delta);
  updateMining(delta);
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
  refreshBlockLighting();
  gameState.inventoryOpen = false;
  inventoryPanel.classList.add('hidden');
  renderInventory();

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
  gameState.inventoryOpen = false;
  inventoryPanel.classList.add('hidden');
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

renderInventory();
