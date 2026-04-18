const STORAGE_KEY = 'minecraft_v1_worlds';
const randomSeed = () => Math.floor(Math.random() * 10 ** 9).toString();

const mainMenu = document.querySelector('#main-menu');
const worldsMenu = document.querySelector('#worlds-menu');
const worldList = document.querySelector('#world-list');
const btnSolo = document.querySelector('#btn-solo');
const btnBack = document.querySelector('#btn-back');
const btnNewWorld = document.querySelector('#btn-new-world');
const seedDialog = document.querySelector('#seed-dialog');
const btnRandomSeed = document.querySelector('#btn-random-seed');
const btnCustomSeed = document.querySelector('#btn-custom-seed');
const btnSaveCustom = document.querySelector('#btn-save-custom');
const btnCancel = document.querySelector('#btn-cancel');
const seedInput = document.querySelector('#seed-input');

let customSeedEnabled = false;

const normalizeWorld = (world) => ({
  id: typeof world.id === 'string' ? world.id : `world-${Date.now()}`,
  name: typeof world.name === 'string' && world.name.trim() ? world.name : 'Mundo sin nombre',
  seed: typeof world.seed === 'string' && world.seed.trim() ? world.seed : randomSeed(),
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

const createWorld = (seed) => {
  const worlds = loadWorlds();
  const worldNumber = worlds.length + 1;
  const world = {
    id: `world-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    name: `Mundo ${worldNumber}`,
    seed,
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
    return;
  }

  worlds.forEach((world) => {
    const li = document.createElement('li');
    li.className = 'world-item';

    const title = document.createElement('strong');
    title.textContent = world.name;

    const seed = document.createElement('small');
    seed.textContent = `Seed: ${world.seed}`;

    const created = document.createElement('small');
    created.textContent = `Creado: ${formatDate(world.createdAt)}`;

    li.append(title, seed, created);
    worldList.append(li);
  });
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

if (
  mainMenu &&
  worldsMenu &&
  worldList &&
  btnSolo &&
  btnBack &&
  btnNewWorld &&
  seedDialog &&
  btnRandomSeed &&
  btnCustomSeed &&
  btnSaveCustom &&
  btnCancel &&
  seedInput
) {
  btnSolo.addEventListener('click', showWorldsMenu);
  btnBack.addEventListener('click', showMainMenu);
  btnNewWorld.addEventListener('click', openSeedDialog);

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
}
