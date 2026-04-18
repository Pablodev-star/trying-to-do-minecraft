const STORAGE_KEY = 'minecraft_v1_worlds';

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

const loadWorlds = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveWorlds = (worlds) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds));
};

const randomSeed = () => Math.floor(Math.random() * 10 ** 9).toString();

const createWorld = (seed) => {
  const worlds = loadWorlds();
  const worldNumber = worlds.length + 1;
  const world = {
    id: `world-${Date.now()}`,
    name: `Mundo ${worldNumber}`,
    seed,
    createdAt: new Date().toISOString(),
  };

  worlds.unshift(world);
  saveWorlds(worlds);
  renderWorlds();
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
    li.innerHTML = `${world.name}<small>Seed: ${world.seed}</small>`;
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
  seedDialog.showModal();
};

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
