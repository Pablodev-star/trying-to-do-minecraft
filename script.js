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

const ensureEngine = () => {
  if (gameState.renderer) return;

  gameState.renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: false });
  gameState.renderer.setPixelRatio(window.devicePixelRatio);
  gameState.scene = new THREE.Scene();
  gameState.scene.background = new THREE.Color('#8cc6ff');

  gameState.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  gameState.raycaster = new THREE.Raycaster();

  ensureMaterials();

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
  const removed = new Set(world.removedBlocks);

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      for (let y = MAP_TOP_Y; y >= MAP_TOP_Y - MAP_DEPTH; y -= 1) {
        const key = keyFromPos(x, y, z);
        if (removed.has(key)) continue;

        if (y === MAP_TOP_Y) {
          createBlock(x, y, z, gameState.materials.grass);
        } else if (y >= MAP_TOP_Y - 3) {
          createBlock(x, y, z, gameState.materials.dirt);
        } else {
          createBlock(x, y, z, gameState.materials.stone);
        }
      }
    }
  }

  gameState.playerPos.set(WORLD_SIZE / 2, MAP_TOP_Y + 1.05, WORLD_SIZE / 2);
  gameState.velocityY = 0;
  gameState.onGround = false;
  gameState.yaw = 0;
  gameState.pitch = -0.1;
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

const mineBlock = () => {
  if (!gameState.currentWorldId) return;

  gameState.camera.rotation.order = 'YXZ';
  gameState.camera.rotation.y = gameState.yaw;
  gameState.camera.rotation.x = gameState.pitch;

  gameState.raycaster.setFromCamera(new THREE.Vector2(0, 0), gameState.camera);
  const blockMeshes = [...gameState.blocks.values()];
  const hits = gameState.raycaster.intersectObjects(blockMeshes, false);
  if (hits.length === 0 || hits[0].distance > 6) return;

  const target = hits[0].object;
  const x = Math.floor(target.position.x);
  const y = Math.floor(target.position.y);
  const z = Math.floor(target.position.z);

  const key = keyFromPos(x, y, z);
  gameState.scene.remove(target);
  target.geometry.dispose();
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
