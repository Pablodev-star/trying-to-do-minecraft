// Block + item registry, recipes, smelting and fuel tables.
import { WOOL_COLORS, SPAWN_EGG_COLORS } from './textures.js';

export const BLOCKS = [];   // id -> block def
export const B = {};        // name -> block id
export const BLOCK_LIMIT = 1024; // block ids are 0..1023, item ids start at 1024
export const ITEMS = [];    // id -> item def (blocks occupy ids < BLOCK_LIMIT)
export const I = {};        // name -> item id

const T = (top, side, bottom = top, front = side) => ({ top, side, bottom, front });

function block(name, display, p = {}) {
  const id = BLOCKS.length;
  const def = {
    id, name, display,
    tex: p.tex ?? name,
    render: p.render ?? 'cube',         // cube | cross | liquid | box | none | portal
    pass: p.pass ?? (p.render === 'cross' || p.render === 'box' ? 'cutout' : 'opaque'), // opaque | cutout | translucent
    solid: p.solid ?? (p.render !== 'cross' && p.render !== 'liquid' && p.render !== 'none' && p.render !== 'portal'),
    opaque: p.opaque ?? ((p.render ?? 'cube') === 'cube' && !p.pass),
    hardness: p.hardness ?? 1,
    tool: p.tool ?? null,
    level: p.level ?? 0,
    needsTool: p.needsTool ?? false,
    drops: p.drops,                     // undefined => self, null => nothing, string, or fn
    light: p.light ?? 0,
    tint: p.tint ?? null,
    gravity: p.gravity ?? false,
    replaceable: p.replaceable ?? false,
    box: p.box ?? null,
    flammable: p.flammable ?? false,
    noItem: p.noItem ?? false,
    orient: p.orient ?? false,          // has a front face facing player
    sound: p.sound ?? 'stone',
    climbable: p.climbable ?? false,
    slow: p.slow ?? 0,
    shape: p.shape ?? null,             // slab | stairs | fence | pane | torch | door | bed
    base: p.base ?? null,               // full block a double slab turns into
    anim: p.anim ?? 0,                  // animated texture: 1 water, 2 lava, 3 portal
  };
  BLOCKS.push(def); B[name] = id;
  if (!def.noItem) { ITEMS[id] = { id, name, display, stack: p.stack ?? 64, block: id, kind: 'block' }; I[name] = id; }
  return def;
}

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = { tool: 'pickaxe', needsTool: true };

block('air', 'Aire', { render: 'none', solid: false, opaque: false, hardness: 0, noItem: true, replaceable: true });
block('stone', 'Piedra', { hardness: 1.5, ...pick, drops: 'cobblestone' });
block('granite', 'Granito', { hardness: 1.5, ...pick });
block('diorite', 'Diorita', { hardness: 1.5, ...pick });
block('andesite', 'Andesita', { hardness: 1.5, ...pick });
block('grass_block', 'Bloque de césped', { tex: T('grass_top', 'grass_side', 'dirt'), hardness: 0.6, tool: 'shovel', drops: 'dirt', tint: 'grass_top', sound: 'grass' });
block('snowy_grass', 'Césped nevado', { tex: T('snow', 'snowy_grass_side', 'dirt'), hardness: 0.6, tool: 'shovel', drops: 'dirt', noItem: true, sound: 'grass' });
block('podzol', 'Podsol', { tex: T('podzol_top', 'dirt', 'dirt'), hardness: 0.5, tool: 'shovel', drops: 'dirt', sound: 'grass' });
block('dirt', 'Tierra', { hardness: 0.5, tool: 'shovel', sound: 'grass' });
block('cobblestone', 'Roca', { hardness: 2, ...pick });
block('mossy_cobblestone', 'Roca musgosa', { hardness: 2, ...pick });
for (const [w, n] of [['oak', 'roble'], ['spruce', 'abeto'], ['birch', 'abedul'], ['jungle', 'jungla'], ['acacia', 'acacia']]) {
  block(`${w}_planks`, `Tablones de ${n}`, { hardness: 2, tool: 'axe', flammable: true, sound: 'wood' });
  block(`${w}_log`, `Tronco de ${n}`, { tex: T(`${w}_log_top`, `${w}_log`), hardness: 2, tool: 'axe', flammable: true, sound: 'wood' });
  block(`${w}_leaves`, `Hojas de ${n}`, {
    hardness: 0.2, tool: 'hoe', pass: 'cutout', opaque: false, tint: 'foliage_' + w, flammable: true, sound: 'grass',
    drops: () => {
      const d = [];
      if (Math.random() < 0.05 && B[w + '_sapling']) d.push([w + '_sapling', 1]);
      if (Math.random() < 0.02) d.push(['stick', rnd(1, 2)]);
      if (w === 'oak' && Math.random() < 0.01) d.push(['apple', 1]);
      return d;
    },
  });
}
block('bedrock', 'Piedra base', { hardness: -1 });
block('water', 'Agua', { anim: 1, render: 'liquid', pass: 'translucent', solid: false, opaque: false, hardness: -1, noItem: true, replaceable: true, tint: 'water' });
block('lava', 'Lava', { anim: 2, render: 'liquid', solid: false, opaque: false, hardness: -1, noItem: true, replaceable: true, light: 15 });
block('sand', 'Arena', { hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
block('red_sand', 'Arena roja', { hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
block('gravel', 'Grava', { hardness: 0.6, tool: 'shovel', gravity: true, sound: 'sand', drops: () => [[Math.random() < 0.1 ? 'flint' : 'gravel', 1]] });
block('coal_ore', 'Mena de carbón', { hardness: 3, ...pick, drops: 'coal' });
block('iron_ore', 'Mena de hierro', { hardness: 3, ...pick, level: 1, drops: 'raw_iron' });
block('copper_ore', 'Mena de cobre', { hardness: 3, ...pick, level: 1, drops: () => [['raw_copper', rnd(2, 5)]] });
block('gold_ore', 'Mena de oro', { hardness: 3, ...pick, level: 2, drops: 'raw_gold' });
block('redstone_ore', 'Mena de redstone', { hardness: 3, ...pick, level: 2, drops: () => [['redstone', rnd(4, 5)]], light: 0 });
block('lapis_ore', 'Mena de lapislázuli', { hardness: 3, ...pick, level: 1, drops: () => [['lapis_lazuli', rnd(4, 9)]] });
block('diamond_ore', 'Mena de diamante', { hardness: 3, ...pick, level: 2, drops: 'diamond' });
block('emerald_ore', 'Mena de esmeralda', { hardness: 3, ...pick, level: 2, drops: 'emerald' });
block('glass', 'Cristal', { hardness: 0.3, pass: 'cutout', opaque: false, drops: null, sound: 'glass' });
block('sandstone', 'Arenisca', { tex: T('sandstone_top', 'sandstone'), hardness: 0.8, ...pick });
for (const [c, n] of Object.entries({ white: 'blanca', orange: 'naranja', magenta: 'magenta', light_blue: 'celeste', yellow: 'amarilla', lime: 'verde lima', pink: 'rosa', gray: 'gris', light_gray: 'gris claro', cyan: 'cian', purple: 'morada', blue: 'azul', brown: 'marrón', green: 'verde', red: 'roja', black: 'negra' })) {
  block(`${c}_wool`, `Lana ${n}`, { hardness: 0.8, tool: 'shears', flammable: true, sound: 'wool' });
}
for (const [c, n] of Object.entries({ white: 'blanco', orange: 'naranja', magenta: 'magenta', light_blue: 'celeste', yellow: 'amarillo', lime: 'verde lima', pink: 'rosa', gray: 'gris', light_gray: 'gris claro', cyan: 'cian', purple: 'morado', blue: 'azul', brown: 'marrón', green: 'verde', red: 'rojo', black: 'negro' })) {
  block(`${c}_concrete`, `Hormigón ${n}`, { hardness: 1.8, ...pick });
}
block('gold_block', 'Bloque de oro', { hardness: 3, ...pick, level: 2 });
block('iron_block', 'Bloque de hierro', { hardness: 5, ...pick, level: 1 });
block('diamond_block', 'Bloque de diamante', { hardness: 5, ...pick, level: 2 });
block('emerald_block', 'Bloque de esmeralda', { hardness: 5, ...pick, level: 2 });
block('lapis_block', 'Bloque de lapislázuli', { hardness: 3, ...pick, level: 1 });
block('coal_block', 'Bloque de carbón', { hardness: 5, ...pick });
block('redstone_block', 'Bloque de redstone', { hardness: 5, ...pick });
block('copper_block', 'Bloque de cobre', { hardness: 3, ...pick, level: 1 });
block('quartz_block', 'Bloque de cuarzo', { hardness: 0.8, ...pick });
block('bricks', 'Ladrillos', { hardness: 2, ...pick });
block('stone_bricks', 'Ladrillos de piedra', { hardness: 1.5, ...pick });
block('mossy_stone_bricks', 'Ladrillos de piedra musgosos', { hardness: 1.5, ...pick });
block('smooth_stone', 'Piedra lisa', { hardness: 2, ...pick });
block('tnt', 'Dinamita', { tex: T('tnt_top', 'tnt_side', 'tnt_bottom'), hardness: 0, sound: 'grass' });
block('bookshelf', 'Librería', { tex: T('oak_planks', 'bookshelf'), hardness: 1.5, tool: 'axe', drops: () => [['book', 3]], flammable: true, sound: 'wood' });
block('obsidian', 'Obsidiana', { hardness: 50, ...pick, level: 3 });
block('crying_obsidian', 'Obsidiana llorosa', { hardness: 50, ...pick, level: 3, light: 10 });
block('torch', 'Antorcha', { render: 'box', shape: 'torch', solid: false, opaque: false, hardness: 0, light: 14, sound: 'wood' });
block('soul_torch', 'Antorcha de almas', { render: 'box', shape: 'torch', solid: false, opaque: false, hardness: 0, light: 10, sound: 'wood' });
block('crafting_table', 'Mesa de trabajo', { tex: T('crafting_table_top', 'crafting_table_side', 'oak_planks', 'crafting_table_front'), hardness: 2.5, tool: 'axe', orient: true, sound: 'wood' });
block('furnace', 'Horno', { tex: T('furnace_top', 'furnace_side', 'furnace_top', 'furnace_front'), hardness: 3.5, ...pick, orient: true });
block('lit_furnace', 'Horno encendido', { tex: T('furnace_top', 'furnace_side', 'furnace_top', 'furnace_front_on'), hardness: 3.5, ...pick, orient: true, light: 13, drops: 'furnace', noItem: true });
block('chest', 'Cofre', { tex: T('chest_top', 'chest_side', 'chest_top', 'chest_front'), render: 'box', box: [1, 0, 1, 15, 14, 15], opaque: false, solid: true, hardness: 2.5, tool: 'axe', orient: true, sound: 'wood' });
block('farmland', 'Tierra de cultivo', { tex: T('farmland', 'dirt'), render: 'box', box: [0, 0, 0, 16, 15, 16], pass: 'opaque', opaque: false, hardness: 0.6, tool: 'shovel', drops: 'dirt', sound: 'grass' });
block('farmland_wet', 'Tierra de cultivo húmeda', { tex: T('farmland_wet', 'dirt'), render: 'box', box: [0, 0, 0, 16, 15, 16], pass: 'opaque', opaque: false, hardness: 0.6, tool: 'shovel', drops: 'dirt', noItem: true, sound: 'grass' });
for (const crop of ['wheat', 'carrots', 'potatoes']) for (let i = 0; i < 8; i++) {
  block(`${crop}_${i}`, crop, {
    render: 'cross', hardness: 0, noItem: true, sound: 'grass',
    drops: () => {
      if (crop === 'wheat') return i === 7 ? [['wheat', 1], ['wheat_seeds', rnd(1, 3)]] : [['wheat_seeds', 1]];
      const it = crop === 'carrots' ? 'carrot' : 'potato';
      return [[it, i === 7 ? rnd(2, 4) : 1]];
    },
  });
}
block('snow_block', 'Bloque de nieve', { tex: 'snow', hardness: 0.2, tool: 'shovel', drops: () => [['snowball', 4]], sound: 'wool' });
block('snow', 'Nieve', { tex: 'snow', render: 'box', box: [0, 0, 0, 16, 2, 16], pass: 'opaque', solid: false, opaque: false, hardness: 0.1, tool: 'shovel', drops: () => [['snowball', 1]], replaceable: true, sound: 'wool' });
block('ice', 'Hielo', { hardness: 0.5, tool: 'pickaxe', pass: 'translucent', opaque: false, drops: null, sound: 'glass' });
block('packed_ice', 'Hielo compacto', { hardness: 0.5, tool: 'pickaxe', drops: null, sound: 'glass' });
block('cactus', 'Cactus', { tex: T('cactus_top', 'cactus_side'), render: 'box', box: [1, 0, 1, 15, 16, 15], pass: 'cutout', opaque: false, hardness: 0.4, sound: 'wool' });
block('clay', 'Arcilla', { hardness: 0.6, tool: 'shovel', drops: () => [['clay_ball', 4]], sound: 'sand' });
block('terracotta', 'Terracota', { hardness: 1.25, ...pick });
block('sugar_cane', 'Caña de azúcar', { render: 'cross', hardness: 0, sound: 'grass' });
block('pumpkin', 'Calabaza', { tex: T('pumpkin_top', 'pumpkin_side', 'pumpkin_top', 'pumpkin_face'), hardness: 1, tool: 'axe', orient: true, sound: 'wood' });
block('jack_o_lantern', 'Calabaza de Halloween', { tex: T('pumpkin_top', 'pumpkin_side', 'pumpkin_top', 'jack_o_lantern'), hardness: 1, tool: 'axe', orient: true, light: 15, sound: 'wood' });
block('melon', 'Sandía', { tex: T('melon_top', 'melon_side'), hardness: 1, tool: 'axe', drops: () => [['melon_slice', rnd(3, 7)]], sound: 'wood' });
block('hay_block', 'Fardo de heno', { tex: T('hay_top', 'hay_side'), hardness: 0.5, tool: 'hoe', sound: 'grass' });
block('sponge', 'Esponja', { hardness: 0.6, tool: 'hoe', sound: 'grass' });
block('ladder', 'Escalera de mano', { render: 'box', box: [0, 0, 15, 16, 16, 16], solid: false, opaque: false, hardness: 0.4, tool: 'axe', climbable: true, orient: true, sound: 'wood' });
block('cobweb', 'Telaraña', { render: 'cross', hardness: 4, tool: 'sword', drops: () => [['string', 1]], slow: 0.15 });
block('short_grass', 'Hierba', { render: 'cross', hardness: 0, replaceable: true, tint: 'grass', drops: () => (Math.random() < 0.125 ? [['wheat_seeds', 1]] : []), sound: 'grass' });
block('fern', 'Helecho', { render: 'cross', hardness: 0, replaceable: true, tint: 'grass', drops: () => (Math.random() < 0.125 ? [['wheat_seeds', 1]] : []), sound: 'grass' });
block('dead_bush', 'Arbusto muerto', { render: 'cross', hardness: 0, replaceable: true, drops: () => [['stick', rnd(0, 2)]], sound: 'grass' });
for (const [f, n] of [['dandelion', 'Diente de león'], ['poppy', 'Amapola'], ['cornflower', 'Aciano'], ['blue_orchid', 'Orquídea azul'], ['allium', 'Allium'], ['oxeye_daisy', 'Margarita']]) block(f, n, { render: 'cross', hardness: 0, sound: 'grass' });
for (const [w, n] of [['oak', 'roble'], ['spruce', 'abeto'], ['birch', 'abedul']]) block(`${w}_sapling`, `Brote de ${n}`, { render: 'cross', hardness: 0, sound: 'grass' });
block('brown_mushroom', 'Champiñón marrón', { render: 'cross', hardness: 0, light: 1, sound: 'grass' });
block('red_mushroom', 'Champiñón rojo', { render: 'cross', hardness: 0, sound: 'grass' });
block('bed', 'Cama', { tex: T('bed_top', 'bed_side', 'oak_planks'), render: 'box', shape: 'bed', opaque: false, hardness: 0.2, orient: true, stack: 1, sound: 'wool' });
block('oak_door', 'Puerta de roble', { tex: 'door_bottom', render: 'box', shape: 'door', opaque: false, hardness: 3, tool: 'axe', orient: true, sound: 'wood' });
// Nether
block('netherrack', 'Netherrack', { hardness: 0.4, ...pick });
block('soul_sand', 'Arena de almas', { hardness: 0.5, tool: 'shovel', slow: 0.5, sound: 'sand' });
block('soul_soil', 'Tierra de almas', { hardness: 0.5, tool: 'shovel', sound: 'sand' });
block('glowstone', 'Piedra luminosa', { hardness: 0.3, light: 15, drops: () => [['glowstone_dust', rnd(2, 4)]], sound: 'glass' });
block('nether_portal', 'Portal del Nether', { anim: 3, render: 'portal', pass: 'translucent', solid: false, opaque: false, hardness: -1, light: 11, noItem: true, drops: null });
block('nether_quartz_ore', 'Mena de cuarzo del Nether', { hardness: 3, ...pick, drops: 'quartz' });
block('nether_gold_ore', 'Mena de oro del Nether', { hardness: 3, ...pick, drops: () => [['gold_nugget', rnd(2, 6)]] });
block('ancient_debris', 'Escombros ancestrales', { tex: T('ancient_debris_top', 'ancient_debris_side'), hardness: 30, ...pick, level: 3 });
block('nether_bricks', 'Ladrillos del Nether', { hardness: 2, ...pick });
block('red_nether_bricks', 'Ladrillos rojos del Nether', { hardness: 2, ...pick });
block('magma_block', 'Bloque de magma', { hardness: 0.5, ...pick, light: 3 });
block('basalt', 'Basalto', { tex: T('blackstone', 'basalt'), hardness: 1.25, ...pick });
block('blackstone', 'Piedra negra', { hardness: 1.5, ...pick });
block('nether_wart_block', 'Bloque de verruga del Nether', { hardness: 1, tool: 'hoe', sound: 'wood' });
block('crimson_nylium', 'Necilio carmesí', { tex: T('crimson_nylium', 'netherrack'), hardness: 0.4, ...pick, drops: 'netherrack' });
block('shroomlight', 'Brillongo', { hardness: 1, tool: 'hoe', light: 15, sound: 'wood' });
// End
block('end_stone', 'Piedra del End', { hardness: 3, ...pick });
block('end_stone_bricks', 'Ladrillos de piedra del End', { hardness: 3, ...pick });
block('end_portal_frame', 'Marco del portal del End', { tex: T('end_portal_frame_top', 'end_portal_frame_side', 'end_stone'), render: 'box', box: [0, 0, 0, 16, 13, 16], opaque: false, hardness: -1, light: 1 });
block('end_portal_frame_eye', 'Marco con ojo', { tex: T('end_portal_frame_top_eye', 'end_portal_frame_side', 'end_stone'), render: 'box', box: [0, 0, 0, 16, 13, 16], opaque: false, hardness: -1, light: 1, noItem: true });
block('end_portal', 'Portal del End', { render: 'box', box: [0, 0, 0, 16, 12, 16], pass: 'opaque', solid: false, opaque: false, hardness: -1, light: 15, noItem: true, drops: null });
block('purpur_block', 'Bloque de púrpur', { hardness: 1.5, ...pick });
block('dragon_egg', 'Huevo de dragón', { render: 'box', box: [2, 0, 2, 14, 16, 14], opaque: false, hardness: 3, light: 1 });
// Slabs, stairs, fences, panes
const SLAB_MATS = [
  ['oak', 'oak_planks', 'roble', 'wood'], ['spruce', 'spruce_planks', 'abeto', 'wood'], ['birch', 'birch_planks', 'abedul', 'wood'],
  ['jungle', 'jungle_planks', 'jungla', 'wood'], ['acacia', 'acacia_planks', 'acacia', 'wood'], ['stone', 'stone', 'piedra', 'stone'],
  ['cobblestone', 'cobblestone', 'roca', 'stone'], ['stone_brick', 'stone_bricks', 'ladrillos de piedra', 'stone'], ['brick', 'bricks', 'ladrillos', 'stone'],
  ['sandstone', 'sandstone', 'arenisca', 'stone'], ['smooth_stone', 'smooth_stone', 'piedra lisa', 'stone'], ['quartz', 'quartz_block', 'cuarzo', 'stone'],
  ['nether_brick', 'nether_bricks', 'ladrillos del Nether', 'stone'], ['purpur', 'purpur_block', 'púrpur', 'stone'],
];
export const SLAB_MATERIALS = SLAB_MATS;
for (const [k, baseName, n, snd] of SLAB_MATS) {
  const bb = BLOCKS[B[baseName]];
  const common = { tex: bb.tex, hardness: bb.hardness, tool: bb.tool, needsTool: bb.needsTool, level: bb.level, sound: snd, render: 'box', opaque: false, pass: 'opaque', flammable: bb.flammable };
  block(`${k}_slab`, `Losa de ${n}`, { ...common, shape: 'slab', base: baseName });
  if (k !== 'smooth_stone') block(`${k}_stairs`, `Escaleras de ${n}`, { ...common, shape: 'stairs', orient: true });
}
block('oak_fence', 'Valla de roble', { tex: 'oak_planks', render: 'box', shape: 'fence', opaque: false, pass: 'opaque', hardness: 2, tool: 'axe', flammable: true, sound: 'wood' });
block('spruce_fence', 'Valla de abeto', { tex: 'spruce_planks', render: 'box', shape: 'fence', opaque: false, pass: 'opaque', hardness: 2, tool: 'axe', flammable: true, sound: 'wood' });
block('nether_brick_fence', 'Valla de ladrillos del Nether', { tex: 'nether_bricks', render: 'box', shape: 'fence', opaque: false, pass: 'opaque', hardness: 2, tool: 'pickaxe', needsTool: true, sound: 'stone' });
block('glass_pane', 'Panel de cristal', { tex: 'glass', render: 'box', shape: 'pane', opaque: false, pass: 'cutout', hardness: 0.3, drops: null, sound: 'glass' });
block('iron_bars', 'Barrotes de hierro', { tex: 'iron_bars', render: 'box', shape: 'pane', opaque: false, pass: 'cutout', hardness: 5, tool: 'pickaxe', needsTool: true });
block('lantern', 'Farol', { tex: T('lantern_top', 'lantern'), render: 'box', box: [5, 0, 5, 11, 9, 11], opaque: false, hardness: 3.5, tool: 'pickaxe', light: 15, sound: 'stone' });
// Work stations (also villager job sites)
block('enchanting_table', 'Mesa de encantamientos', { tex: T('enchanting_table_top', 'enchanting_table_side', 'obsidian'), render: 'box', box: [0, 0, 0, 16, 12, 16], opaque: false, hardness: 5, tool: 'pickaxe', needsTool: true, light: 7 });
block('anvil', 'Yunque', { tex: T('anvil_top', 'anvil'), render: 'box', box: [2, 0, 3, 14, 16, 13], opaque: false, hardness: 5, tool: 'pickaxe', needsTool: true, orient: true, gravity: true });
block('brewing_stand', 'Soporte para pociones', { tex: T('brewing_stand_top', 'brewing_stand'), render: 'box', box: [2, 0, 2, 14, 14, 14], pass: 'cutout', opaque: false, hardness: 0.5, tool: 'pickaxe', light: 1 });
block('cauldron', 'Caldero', { tex: T('cauldron_top', 'cauldron_side', 'cauldron_side'), render: 'box', box: [0, 0, 0, 16, 16, 16], pass: 'cutout', opaque: false, hardness: 2, tool: 'pickaxe', needsTool: true });
block('grindstone', 'Afiladora', { tex: T('grindstone_top', 'grindstone'), render: 'box', box: [2, 0, 4, 14, 14, 12], opaque: false, hardness: 2, tool: 'pickaxe', orient: true });
block('smithing_table', 'Mesa de herrería', { tex: T('smithing_table_top', 'smithing_table_side', 'smithing_table_bottom'), hardness: 2.5, tool: 'axe', sound: 'wood' });
block('stonecutter', 'Cortapiedras', { tex: T('stonecutter_top', 'stonecutter_side', 'smooth_stone'), render: 'box', box: [0, 0, 0, 16, 9, 16], opaque: false, hardness: 3.5, tool: 'pickaxe' });
block('loom', 'Telar', { tex: T('loom_top', 'loom_side', 'oak_planks', 'loom_front'), hardness: 2.5, tool: 'axe', orient: true, sound: 'wood' });
block('cartography_table', 'Mesa de cartografía', { tex: T('cartography_top', 'cartography_side', 'dark_planks'), hardness: 2.5, tool: 'axe', sound: 'wood' });
block('fletching_table', 'Mesa de flechería', { tex: T('fletching_top', 'fletching_side', 'birch_planks'), hardness: 2.5, tool: 'axe', sound: 'wood' });
block('smoker', 'Ahumador', { tex: T('smoker_top', 'smoker_side', 'smoker_top', 'smoker_front'), hardness: 3.5, tool: 'pickaxe', needsTool: true, orient: true });
block('lit_smoker', 'Ahumador encendido', { tex: T('smoker_top', 'smoker_side', 'smoker_top', 'smoker_front_on'), hardness: 3.5, tool: 'pickaxe', needsTool: true, orient: true, light: 13, drops: 'smoker', noItem: true });
block('blast_furnace', 'Alto horno', { tex: T('blast_top', 'blast_side', 'blast_top', 'blast_front'), hardness: 3.5, tool: 'pickaxe', needsTool: true, orient: true });
block('lit_blast_furnace', 'Alto horno encendido', { tex: T('blast_top', 'blast_side', 'blast_top', 'blast_front_on'), hardness: 3.5, tool: 'pickaxe', needsTool: true, orient: true, light: 13, drops: 'blast_furnace', noItem: true });
block('barrel', 'Barril', { tex: T('barrel_top', 'barrel_side', 'barrel_bottom'), hardness: 2.5, tool: 'axe', sound: 'wood' });
block('composter', 'Compostador', { tex: T('composter_top', 'composter_side', 'composter_bottom'), render: 'box', box: [0, 0, 0, 16, 16, 16], pass: 'cutout', opaque: false, hardness: 0.6, tool: 'axe', sound: 'wood' });
block('lectern', 'Atril', { tex: T('lectern_top', 'lectern_side', 'oak_planks'), render: 'box', box: [0, 0, 0, 16, 14, 16], opaque: false, hardness: 2.5, tool: 'axe', orient: true, sound: 'wood' });
for (let i = 0; i < 4; i++) block(`nether_wart_${i}`, 'Verruga del Nether', { render: 'cross', hardness: 0, noItem: true, sound: 'grass', drops: () => [['nether_wart', i === 3 ? 2 + Math.floor(Math.random() * 3) : 1]] });
// Redstone
block('redstone_wire', 'Polvo de redstone', { tex: 'redstone_dust', render: 'box', shape: 'wire', pass: 'cutout', solid: false, opaque: false, hardness: 0, noItem: true, drops: 'redstone' });
block('redstone_torch', 'Antorcha de redstone', { tex: 'redstone_torch', render: 'box', shape: 'torch', solid: false, opaque: false, hardness: 0, light: 7, sound: 'wood' });
block('unlit_redstone_torch', 'Antorcha de redstone', { tex: 'redstone_torch_off', render: 'box', shape: 'torch', solid: false, opaque: false, hardness: 0, noItem: true, drops: 'redstone_torch', sound: 'wood' });
block('lever', 'Palanca', { tex: 'lever', render: 'box', shape: 'lever', solid: false, opaque: false, hardness: 0.5, sound: 'wood' });
block('stone_button', 'Botón de piedra', { tex: 'stone', render: 'box', shape: 'button', solid: false, opaque: false, hardness: 0.5 });
block('oak_button', 'Botón de roble', { tex: 'oak_planks', render: 'box', shape: 'button', solid: false, opaque: false, hardness: 0.5, sound: 'wood' });
block('stone_pressure_plate', 'Placa de presión de piedra', { tex: 'stone', render: 'box', shape: 'plate', solid: false, opaque: false, hardness: 0.5, tool: 'pickaxe' });
block('oak_pressure_plate', 'Placa de presión de roble', { tex: 'oak_planks', render: 'box', shape: 'plate', solid: false, opaque: false, hardness: 0.5, tool: 'axe', sound: 'wood' });
block('repeater', 'Repetidor de redstone', { tex: T('repeater', 'smooth_stone'), render: 'box', box: [0, 0, 0, 16, 2, 16], opaque: false, hardness: 0, orient: true, topRot: true });
block('powered_repeater', 'Repetidor de redstone', { tex: T('repeater_on', 'smooth_stone'), render: 'box', box: [0, 0, 0, 16, 2, 16], opaque: false, hardness: 0, orient: true, topRot: true, noItem: true, drops: 'repeater', light: 7 });
block('comparator', 'Comparador de redstone', { tex: T('comparator', 'smooth_stone'), render: 'box', box: [0, 0, 0, 16, 2, 16], opaque: false, hardness: 0, orient: true, topRot: true });
block('redstone_lamp', 'Lámpara de redstone', { hardness: 0.3, sound: 'glass' });
block('lit_redstone_lamp', 'Lámpara de redstone', { tex: 'redstone_lamp_on', hardness: 0.3, light: 15, noItem: true, drops: 'redstone_lamp', sound: 'glass' });
block('piston', 'Pistón', { tex: { top: 'piston_top', side: 'piston_side', bottom: 'piston_bottom', front: 'piston_top', back: 'piston_bottom' }, render: 'box', shape: 'piston', facing6: true, opaque: false, hardness: 1.5, tool: 'pickaxe' });
block('sticky_piston', 'Pistón pegajoso', { tex: { top: 'piston_top_sticky', side: 'piston_side', bottom: 'piston_bottom', front: 'piston_top_sticky', back: 'piston_bottom' }, render: 'box', shape: 'piston', facing6: true, opaque: false, hardness: 1.5, tool: 'pickaxe' });
block('piston_head', 'Cabeza de pistón', { tex: { top: 'piston_top', side: 'piston_side', bottom: 'piston_top', front: 'piston_top', back: 'piston_top' }, render: 'box', shape: 'piston_head', facing6: true, opaque: false, hardness: 1.5, noItem: true, drops: null });
block('observer', 'Observador', { tex: { top: 'observer_top', side: 'observer_side', bottom: 'observer_top', front: 'observer_front', back: 'observer_back' }, facing6: true, hardness: 3, tool: 'pickaxe', needsTool: true });
block('dispenser', 'Dispensador', { tex: { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top', front: 'dispenser_front', back: 'furnace_side' }, facing6: true, hardness: 3.5, tool: 'pickaxe', needsTool: true });
block('dropper', 'Soltador', { tex: { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top', front: 'dropper_front', back: 'furnace_side' }, facing6: true, hardness: 3.5, tool: 'pickaxe', needsTool: true });
block('hopper', 'Tolva', { tex: T('hopper_top', 'hopper_side'), render: 'box', shape: 'hopper', opaque: false, hardness: 3, tool: 'pickaxe', needsTool: true });
block('note_block', 'Bloque musical', { hardness: 0.8, tool: 'axe', sound: 'wood' });
block('daylight_detector', 'Sensor de luz solar', { tex: T('daylight_top', 'daylight_side'), render: 'box', box: [0, 0, 0, 16, 6, 16], opaque: false, hardness: 0.2, tool: 'axe', sound: 'wood' });
block('target', 'Diana', { tex: T('target_top', 'target_side'), hardness: 0.5, tool: 'hoe', sound: 'grass' });
block('iron_door', 'Puerta de hierro', { tex: 'iron_door_bottom', render: 'box', shape: 'door', opaque: false, hardness: 5, tool: 'pickaxe', needsTool: true, orient: true });
block('rail', 'Raíl', { tex: 'rail', render: 'box', shape: 'rail', pass: 'cutout', solid: false, opaque: false, hardness: 0.7, tool: 'pickaxe' });
block('powered_rail', 'Raíl propulsor', { tex: 'powered_rail', render: 'box', shape: 'rail', pass: 'cutout', solid: false, opaque: false, hardness: 0.7, tool: 'pickaxe' });
block('detector_rail', 'Raíl detector', { tex: 'detector_rail', render: 'box', shape: 'rail', pass: 'cutout', solid: false, opaque: false, hardness: 0.7, tool: 'pickaxe' });
block('activator_rail', 'Raíl activador', { tex: 'activator_rail', render: 'box', shape: 'rail', pass: 'cutout', solid: false, opaque: false, hardness: 0.7, tool: 'pickaxe' });
block('spawner', 'Generador de monstruos', { render: 'cube', pass: 'cutout', opaque: false, hardness: 5, tool: 'pickaxe', needsTool: true, drops: null, light: 0 });
block('path', 'Camino de tierra', { tex: T('path_top', 'path_side', 'dirt'), render: 'box', box: [0, 0, 0, 16, 15, 16], pass: 'opaque', opaque: false, hardness: 0.65, tool: 'shovel', drops: 'dirt', sound: 'grass' });
block('fire', 'Fuego', { render: 'cross', solid: false, opaque: false, hardness: 0, noItem: true, drops: null, light: 15, replaceable: true });


// ---------------------------------------------------------------- items
let nextItemId = BLOCK_LIMIT;
function item(name, display, p = {}) {
  const id = nextItemId++;
  const def = { id, name, display, stack: p.stack ?? 64, kind: p.kind ?? 'item', ...p };
  ITEMS[id] = def; I[name] = id;
  return def;
}

const TIERS = {
  wooden: { level: 0, speed: 2, dur: 59, n: 'madera' }, stone: { level: 1, speed: 4, dur: 131, n: 'piedra' },
  iron: { level: 2, speed: 6, dur: 250, n: 'hierro' }, golden: { level: 0, speed: 12, dur: 32, n: 'oro' },
  diamond: { level: 3, speed: 8, dur: 1561, n: 'diamante' }, netherite: { level: 4, speed: 9, dur: 2031, n: 'netherita' },
};
const DMG = {
  sword: { wooden: 4, stone: 5, iron: 6, golden: 4, diamond: 7, netherite: 8 },
  axe: { wooden: 7, stone: 9, iron: 9, golden: 7, diamond: 9, netherite: 10 },
  pickaxe: { wooden: 2, stone: 3, iron: 4, golden: 2, diamond: 5, netherite: 6 },
  shovel: { wooden: 2.5, stone: 3.5, iron: 4.5, golden: 2.5, diamond: 5.5, netherite: 6.5 },
  hoe: { wooden: 1, stone: 1, iron: 1, golden: 1, diamond: 1, netherite: 1 },
};
const TOOL_N = { pickaxe: 'Pico', axe: 'Hacha', shovel: 'Pala', sword: 'Espada', hoe: 'Azada' };
for (const kind of ['sword', 'pickaxe', 'axe', 'shovel', 'hoe']) for (const [m, t] of Object.entries(TIERS)) {
  item(`${m}_${kind}`, `${TOOL_N[kind]} de ${t.n}`, { kind: 'tool', stack: 1, toolType: kind, level: t.level, speed: t.speed, durability: t.dur, damage: DMG[kind][m] });
}
const ARMOR = {
  leather: { p: [1, 3, 2, 1], dur: 5, n: 'cuero' }, chainmail: { p: [2, 5, 4, 1], dur: 15, n: 'malla' },
  iron: { p: [2, 6, 5, 2], dur: 15, n: 'hierro' }, golden: { p: [2, 5, 3, 1], dur: 7, n: 'oro' },
  diamond: { p: [3, 8, 6, 3], dur: 33, n: 'diamante' }, netherite: { p: [3, 8, 6, 3], dur: 37, n: 'netherita' },
};
const ARMOR_N = { helmet: 'Casco', chestplate: 'Peto', leggings: 'Grebas', boots: 'Botas' };
['helmet', 'chestplate', 'leggings', 'boots'].forEach((slot, si) => {
  for (const [m, a] of Object.entries(ARMOR)) item(`${m}_${slot}`, `${ARMOR_N[slot]} de ${a.n}`, { kind: 'armor', stack: 1, slot: si, armor: a.p[si], durability: a.dur * [11, 16, 15, 13][si] });
});

const simple = [
  ['stick', 'Palo'], ['coal', 'Carbón'], ['charcoal', 'Carbón vegetal'], ['iron_ingot', 'Lingote de hierro'], ['gold_ingot', 'Lingote de oro'],
  ['copper_ingot', 'Lingote de cobre'], ['netherite_ingot', 'Lingote de netherita'], ['netherite_scrap', 'Fragmento de netherita'], ['raw_iron', 'Hierro en bruto'], ['raw_gold', 'Oro en bruto'],
  ['raw_copper', 'Cobre en bruto'], ['gold_nugget', 'Pepita de oro'], ['iron_nugget', 'Pepita de hierro'], ['diamond', 'Diamante'], ['emerald', 'Esmeralda'],
  ['quartz', 'Cuarzo del Nether'], ['lapis_lazuli', 'Lapislázuli'], ['redstone', 'Polvo de redstone'], ['glowstone_dust', 'Polvo de piedra luminosa'],
  ['gunpowder', 'Pólvora'], ['sugar', 'Azúcar'], ['blaze_powder', 'Polvo de blaze'], ['bone_meal', 'Polvo de hueso'], ['flint', 'Pedernal'],
  ['wheat', 'Trigo'], ['wheat_seeds', 'Semillas de trigo'], ['egg', 'Huevo', { stack: 16 }], ['feather', 'Pluma'], ['leather', 'Cuero'], ['string', 'Cuerda'],
  ['bone', 'Hueso'], ['arrow', 'Flecha'], ['ender_pearl', 'Perla de ender', { stack: 16 }], ['ender_eye', 'Ojo de ender'], ['blaze_rod', 'Vara de blaze'],
  ['ghast_tear', 'Lágrima de ghast'], ['slime_ball', 'Bola de slime'], ['paper', 'Papel'], ['book', 'Libro'], ['snowball', 'Bola de nieve', { stack: 16 }],
  ['clay_ball', 'Bola de arcilla'], ['brick', 'Ladrillo'], ['nether_brick', 'Ladrillo del Nether'], ['bowl', 'Cuenco'], ['compass', 'Brújula'],
  ['clock', 'Reloj'], ['saddle', 'Montura', { stack: 1 }], ['ink_sac', 'Saco de tinta'], ['totem', 'Tótem de la inmortalidad', { stack: 1 }],
];
for (const [n, d, p] of simple) item(n, d, p);
item('bow', 'Arco', { kind: 'tool', stack: 1, toolType: 'bow', durability: 384, damage: 1 });
item('shears', 'Tijeras', { kind: 'tool', stack: 1, toolType: 'shears', durability: 238, speed: 5, level: 0, damage: 1 });
item('flint_and_steel', 'Mechero de pedernal', { kind: 'tool', stack: 1, toolType: 'fns', durability: 64, damage: 1 });
item('bucket', 'Cubo', { stack: 16 });
item('water_bucket', 'Cubo de agua', { stack: 1 });
item('lava_bucket', 'Cubo de lava', { stack: 1 });
item('milk_bucket', 'Cubo de leche', { stack: 1, food: [0, 0], milk: true });
item('glass_bottle', 'Frasco de cristal');
for (const [w, n] of [['oak', 'roble'], ['spruce', 'abeto'], ['birch', 'abedul'], ['jungle', 'jungla'], ['acacia', 'acacia']]) item(`${w}_boat`, `Barca de ${n}`, { stack: 1, boat: w });
item('minecart', 'Vagoneta', { stack: 1 });
item('fishing_rod', 'Caña de pescar', { kind: 'tool', stack: 1, toolType: 'rod', durability: 64, damage: 1 });
item('elytra', 'Élitros', { kind: 'armor', stack: 1, slot: 1, armor: 0, durability: 432 });
item('firework_rocket', 'Cohete de fuegos artificiales');
item('carrot_on_a_stick', 'Caña con zanahoria', { kind: 'tool', stack: 1, toolType: 'carrot_stick', durability: 25 });
item('lead', 'Rienda');
item('potion', 'Poción', { stack: 1, kind: 'potion' });
item('splash_potion', 'Poción arrojadiza', { stack: 1, kind: 'potion', splash: true });
item('experience_bottle', 'Frasco de experiencia');
item('enchanted_book', 'Libro encantado', { stack: 1 });
item('name_tag', 'Etiqueta');
for (const [n, d] of [['nether_wart', 'Verruga del Nether'], ['spider_eye', 'Ojo de araña'], ['fermented_spider_eye', 'Ojo de araña fermentado'], ['glistering_melon_slice', 'Rodaja de sandía reluciente'], ['magma_cream', 'Crema de magma'], ['rabbit_foot', 'Pata de conejo'], ['phantom_membrane', 'Membrana de phantom'], ['turtle_scute', 'Escama de tortuga'], ['lapis_dummy', 'x']]) if (n !== 'lapis_dummy') item(n, d);
item('golden_carrot', 'Zanahoria dorada', { food: [6, 14.4] });
const FOOD = [
  ['apple', 'Manzana', 4, 2.4], ['golden_apple', 'Manzana dorada', 4, 9.6], ['bread', 'Pan', 5, 6], ['porkchop', 'Chuleta de cerdo cruda', 3, 1.8],
  ['cooked_porkchop', 'Chuleta de cerdo cocinada', 8, 12.8], ['beef', 'Filete crudo', 3, 1.8], ['cooked_beef', 'Filete', 8, 12.8],
  ['chicken', 'Pollo crudo', 2, 1.2], ['cooked_chicken', 'Pollo asado', 6, 7.2], ['mutton', 'Cordero crudo', 2, 1.2], ['cooked_mutton', 'Cordero asado', 6, 9.6],
  ['rotten_flesh', 'Carne podrida', 4, 0.8], ['carrot', 'Zanahoria', 3, 3.6], ['potato', 'Patata', 1, 0.6], ['baked_potato', 'Patata asada', 5, 6],
  ['melon_slice', 'Rodaja de sandía', 2, 1.2], ['cod', 'Bacalao crudo', 2, 0.4], ['cooked_cod', 'Bacalao asado', 5, 6], ['salmon', 'Salmón crudo', 2, 0.4], ['cooked_salmon', 'Salmón asado', 6, 9.6], ['tropical_fish', 'Pez tropical', 1, 0.2], ['pufferfish', 'Pez globo', 1, 0.2], ['rabbit', 'Conejo crudo', 3, 1.8], ['cooked_rabbit', 'Conejo asado', 5, 6], ['cookie', 'Galleta', 2, 0.4], ['pumpkin_pie', 'Pastel de calabaza', 8, 4.8], ['sweet_berries', 'Bayas dulces', 2, 0.4], ['dried_kelp', 'Alga seca', 1, 0.6], ['beetroot', 'Remolacha', 1, 1.2], ['honey_bottle', 'Frasco de miel', 6, 1.2], ['mushroom_stew', 'Estofado de champiñones', 6, 7.2],
];
for (const [n, d, h, s] of FOOD) item(n, d, { food: [h, s], stack: n === 'mushroom_stew' ? 1 : 64 });
const MOB_N = {
  pig: 'cerdo', cow: 'vaca', sheep: 'oveja', chicken: 'gallina', wolf: 'lobo', horse: 'caballo', villager: 'aldeano', zombie: 'zombi',
  skeleton: 'esqueleto', creeper: 'creeper', spider: 'araña', enderman: 'enderman', slime: 'slime', zombified_piglin: 'necrófago de ceniza',
  ghast: 'ghast', blaze: 'blaze', ender_dragon: 'dragón del End', iron_golem: 'gólem de hierro', witch: 'bruja',
};
for (const m of Object.keys(SPAWN_EGG_COLORS)) item(`${m}_spawn_egg`, `Huevo generador de ${MOB_N[m]}`, { spawnEgg: m });

// helpers
export function itemDef(id) { return ITEMS[id]; }
export function isBlockItem(id) { return id < BLOCK_LIMIT && !!BLOCKS[id]; }
export function maxStack(id) { return ITEMS[id]?.stack ?? 64; }
// Two stacks can merge when same item, undamaged and with identical extra data (enchantments, potion, name)
export function sameKind(a, b) {
  if (!a || !b || a.id !== b.id || a.dmg || b.dmg) return false;
  return JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null);
}
export function copyStack(s, count = s?.count) { return s ? { id: s.id, count, dmg: s.dmg ?? 0, ...(s.data ? { data: JSON.parse(JSON.stringify(s.data)) } : {}) } : null; }

// ---------------------------------------------------------------- recipes
const TAGS = {
  planks: ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks'],
  log: ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log'],
  wool: Object.keys(WOOL_COLORS).map((c) => c + '_wool'),
  coals: ['coal', 'charcoal'],
  stone_mat: ['cobblestone', 'blackstone'],
};
const matchIng = (ing, id) => {
  if (id == null || id === 0) return ing == null;
  if (ing == null) return false;
  const name = ITEMS[id]?.name;
  if (ing.startsWith('#')) return TAGS[ing.slice(1)].includes(name);
  return ing === name;
};

export const RECIPES = [];
function shaped(result, count, pattern, key) { RECIPES.push({ type: 'shaped', result, count, pattern, key }); }
function shapeless(result, count, ings) { RECIPES.push({ type: 'shapeless', result, count, ings }); }

for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia']) shapeless(`${w}_planks`, 4, [`${w}_log`]);
shaped('stick', 4, ['#', '#'], { '#': '#planks' });
shaped('crafting_table', 1, ['##', '##'], { '#': '#planks' });
shaped('torch', 4, ['c', 's'], { c: '#coals', s: 'stick' });
shaped('soul_torch', 4, ['c', 's', 'o'], { c: '#coals', s: 'stick', o: 'soul_sand' });
const TOOL_MAT = { wooden: '#planks', stone: '#stone_mat', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
for (const [m, mat] of Object.entries(TOOL_MAT)) {
  shaped(`${m}_pickaxe`, 1, ['###', ' s ', ' s '], { '#': mat, s: 'stick' });
  shaped(`${m}_axe`, 1, ['##', '#s', ' s'], { '#': mat, s: 'stick' });
  shaped(`${m}_shovel`, 1, ['#', 's', 's'], { '#': mat, s: 'stick' });
  shaped(`${m}_sword`, 1, ['#', '#', 's'], { '#': mat, s: 'stick' });
  shaped(`${m}_hoe`, 1, ['##', ' s', ' s'], { '#': mat, s: 'stick' });
}
const ARMOR_MAT = { leather: 'leather', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
for (const [m, mat] of Object.entries(ARMOR_MAT)) {
  shaped(`${m}_helmet`, 1, ['###', '# #'], { '#': mat });
  shaped(`${m}_chestplate`, 1, ['# #', '###', '###'], { '#': mat });
  shaped(`${m}_leggings`, 1, ['###', '# #', '# #'], { '#': mat });
  shaped(`${m}_boots`, 1, ['# #', '# #'], { '#': mat });
}
shapeless('netherite_ingot', 1, ['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot']);
shaped('furnace', 1, ['###', '# #', '###'], { '#': '#stone_mat' });
shaped('chest', 1, ['###', '# #', '###'], { '#': '#planks' });
shaped('bow', 1, [' s#', 's #', ' s#'], { s: 'stick', '#': 'string' });
shaped('arrow', 4, ['f', 's', 'e'], { f: 'flint', s: 'stick', e: 'feather' });
shaped('bucket', 1, ['# #', ' # '], { '#': 'iron_ingot' });
shapeless('flint_and_steel', 1, ['iron_ingot', 'flint']);
shaped('shears', 1, [' #', '# '], { '#': 'iron_ingot' });
shaped('bread', 1, ['###'], { '#': 'wheat' });
shaped('golden_apple', 1, ['###', '#a#', '###'], { '#': 'gold_ingot', a: 'apple' });
const STORAGE = [['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'], ['coal_block', 'coal'], ['redstone_block', 'redstone'], ['lapis_block', 'lapis_lazuli'], ['copper_block', 'copper_ingot'], ['hay_block', 'wheat']];
for (const [b, i] of STORAGE) { shaped(b, 1, ['###', '###', '###'], { '#': i }); shapeless(i, 9, [b]); }
shaped('gold_ingot', 1, ['###', '###', '###'], { '#': 'gold_nugget' });
shaped('iron_ingot', 1, ['###', '###', '###'], { '#': 'iron_nugget' });
shapeless('gold_nugget', 9, ['gold_ingot']);
shapeless('iron_nugget', 9, ['iron_ingot']);
shaped('tnt', 1, ['g#g', '#g#', 'g#g'], { g: 'gunpowder', '#': 'sand' });
shaped('bookshelf', 1, ['###', 'bbb', '###'], { '#': '#planks', b: 'book' });
shapeless('book', 1, ['paper', 'paper', 'paper', 'leather']);
shaped('paper', 3, ['###'], { '#': 'sugar_cane' });
shapeless('sugar', 1, ['sugar_cane']);
shaped('stone_bricks', 4, ['##', '##'], { '#': 'stone' });
shaped('bricks', 1, ['##', '##'], { '#': 'brick' });
shaped('nether_bricks', 1, ['##', '##'], { '#': 'nether_brick' });
shaped('sandstone', 1, ['##', '##'], { '#': 'sand' });
shaped('snow_block', 1, ['##', '##'], { '#': 'snowball' });
shaped('snow', 6, ['###'], { '#': 'snow_block' });
shaped('clay', 1, ['##', '##'], { '#': 'clay_ball' });
shaped('glowstone', 1, ['##', '##'], { '#': 'glowstone_dust' });
shaped('quartz_block', 1, ['##', '##'], { '#': 'quartz' });
shaped('end_stone_bricks', 4, ['##', '##'], { '#': 'end_stone' });
shaped('white_wool', 1, ['##', '##'], { '#': 'string' });
shaped('bed', 1, ['www', '###'], { w: '#wool', '#': '#planks' });
shaped('oak_door', 3, ['##', '##', '##'], { '#': '#planks' });
for (const [k, baseName] of SLAB_MATS) {
  shaped(`${k}_slab`, 6, ['###'], { '#': baseName });
  if (k !== 'smooth_stone') shaped(`${k}_stairs`, 4, ['#  ', '## ', '###'], { '#': baseName });
}
shaped('oak_fence', 3, ['#s#', '#s#'], { '#': 'oak_planks', s: 'stick' });
shaped('spruce_fence', 3, ['#s#', '#s#'], { '#': 'spruce_planks', s: 'stick' });
shaped('nether_brick_fence', 6, ['###', '###'], { '#': 'nether_bricks' });
shaped('glass_pane', 16, ['###', '###'], { '#': 'glass' });
shaped('iron_bars', 16, ['###', '###'], { '#': 'iron_ingot' });
shaped('lantern', 1, ['nnn', 'ntn', 'nnn'], { n: 'iron_nugget', t: 'torch' });
shaped('redstone_torch', 1, ['r', 's'], { r: 'redstone', s: 'stick' });
shaped('lever', 1, ['s', 'c'], { s: 'stick', c: 'cobblestone' });
shaped('stone_button', 1, ['s'], { s: 'stone' });
shaped('oak_button', 1, ['p'], { p: 'oak_planks' });
shaped('stone_pressure_plate', 1, ['ss'], { s: 'stone' });
shaped('oak_pressure_plate', 1, ['pp'], { p: 'oak_planks' });
shaped('repeater', 1, ['trt', 'sss'], { t: 'redstone_torch', r: 'redstone', s: 'stone' });
shaped('comparator', 1, [' t ', 'tqt', 'sss'], { t: 'redstone_torch', q: 'quartz', s: 'stone' });
shaped('redstone_lamp', 1, [' r ', 'rgr', ' r '], { r: 'redstone', g: 'glowstone' });
shaped('piston', 1, ['ppp', 'cic', 'crc'], { p: '#planks', c: 'cobblestone', i: 'iron_ingot', r: 'redstone' });
shaped('sticky_piston', 1, ['s', 'p'], { s: 'slime_ball', p: 'piston' });
shaped('observer', 1, ['ccc', 'rrq', 'ccc'], { c: 'cobblestone', r: 'redstone', q: 'quartz' });
shaped('dispenser', 1, ['ccc', 'cbc', 'crc'], { c: 'cobblestone', b: 'bow', r: 'redstone' });
shaped('dropper', 1, ['ccc', 'c c', 'crc'], { c: 'cobblestone', r: 'redstone' });
shaped('hopper', 1, ['i i', 'ici', ' i '], { i: 'iron_ingot', c: 'chest' });
shaped('note_block', 1, ['ppp', 'prp', 'ppp'], { p: '#planks', r: 'redstone' });
shaped('daylight_detector', 1, ['ggg', 'qqq', 'sss'], { g: 'glass', q: 'quartz', s: 'oak_slab' });
shaped('target', 1, [' r ', 'rhr', ' r '], { r: 'redstone', h: 'hay_block' });
shaped('iron_door', 3, ['ii', 'ii', 'ii'], { i: 'iron_ingot' });
shaped('enchanting_table', 1, [' b ', 'dod', 'ooo'], { b: 'book', d: 'diamond', o: 'obsidian' });
shaped('anvil', 1, ['BBB', ' i ', 'iii'], { B: 'iron_block', i: 'iron_ingot' });
shaped('brewing_stand', 1, [' r ', 'ccc'], { r: 'blaze_rod', c: '#stone_mat' });
shaped('cauldron', 1, ['i i', 'i i', 'iii'], { i: 'iron_ingot' });
shaped('grindstone', 1, ['sSs', 'p p'], { s: 'stick', S: 'stone_slab', p: '#planks' });
shaped('smithing_table', 1, ['ii', 'pp', 'pp'], { i: 'iron_ingot', p: '#planks' });
shaped('stonecutter', 1, [' i ', 'sss'], { i: 'iron_ingot', s: 'stone' });
shaped('loom', 1, ['ss', 'pp'], { s: 'string', p: '#planks' });
shaped('cartography_table', 1, ['aa', 'pp', 'pp'], { a: 'paper', p: '#planks' });
shaped('fletching_table', 1, ['ff', 'pp', 'pp'], { f: 'flint', p: '#planks' });
shaped('smoker', 1, [' l ', 'lfl', ' l '], { l: '#log', f: 'furnace' });
shaped('blast_furnace', 1, ['iii', 'ifi', 'sss'], { i: 'iron_ingot', f: 'furnace', s: 'smooth_stone' });
shaped('barrel', 1, ['psp', 'p p', 'psp'], { p: '#planks', s: 'oak_slab' });
shaped('composter', 1, ['s s', 's s', 'sss'], { s: 'oak_slab' });
shaped('lectern', 1, ['sss', ' b ', ' s '], { s: 'oak_slab', b: 'bookshelf' });
shaped('glass_bottle', 3, ['g g', ' g '], { g: 'glass' });
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia']) shaped(`${w}_boat`, 1, ['p p', 'ppp'], { p: `${w}_planks` });
shaped('minecart', 1, ['i i', 'iii'], { i: 'iron_ingot' });
shaped('rail', 16, ['i i', 'isi', 'i i'], { i: 'iron_ingot', s: 'stick' });
shaped('powered_rail', 6, ['g g', 'gsg', 'grg'], { g: 'gold_ingot', s: 'stick', r: 'redstone' });
shaped('detector_rail', 6, ['i i', 'ipi', 'iri'], { i: 'iron_ingot', p: 'stone_pressure_plate', r: 'redstone' });
shaped('activator_rail', 6, ['isi', 'iti', 'isi'], { i: 'iron_ingot', s: 'stick', t: 'redstone_torch' });
shaped('fishing_rod', 1, ['  s', ' sx', 's x'], { s: 'stick', x: 'string' });
shapeless('firework_rocket', 3, ['paper', 'gunpowder']);
shapeless('carrot_on_a_stick', 1, ['fishing_rod', 'carrot']);
shaped('lead', 2, ['ss ', 'sb ', '  s'], { s: 'string', b: 'slime_ball' });
shapeless('pumpkin_pie', 1, ['pumpkin', 'sugar', 'egg']);
shapeless('fermented_spider_eye', 1, ['spider_eye', 'brown_mushroom', 'sugar']);
shaped('glistering_melon_slice', 1, ['nnn', 'nmn', 'nnn'], { n: 'gold_nugget', m: 'melon_slice' });
shapeless('magma_cream', 1, ['blaze_powder', 'slime_ball']);
shaped('golden_carrot', 1, ['nnn', 'ncn', 'nnn'], { n: 'gold_nugget', c: 'carrot' });
shaped('name_tag', 1, [' s', 'p '], { s: 'string', p: 'paper' });
shaped('ladder', 3, ['s s', 'sss', 's s'], { s: 'stick' });
shapeless('jack_o_lantern', 1, ['pumpkin', 'torch']);
shapeless('bone_meal', 3, ['bone']);
shapeless('blaze_powder', 2, ['blaze_rod']);
shapeless('ender_eye', 1, ['ender_pearl', 'blaze_powder']);
shapeless('mossy_cobblestone', 1, ['cobblestone', 'short_grass']);
shaped('bowl', 4, ['# #', ' # '], { '#': '#planks' });
shapeless('mushroom_stew', 1, ['bowl', 'brown_mushroom', 'red_mushroom']);
shaped('compass', 1, [' i ', 'iri', ' i '], { i: 'iron_ingot', r: 'redstone' });
shaped('clock', 1, [' i ', 'iri', ' i '], { i: 'gold_ingot', r: 'redstone' });
shapeless('wheat_seeds', 1, ['wheat']);
shaped('melon', 1, ['###', '###', '###'], { '#': 'melon_slice' });
shaped('purpur_block', 4, ['##', '##'], { '#': 'end_stone_bricks' });
const DYES = { red: 'poppy', yellow: 'dandelion', blue: 'cornflower', light_blue: 'blue_orchid', magenta: 'allium', light_gray: 'oxeye_daisy', black: 'ink_sac', white: 'bone_meal', green: 'cactus' };
for (const [c, src] of Object.entries(DYES)) if (c !== 'white') shapeless(`${c}_wool`, 1, ['white_wool', src]);

// Normalize a grid (size n x n of item ids or 0) to its bounding box.
function trimGrid(grid, n) {
  let minX = n, minY = n, maxX = -1, maxY = -1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (grid[y * n + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (maxX < 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1, out = [];
  for (let y = 0; y < h; y++) { const row = []; for (let x = 0; x < w; x++) row.push(grid[(y + minY) * n + x + minX]); out.push(row); }
  return out;
}

export function matchRecipe(grid, n) {
  const g = trimGrid(grid, n);
  if (!g) return null;
  const h = g.length, w = g[0].length;
  const flat = g.flat().filter((v) => v);
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.ings.length !== flat.length) continue;
      const used = new Array(flat.length).fill(false);
      let ok = true;
      for (const ing of r.ings) {
        let found = false;
        for (let i = 0; i < flat.length; i++) if (!used[i] && matchIng(ing, flat[i])) { used[i] = true; found = true; break; }
        if (!found) { ok = false; break; }
      }
      if (ok) return { id: I[r.result], count: r.count };
    } else {
      const pat = r.pattern;
      const ph = pat.length, pw = Math.max(...pat.map((p) => p.length));
      if (ph !== h || pw !== w) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
          const ch = pat[y][mirror ? w - 1 - x : x] ?? ' ';
          const ing = ch === ' ' ? null : r.key[ch];
          if (!matchIng(ing, g[y][x])) ok = false;
        }
        if (ok) return { id: I[r.result], count: r.count };
      }
    }
  }
  return null;
}

export const SMOKER_OK = new Set(['porkchop', 'beef', 'chicken', 'mutton', 'potato', 'cod', 'salmon', 'rabbit', 'kelp']);
export const SMELTING = {
  raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_copper: 'copper_ingot', iron_ore: 'iron_ingot', gold_ore: 'gold_ingot', copper_ore: 'copper_ingot',
  sand: 'glass', red_sand: 'glass', cobblestone: 'stone', stone: 'smooth_stone', clay_ball: 'brick', clay: 'terracotta', netherrack: 'nether_brick',
  oak_log: 'charcoal', spruce_log: 'charcoal', birch_log: 'charcoal', jungle_log: 'charcoal', acacia_log: 'charcoal',
  porkchop: 'cooked_porkchop', beef: 'cooked_beef', chicken: 'cooked_chicken', mutton: 'cooked_mutton', potato: 'baked_potato',
  cod: 'cooked_cod', salmon: 'cooked_salmon', rabbit: 'cooked_rabbit', kelp: 'dried_kelp',
  nether_quartz_ore: 'quartz', diamond_ore: 'diamond', emerald_ore: 'emerald', coal_ore: 'coal', lapis_ore: 'lapis_lazuli', ancient_debris: 'netherite_scrap',
};

export function fuelTime(id) {
  const n = ITEMS[id]?.name;
  if (!n) return 0;
  if (n === 'coal' || n === 'charcoal') return 1600;
  if (n === 'coal_block') return 16000;
  if (n === 'lava_bucket') return 20000;
  if (n === 'blaze_rod') return 2400;
  if (n.endsWith('_log') || n.endsWith('_planks') || n === 'crafting_table' || n === 'chest' || n === 'bookshelf' || n === 'ladder') return 300;
  if (n.startsWith('wooden_') || n === 'bow') return 200;
  if (n === 'stick' || n.endsWith('_sapling') || n.endsWith('_wool') || n === 'bowl') return 100;
  return 0;
}

// Creative inventory tabs
export function creativeTabs() {
  const blocks = [], deco = [], tools = [], combat = [], food = [], misc = [], eggs = [];
  for (const it of ITEMS) {
    if (!it) continue;
    if (it.spawnEgg) eggs.push(it.id);
    else if (it.kind === 'block') {
      const b = BLOCKS[it.id];
      if (b.render === 'cross' || b.render === 'box' || b.light || b.name.endsWith('_wool') || b.name.endsWith('_concrete')) deco.push(it.id); else blocks.push(it.id);
    } else if (it.kind === 'armor' || it.toolType === 'sword' || it.toolType === 'bow' || it.name === 'arrow') combat.push(it.id);
    else if (it.kind === 'tool' || it.name.endsWith('bucket') || it.name === 'compass' || it.name === 'clock') tools.push(it.id);
    else if (it.food) food.push(it.id);
    else misc.push(it.id);
  }
  return [
    { name: 'Bloques de construcción', icon: 'bricks', items: blocks },
    { name: 'Bloques decorativos', icon: 'poppy', items: deco },
    { name: 'Herramientas', icon: 'iron_pickaxe', items: tools },
    { name: 'Combate', icon: 'golden_sword', items: combat },
    { name: 'Comida', icon: 'apple', items: food },
    { name: 'Ingredientes', icon: 'iron_ingot', items: misc },
    { name: 'Huevos generadores', icon: 'creeper_spawn_egg', items: eggs },
  ];
}
