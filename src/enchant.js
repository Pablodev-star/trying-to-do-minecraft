// Enchantments: definitions, which items accept them, enchanting-table offers and anvil merging.
import { ITEMS } from './registry.js';

// type groups: weapon (swords/axes), tool (pick/axe/shovel/hoe/shears), bow, armor (any slot) or a slot, rod, any (durable)
export const ENCHANTS = {
  protection: { n: 'Protección', max: 4, on: 'armor', w: 10, ex: 'prot' },
  fire_protection: { n: 'Protección contra el fuego', max: 4, on: 'armor', w: 5, ex: 'prot' },
  blast_protection: { n: 'Protección contra explosiones', max: 4, on: 'armor', w: 2, ex: 'prot' },
  projectile_protection: { n: 'Protección contra proyectiles', max: 4, on: 'armor', w: 5, ex: 'prot' },
  feather_falling: { n: 'Caída de pluma', max: 4, on: 'boots', w: 5 },
  respiration: { n: 'Respiración', max: 3, on: 'helmet', w: 2 },
  aqua_affinity: { n: 'Afinidad acuática', max: 1, on: 'helmet', w: 2 },
  thorns: { n: 'Espinas', max: 3, on: 'chestplate', w: 1 },
  depth_strider: { n: 'Agilidad acuática', max: 3, on: 'boots', w: 2 },
  sharpness: { n: 'Filo', max: 5, on: 'weapon', w: 10, ex: 'dmg' },
  smite: { n: 'Castigo', max: 5, on: 'weapon', w: 5, ex: 'dmg' },
  bane_of_arthropods: { n: 'Perdición de los artrópodos', max: 5, on: 'weapon', w: 5, ex: 'dmg' },
  knockback: { n: 'Empuje', max: 2, on: 'sword', w: 5 },
  fire_aspect: { n: 'Aspecto ígneo', max: 2, on: 'sword', w: 2 },
  looting: { n: 'Botín', max: 3, on: 'sword', w: 2 },
  efficiency: { n: 'Eficiencia', max: 5, on: 'tool', w: 10 },
  silk_touch: { n: 'Toque de seda', max: 1, on: 'tool', w: 1, ex: 'drop' },
  fortune: { n: 'Fortuna', max: 3, on: 'tool', w: 2, ex: 'drop' },
  unbreaking: { n: 'Irrompibilidad', max: 3, on: 'any', w: 5 },
  power: { n: 'Poder', max: 5, on: 'bow', w: 10 },
  punch: { n: 'Retroceso', max: 2, on: 'bow', w: 2 },
  flame: { n: 'Fuego', max: 1, on: 'bow', w: 2 },
  infinity: { n: 'Infinidad', max: 1, on: 'bow', w: 1, ex: 'inf' },
  luck_of_the_sea: { n: 'Suerte marina', max: 3, on: 'rod', w: 2 },
  lure: { n: 'Atracción', max: 3, on: 'rod', w: 2 },
  mending: { n: 'Reparación', max: 1, on: 'any', w: 2, treasure: true, ex: 'inf' },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const enchName = (k, l) => `${ENCHANTS[k]?.n ?? k}${ENCHANTS[k]?.max > 1 ? ' ' + ROMAN[l] : ''}`;

export function itemGroups(id) {
  const it = ITEMS[id];
  if (!it) return [];
  const g = [];
  if (it.name === 'book' || it.name === 'enchanted_book') return ['book'];
  if (it.toolType === 'sword') g.push('weapon', 'sword');
  if (it.toolType === 'axe') g.push('weapon', 'tool');
  if (['pickaxe', 'shovel', 'hoe', 'shears'].includes(it.toolType)) g.push('tool');
  if (it.toolType === 'bow') g.push('bow');
  if (it.toolType === 'rod') g.push('rod');
  if (it.kind === 'armor') g.push('armor', ['helmet', 'chestplate', 'leggings', 'boots'][it.slot]);
  if (it.name === 'elytra') g.length = 0;
  if (it.durability) g.push('any');
  return g;
}
export function canApply(key, id) {
  const groups = itemGroups(id);
  return groups.includes('book') || groups.includes(ENCHANTS[key].on);
}
export const enchLevel = (stack, key) => stack?.data?.ench?.[key] ?? 0;
export const isEnchanted = (s) => !!(s?.data?.ench && Object.keys(s.data.ench).length);
export const enchantability = (id) => {
  const n = ITEMS[id]?.name ?? '';
  if (n.startsWith('golden')) return 22; if (n.startsWith('wooden') || n.startsWith('leather')) return 15;
  if (n.startsWith('stone')) return 5; if (n.startsWith('iron') || n.startsWith('chainmail')) return 12;
  if (n.startsWith('diamond')) return 10; if (n.startsWith('netherite')) return 15; return 1;
};

function conflicts(a, b) { return a === b || (ENCHANTS[a].ex && ENCHANTS[a].ex === ENCHANTS[b].ex); }

// Roll a set of enchantments for a given experience-level cost
export function rollEnchantments(id, cost, rng = Math.random) {
  const pool = Object.keys(ENCHANTS).filter((k) => !ENCHANTS[k].treasure && canApply(k, id));
  if (!pool.length) return {};
  let power = cost + 1 + Math.floor(rng() * (enchantability(id) / 4 + 1)) + Math.floor(rng() * (enchantability(id) / 4 + 1));
  power = Math.max(1, Math.round(power * (1 + (rng() + rng() - 1) * 0.15)));
  const out = {};
  const pick = () => {
    const cands = pool.filter((k) => !Object.keys(out).some((o) => conflicts(o, k)));
    if (!cands.length) return false;
    let total = cands.reduce((a, k) => a + ENCHANTS[k].w, 0), r = rng() * total;
    let key = cands[0];
    for (const k of cands) { r -= ENCHANTS[k].w; if (r <= 0) { key = k; break; } }
    const e = ENCHANTS[key];
    out[key] = Math.max(1, Math.min(e.max, Math.ceil(power / (30 / e.max + 1))));
    return true;
  };
  pick();
  while (rng() < (power + 1) / 50) { if (!pick()) break; power = Math.floor(power / 2); }
  return out;
}

// Three offers like the enchanting table, based on the number of bookshelves (0-15)
export function tableOffers(id, shelves, seed) {
  let s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const base = Math.floor(rng() * 8) + 1 + Math.floor(shelves / 2) + Math.floor(rng() * (shelves + 1));
  const costs = [Math.max(Math.floor(base / 3), 1), Math.floor((base * 2) / 3 + 1), Math.max(base, shelves * 2)];
  return costs.map((c) => ({ cost: c, ench: rollEnchantments(id, c, rng) }));
}

// Anvil: combine target with sacrifice (same item or enchanted book). Returns { stack, cost } or null.
export function anvilCombine(target, sacrifice, materialOk, rename) {
  if (!target) return null;
  const it = ITEMS[target.id];
  const out = JSON.parse(JSON.stringify(target));
  out.data ??= {};
  let cost = (target.data?.repairCost ?? 0) + (sacrifice?.data?.repairCost ?? 0);
  let changed = false;
  if (sacrifice) {
    if (materialOk && it.durability && target.dmg) {
      // repair with raw material: each unit restores 25%
      const units = Math.min(sacrifice.count, Math.ceil(target.dmg / (it.durability / 4)));
      out.dmg = Math.max(0, target.dmg - Math.floor(units * it.durability / 4));
      cost += units; changed = true;
      out._units = units;
    } else if (sacrifice.id === target.id || ITEMS[sacrifice.id]?.name === 'enchanted_book') {
      if (sacrifice.id === target.id && it.durability) {
        const left = (it.durability - (target.dmg ?? 0)) + (it.durability - (sacrifice.dmg ?? 0)) + Math.floor(it.durability * 0.12);
        out.dmg = Math.max(0, it.durability - left);
        if (out.dmg !== target.dmg) { cost += 2; changed = true; }
      }
      const ench = { ...(target.data?.ench ?? {}) };
      for (const [k, lv] of Object.entries(sacrifice.data?.ench ?? {})) {
        if (!canApply(k, target.id)) continue;
        if (Object.keys(ench).some((o) => o !== k && conflicts(o, k))) { cost += 1; continue; }
        const cur = ench[k] ?? 0;
        const nl = cur === lv ? Math.min(ENCHANTS[k].max, lv + 1) : Math.max(cur, lv);
        if (nl !== cur) { ench[k] = nl; cost += nl * (ENCHANTS[k].w >= 10 ? 1 : ENCHANTS[k].w >= 5 ? 2 : 4); changed = true; }
      }
      out.data.ench = ench;
    } else return null;
  }
  if (rename != null && rename !== (target.data?.name ?? '')) { out.data.name = rename || undefined; if (!rename) delete out.data.name; cost += 1; changed = true; }
  if (!changed) return null;
  out.data.repairCost = (target.data?.repairCost ?? 0) * 2 + 1;
  const units = out._units; delete out._units;
  if (!Object.keys(out.data.ench ?? {}).length) delete out.data.ench;
  return { stack: out, cost: Math.max(1, cost), units };
}

// Protection: returns damage multiplier for the given source kind
export function protectionFactor(armor, kind) {
  let epf = 0;
  for (const a of armor) {
    if (!a) continue;
    epf += enchLevel(a, 'protection');
    if (kind === 'fire' || kind === 'lava') epf += enchLevel(a, 'fire_protection') * 2;
    if (kind === 'explosion') epf += enchLevel(a, 'blast_protection') * 2;
    if (kind === 'projectile') epf += enchLevel(a, 'projectile_protection') * 2;
    if (kind === 'fall') epf += enchLevel(a, 'feather_falling') * 3;
  }
  return 1 - Math.min(20, epf) / 25;
}
