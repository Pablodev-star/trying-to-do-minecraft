// Villager professions, levelled trades, stock/restock, demand-based prices and reputation.
import { B, I, ITEMS } from './registry.js';
import { ENCHANTS } from './enchant.js';

export const LEVEL_NAMES = ['Novato', 'Aprendiz', 'Oficial', 'Experto', 'Maestro'];
export const LEVEL_XP = [0, 10, 70, 150, 250];

// t(cost, count, give, count, [cost2, count2], { uses, xp })
const t = (c, cn, g, gn, extra = {}) => ({ cost: [c, cn], give: [g, gn], uses: extra.uses ?? 12, xp: extra.xp ?? 2, cost2: extra.c2, ench: extra.ench, potion: extra.potion });

export const PROFESSIONS = {
  farmer: { n: 'Granjero', job: 'composter', robe: 0x8a6a3a, hat: 0xd8c080, trades: [
    [t('wheat', 20, 'emerald', 1), t('potato', 26, 'emerald', 1), t('carrot', 22, 'emerald', 1), t('emerald', 1, 'bread', 6, { xp: 1 })],
    [t('pumpkin', 6, 'emerald', 1, { xp: 10 }), t('emerald', 1, 'apple', 4, { xp: 5 })],
    [t('melon', 4, 'emerald', 1, { xp: 20 }), t('emerald', 3, 'cookie_dummy', 18, { xp: 10 })],
    [t('emerald', 1, 'golden_carrot', 3, { xp: 15 }), t('emerald', 4, 'mushroom_stew', 1, { xp: 15 })],
    [t('emerald', 3, 'golden_carrot', 3, { xp: 30 }), t('emerald', 4, 'glistering_melon_slice', 3, { xp: 30 })],
  ] },
  fisherman: { n: 'Pescador', job: 'barrel', robe: 0x3a6a8a, hat: 0xa08040, trades: [
    [t('string', 20, 'emerald', 1), t('coal', 10, 'emerald', 1), t('emerald', 1, 'cooked_cod', 6, { xp: 1 })],
    [t('cod', 15, 'emerald', 1, { xp: 10 }), t('emerald', 3, 'fishing_rod', 1, { xp: 10, ench: true })],
    [t('salmon', 13, 'emerald', 1, { xp: 20 }), t('emerald', 2, 'cooked_salmon', 6, { xp: 10 })],
    [t('tropical_fish', 6, 'emerald', 1, { xp: 30 }), t('emerald', 1, 'oak_boat', 1, { xp: 15 })],
    [t('pufferfish', 4, 'emerald', 1, { xp: 30 })],
  ] },
  shepherd: { n: 'Pastor', job: 'loom', robe: 0xe8e8e8, hat: 0x8a5a30, trades: [
    [t('white_wool', 18, 'emerald', 1), t('brown_wool', 18, 'emerald', 1), t('emerald', 2, 'shears', 1, { xp: 1 })],
    [t('emerald', 1, 'red_wool', 1, { xp: 5 }), t('emerald', 1, 'blue_wool', 1, { xp: 5 }), t('emerald', 1, 'yellow_wool', 1, { xp: 5 })],
    [t('emerald', 3, 'bed', 1, { xp: 10 }), t('emerald', 1, 'lime_wool', 1, { xp: 10 })],
    [t('emerald', 1, 'white_carpet_dummy', 4, { xp: 15 }), t('emerald', 2, 'painting_dummy', 3, { xp: 15 })],
    [t('emerald', 2, 'black_wool', 3, { xp: 30 })],
  ] },
  fletcher: { n: 'Flechero', job: 'fletching_table', robe: 0x8a8a5a, hat: 0xc8b080, trades: [
    [t('stick', 32, 'emerald', 1), t('emerald', 1, 'arrow', 16, { xp: 1 }), t('gravel', 10, 'flint', 10, { xp: 1, c2: ['emerald', 1] })],
    [t('flint', 26, 'emerald', 1, { xp: 10 }), t('emerald', 2, 'bow', 1, { xp: 5 })],
    [t('string', 14, 'emerald', 1, { xp: 20 }), t('emerald', 3, 'crossbow_dummy', 1, { xp: 10 })],
    [t('feather', 24, 'emerald', 1, { xp: 30 }), t('emerald', 2, 'bow', 1, { xp: 15, ench: true })],
    [t('emerald', 2, 'arrow', 5, { xp: 30 })],
  ] },
  librarian: { n: 'Bibliotecario', job: 'lectern', robe: 0xe8e8d8, hat: 0x8a2a2a, trades: [
    [t('paper', 24, 'emerald', 1), t('emerald', 9, 'enchanted_book', 1, { xp: 1, ench: 'book' }), t('emerald', 9, 'bookshelf', 1, { xp: 1 })],
    [t('book', 4, 'emerald', 1, { xp: 10 }), t('emerald', 5, 'enchanted_book', 1, { xp: 5, ench: 'book' }), t('emerald', 1, 'lantern', 1, { xp: 5 })],
    [t('ink_sac', 5, 'emerald', 1, { xp: 20 }), t('emerald', 1, 'glass', 4, { xp: 10 }), t('emerald', 12, 'enchanted_book', 1, { xp: 10, ench: 'book' })],
    [t('emerald', 5, 'clock', 1, { xp: 15 }), t('emerald', 4, 'compass', 1, { xp: 15 })],
    [t('emerald', 20, 'name_tag', 1, { xp: 30 })],
  ] },
  cartographer: { n: 'Cartógrafo', job: 'cartography_table', robe: 0xd8c8a8, hat: 0x6a4a2a, trades: [
    [t('paper', 24, 'emerald', 1), t('emerald', 7, 'compass', 1, { xp: 1 })],
    [t('glass_pane', 11, 'emerald', 1, { xp: 10 }), t('emerald', 13, 'compass', 1, { xp: 5 })],
    [t('compass', 1, 'emerald', 1, { xp: 20 }), t('emerald', 13, 'clock', 1, { xp: 10 })],
    [t('emerald', 7, 'lectern', 1, { xp: 15 })],
    [t('emerald', 8, 'name_tag', 1, { xp: 30 })],
  ] },
  cleric: { n: 'Clérigo', job: 'brewing_stand', robe: 0x7a2a8a, hat: 0xe0c040, trades: [
    [t('rotten_flesh', 32, 'emerald', 1), t('emerald', 1, 'redstone', 2, { xp: 1 })],
    [t('gold_ingot', 3, 'emerald', 1, { xp: 10 }), t('emerald', 1, 'lapis_lazuli', 1, { xp: 5 })],
    [t('rabbit_foot', 2, 'emerald', 1, { xp: 20 }), t('emerald', 4, 'glowstone', 1, { xp: 10 })],
    [t('turtle_scute', 4, 'emerald', 1, { xp: 30 }), t('glass_bottle', 9, 'emerald', 1, { xp: 30 }), t('emerald', 5, 'ender_pearl', 1, { xp: 15 })],
    [t('nether_wart', 22, 'emerald', 1, { xp: 30 }), t('emerald', 3, 'experience_bottle', 1, { xp: 30 })],
  ] },
  armorer: { n: 'Armero', job: 'blast_furnace', robe: 0x3a3a3a, hat: 0x5a5a5a, trades: [
    [t('coal', 15, 'emerald', 1), t('emerald', 7, 'iron_leggings', 1, { xp: 1 }), t('emerald', 4, 'iron_boots', 1, { xp: 1 }), t('emerald', 5, 'iron_helmet', 1, { xp: 1 }), t('emerald', 9, 'iron_chestplate', 1, { xp: 1 })],
    [t('iron_ingot', 4, 'emerald', 1, { xp: 10 }), t('emerald', 36, 'bell_dummy', 1, { xp: 5 }), t('emerald', 3, 'chainmail_boots', 1, { xp: 5 }), t('emerald', 7, 'chainmail_leggings', 1, { xp: 5 })],
    [t('lava_bucket', 1, 'emerald', 1, { xp: 20 }), t('diamond', 1, 'emerald', 1, { xp: 20 }), t('emerald', 1, 'chainmail_helmet', 1, { xp: 10 }), t('emerald', 4, 'chainmail_chestplate', 1, { xp: 10 })],
    [t('emerald', 19, 'diamond_leggings', 1, { xp: 15, ench: true }), t('emerald', 13, 'diamond_boots', 1, { xp: 15, ench: true })],
    [t('emerald', 13, 'diamond_helmet', 1, { xp: 30, ench: true }), t('emerald', 21, 'diamond_chestplate', 1, { xp: 30, ench: true })],
  ] },
  weaponsmith: { n: 'Herrero de armas', job: 'grindstone', robe: 0x2a2a2a, hat: 0x8a2a2a, trades: [
    [t('coal', 15, 'emerald', 1), t('emerald', 3, 'iron_axe', 1, { xp: 1 }), t('emerald', 2, 'iron_sword', 1, { xp: 1, ench: true })],
    [t('iron_ingot', 4, 'emerald', 1, { xp: 10 }), t('emerald', 36, 'bell_dummy', 1, { xp: 5 })],
    [t('flint', 24, 'emerald', 1, { xp: 20 })],
    [t('diamond', 1, 'emerald', 1, { xp: 30 }), t('emerald', 17, 'diamond_axe', 1, { xp: 15, ench: true })],
    [t('emerald', 13, 'diamond_sword', 1, { xp: 30, ench: true })],
  ] },
  toolsmith: { n: 'Herrero de herramientas', job: 'smithing_table', robe: 0x2a2a2a, hat: 0x3a5a8a, trades: [
    [t('coal', 15, 'emerald', 1), t('emerald', 1, 'stone_axe', 1, { xp: 1 }), t('emerald', 1, 'stone_shovel', 1, { xp: 1 }), t('emerald', 1, 'stone_pickaxe', 1, { xp: 1 }), t('emerald', 1, 'stone_hoe', 1, { xp: 1 })],
    [t('iron_ingot', 4, 'emerald', 1, { xp: 10 }), t('emerald', 36, 'bell_dummy', 1, { xp: 5 })],
    [t('flint', 30, 'emerald', 1, { xp: 20 }), t('emerald', 1, 'iron_axe', 1, { xp: 10, ench: true }), t('emerald', 2, 'iron_shovel', 1, { xp: 10, ench: true }), t('emerald', 3, 'iron_pickaxe', 1, { xp: 10, ench: true })],
    [t('diamond', 1, 'emerald', 1, { xp: 30 }), t('emerald', 4, 'diamond_hoe', 1, { xp: 15 })],
    [t('emerald', 13, 'diamond_pickaxe', 1, { xp: 30, ench: true })],
  ] },
  butcher: { n: 'Carnicero', job: 'smoker', robe: 0xe8e8e8, hat: 0xa82a2a, trades: [
    [t('chicken', 14, 'emerald', 1), t('porkchop', 7, 'emerald', 1), t('rabbit', 4, 'emerald', 1), t('emerald', 1, 'rabbit_stew_dummy', 1, { xp: 1 })],
    [t('coal', 15, 'emerald', 1, { xp: 10 }), t('emerald', 1, 'cooked_porkchop', 5, { xp: 5 }), t('emerald', 1, 'cooked_chicken', 8, { xp: 5 })],
    [t('mutton', 7, 'emerald', 1, { xp: 20 }), t('beef', 10, 'emerald', 1, { xp: 20 })],
    [t('dried_kelp_block_dummy', 10, 'emerald', 1, { xp: 30 })],
    [t('sweet_berries_dummy', 10, 'emerald', 1, { xp: 30 })],
  ] },
  leatherworker: { n: 'Peletero', job: 'cauldron', robe: 0x8a4a2a, hat: 0x5a2a1a, trades: [
    [t('leather', 6, 'emerald', 1), t('emerald', 3, 'leather_leggings', 1, { xp: 1 }), t('emerald', 7, 'leather_chestplate', 1, { xp: 1 })],
    [t('flint', 26, 'emerald', 1, { xp: 10 }), t('emerald', 5, 'leather_helmet', 1, { xp: 5 }), t('emerald', 4, 'leather_boots', 1, { xp: 5 })],
    [t('rabbit_hide_dummy', 9, 'emerald', 1, { xp: 20 }), t('emerald', 7, 'leather_chestplate', 1, { xp: 10 })],
    [t('turtle_scute', 4, 'emerald', 1, { xp: 30 }), t('emerald', 6, 'saddle', 1, { xp: 15 })],
    [t('emerald', 5, 'leather_helmet', 1, { xp: 30 })],
  ] },
  mason: { n: 'Albañil', job: 'stonecutter', robe: 0x6a6a6a, hat: 0x8a5a3a, trades: [
    [t('clay_ball', 10, 'emerald', 1), t('emerald', 1, 'brick', 10, { xp: 1 })],
    [t('stone', 20, 'emerald', 1, { xp: 10 }), t('emerald', 1, 'stone_bricks', 4, { xp: 5 })],
    [t('granite', 16, 'emerald', 1, { xp: 20 }), t('andesite', 16, 'emerald', 1, { xp: 20 }), t('diorite', 16, 'emerald', 1, { xp: 20 }), t('emerald', 1, 'terracotta', 1, { xp: 10 })],
    [t('quartz', 12, 'emerald', 1, { xp: 30 }), t('emerald', 1, 'orange_concrete', 1, { xp: 15 })],
    [t('emerald', 1, 'quartz_block', 1, { xp: 30 })],
  ] },
  nitwit: { n: 'Inútil', job: null, robe: 0x4a6a2a, hat: 0x4a6a2a, trades: [] },
};
export const JOB_BLOCK = Object.fromEntries(Object.entries(PROFESSIONS).filter(([, p]) => p.job).map(([k, p]) => [p.job, k]));

function randomBook() {
  const keys = Object.keys(ENCHANTS);
  const k = keys[Math.floor(Math.random() * keys.length)];
  const lvl = 1 + Math.floor(Math.random() * ENCHANTS[k].max);
  return { ench: { [k]: lvl }, extra: 2 + lvl * 3 + (ENCHANTS[k].treasure ? 10 : 0) };
}

function makeOffer(tr) {
  if (I[tr.give[0]] == null && I[tr.cost[0]] == null) return null;
  const o = { cost: [...tr.cost], cost2: tr.cost2 ? [...tr.cost2] : null, give: [...tr.give], maxUses: tr.uses, uses: 0, xp: tr.xp, demand: 0 };
  if (I[o.give[0]] == null || I[o.cost[0]] == null) return null;
  if (tr.ench === 'book') { const b = randomBook(); o.data = { ench: b.ench }; o.cost[1] = Math.min(64, o.cost[1] + b.extra); }
  else if (tr.ench) {
    const id = I[o.give[0]];
    const keys = Object.keys(ENCHANTS).filter((k) => !ENCHANTS[k].treasure);
    // pick a valid enchantment for that item
    const it = ITEMS[id];
    const okKeys = keys.filter((k) => { const on = ENCHANTS[k].on; return on === 'any' || (on === 'tool' && ['pickaxe', 'axe', 'shovel', 'hoe'].includes(it.toolType)) || (on === 'weapon' && ['sword', 'axe'].includes(it.toolType)) || (on === 'sword' && it.toolType === 'sword') || (on === 'bow' && it.toolType === 'bow') || (on === 'armor' && it.kind === 'armor') || (on === 'rod' && it.toolType === 'rod'); });
    const k = okKeys[Math.floor(Math.random() * okKeys.length)];
    if (k) { o.data = { ench: { [k]: 1 + Math.floor(Math.random() * Math.min(3, ENCHANTS[k].max)) } }; o.cost[1] = Math.min(64, o.cost[1] + 3); }
  }
  return o;
}

export function initVillager(v, profession) {
  v.profession = profession;
  v.vlevel = 1; v.vxp = 0;
  v.offers = [];
  if (profession) unlockLevel(v, 1);
}
export function unlockLevel(v, level) {
  const pool = PROFESSIONS[v.profession]?.trades[level - 1] ?? [];
  const picks = pool.slice().sort(() => Math.random() - 0.5).slice(0, 2);
  for (const tr of picks) { const o = makeOffer(tr); if (o) { o.level = level; v.offers.push(o); } }
}
export function addTradeXP(v, xp) {
  v.vxp += xp;
  while (v.vlevel < 5 && v.vxp >= LEVEL_XP[v.vlevel]) { v.vlevel++; unlockLevel(v, v.vlevel); v.leveledUp = 2; }
}
// price after reputation and demand (min 1)
export function offerPrice(v, o, playerRep) {
  const base = o.cost[1];
  const demand = Math.max(0, Math.floor(base * o.demand * 0.05));
  const rep = Math.max(-100, Math.min(100, playerRep ?? 0));
  const disc = Math.floor(rep * 0.12 * (base / 10 + 0.5));
  return Math.max(1, Math.min(ITEMS[I[o.cost[0]]]?.stack ?? 64, base + demand - disc));
}
export function restock(v) {
  for (const o of v.offers) { o.demand = Math.max(0, o.demand + o.uses - (o.maxUses - o.uses)); o.uses = 0; }
}
export { B };
