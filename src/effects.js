// Status effects, potions and brewing recipes.

export const EFFECTS = {
  speed: { n: 'Velocidad', c: 0x7cafc6, good: true },
  slowness: { n: 'Lentitud', c: 0x5a6c81 },
  haste: { n: 'Prisa minera', c: 0xd9c043, good: true },
  mining_fatigue: { n: 'Fatiga minera', c: 0x4a4217 },
  strength: { n: 'Fuerza', c: 0x932423, good: true },
  weakness: { n: 'Debilidad', c: 0x484d48 },
  instant_health: { n: 'Curación instantánea', c: 0xf82423, good: true, instant: true },
  instant_damage: { n: 'Daño instantáneo', c: 0x430a09, instant: true },
  jump_boost: { n: 'Salto', c: 0x22ff4c, good: true },
  regeneration: { n: 'Regeneración', c: 0xcd5cab, good: true },
  poison: { n: 'Veneno', c: 0x4e9331 },
  wither: { n: 'Descomposición', c: 0x352a27 },
  resistance: { n: 'Resistencia', c: 0x99453a, good: true },
  fire_resistance: { n: 'Resistencia al fuego', c: 0xe49a3a, good: true },
  water_breathing: { n: 'Respiración acuática', c: 0x2e5299, good: true },
  invisibility: { n: 'Invisibilidad', c: 0x7f8392, good: true },
  night_vision: { n: 'Visión nocturna', c: 0x1f1fa1, good: true },
  absorption: { n: 'Absorción', c: 0x2552a5, good: true },
  saturation: { n: 'Saturación', c: 0xf82423, good: true, instant: true },
  levitation: { n: 'Levitación', c: 0xceffff },
  slow_falling: { n: 'Caída lenta', c: 0xf3cfb9, good: true },
  hunger: { n: 'Hambre', c: 0x587653 },
  luck: { n: 'Suerte', c: 0x339900, good: true },
};

// potion types: effect, duration seconds, amplifier (0 = level I)
export const POTIONS = {
  water: { n: 'Botella de agua' },
  awkward: { n: 'Poción rara' },
  mundane: { n: 'Poción mundana' },
  thick: { n: 'Poción espesa' },
  swiftness: { n: 'Poción de rapidez', e: 'speed', t: 180 },
  long_swiftness: { n: 'Poción de rapidez', e: 'speed', t: 480 },
  strong_swiftness: { n: 'Poción de rapidez', e: 'speed', t: 90, a: 1 },
  slowness: { n: 'Poción de lentitud', e: 'slowness', t: 90 },
  long_slowness: { n: 'Poción de lentitud', e: 'slowness', t: 240 },
  leaping: { n: 'Poción de salto', e: 'jump_boost', t: 180 },
  long_leaping: { n: 'Poción de salto', e: 'jump_boost', t: 480 },
  strong_leaping: { n: 'Poción de salto', e: 'jump_boost', t: 90, a: 1 },
  healing: { n: 'Poción de curación', e: 'instant_health', t: 0 },
  strong_healing: { n: 'Poción de curación', e: 'instant_health', t: 0, a: 1 },
  harming: { n: 'Poción de daño', e: 'instant_damage', t: 0 },
  strong_harming: { n: 'Poción de daño', e: 'instant_damage', t: 0, a: 1 },
  poison: { n: 'Poción de veneno', e: 'poison', t: 45 },
  long_poison: { n: 'Poción de veneno', e: 'poison', t: 90 },
  strong_poison: { n: 'Poción de veneno', e: 'poison', t: 21, a: 1 },
  regeneration: { n: 'Poción de regeneración', e: 'regeneration', t: 45 },
  long_regeneration: { n: 'Poción de regeneración', e: 'regeneration', t: 90 },
  strong_regeneration: { n: 'Poción de regeneración', e: 'regeneration', t: 22, a: 1 },
  strength: { n: 'Poción de fuerza', e: 'strength', t: 180 },
  long_strength: { n: 'Poción de fuerza', e: 'strength', t: 480 },
  strong_strength: { n: 'Poción de fuerza', e: 'strength', t: 90, a: 1 },
  weakness: { n: 'Poción de debilidad', e: 'weakness', t: 90 },
  long_weakness: { n: 'Poción de debilidad', e: 'weakness', t: 240 },
  fire_resistance: { n: 'Poción de resistencia al fuego', e: 'fire_resistance', t: 180 },
  long_fire_resistance: { n: 'Poción de resistencia al fuego', e: 'fire_resistance', t: 480 },
  night_vision: { n: 'Poción de visión nocturna', e: 'night_vision', t: 180 },
  long_night_vision: { n: 'Poción de visión nocturna', e: 'night_vision', t: 480 },
  invisibility: { n: 'Poción de invisibilidad', e: 'invisibility', t: 180 },
  long_invisibility: { n: 'Poción de invisibilidad', e: 'invisibility', t: 480 },
  water_breathing: { n: 'Poción de respiración acuática', e: 'water_breathing', t: 180 },
  long_water_breathing: { n: 'Poción de respiración acuática', e: 'water_breathing', t: 480 },
  slow_falling: { n: 'Poción de caída lenta', e: 'slow_falling', t: 90 },
  long_slow_falling: { n: 'Poción de caída lenta', e: 'slow_falling', t: 240 },
  turtle_master: { n: 'Poción del maestro tortuga', e: 'resistance', t: 20, a: 2, e2: 'slowness', a2: 3 },
};

// Brewing: base potion + ingredient -> result
const BASE = { nether_wart: 'awkward', redstone: 'mundane', glowstone_dust: 'thick', sugar: 'mundane', spider_eye: 'mundane', ghast_tear: 'mundane', blaze_powder: 'mundane', magma_cream: 'mundane', glistering_melon_slice: 'mundane' };
const AWKWARD = {
  sugar: 'swiftness', rabbit_foot: 'leaping', glistering_melon_slice: 'healing', spider_eye: 'poison', ghast_tear: 'regeneration',
  blaze_powder: 'strength', magma_cream: 'fire_resistance', golden_carrot: 'night_vision', pufferfish: 'water_breathing',
  phantom_membrane: 'slow_falling', turtle_scute: 'turtle_master',
};
const CORRUPT = { swiftness: 'slowness', long_swiftness: 'long_slowness', leaping: 'slowness', long_leaping: 'long_slowness', healing: 'harming', strong_healing: 'strong_harming', poison: 'harming', long_poison: 'harming', strong_poison: 'strong_harming', night_vision: 'invisibility', long_night_vision: 'long_invisibility' };

export function brew(potion, ingredient) {
  if (potion === 'water') {
    if (ingredient === 'fermented_spider_eye') return 'weakness';
    return BASE[ingredient] ?? null;
  }
  if (potion === 'awkward') return AWKWARD[ingredient] ?? null;
  if (ingredient === 'fermented_spider_eye') return CORRUPT[potion] ?? null;
  if (ingredient === 'redstone' && POTIONS['long_' + potion]) return 'long_' + potion;
  if (ingredient === 'glowstone_dust' && POTIONS['strong_' + potion]) return 'strong_' + potion;
  return null;
}
export const BREW_INGREDIENTS = new Set(['nether_wart', 'redstone', 'glowstone_dust', 'fermented_spider_eye', 'gunpowder', ...Object.keys(AWKWARD), ...Object.keys(BASE)]);

export function potionName(kind, splash) {
  const p = POTIONS[kind];
  if (!p) return 'Poción';
  let n = p.n;
  if (splash) n = n.replace('Poción', 'Poción arrojadiza').replace('Botella de agua', 'Botella de agua arrojadiza');
  return n;
}
export function potionColor(kind) {
  const p = POTIONS[kind];
  if (!p || !p.e) return kind === 'water' ? 0x385dc6 : 0x6a5acd;
  return EFFECTS[p.e].c;
}
export function potionEffects(kind) {
  const p = POTIONS[kind];
  if (!p?.e) return [];
  const out = [{ e: p.e, t: p.t, a: p.a ?? 0 }];
  if (p.e2) out.push({ e: p.e2, t: p.t, a: p.a2 ?? 0 });
  return out;
}
export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
