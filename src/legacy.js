// Registry of save format v1 (8-bit block ids, items from id 256), by name, so old saves
// can be mapped onto the current ids. Generated from the v1 registry; do not reorder.
import { B, I } from './registry.js';
import { rleDecode, rleEncode } from './world.js';

const V1_BLOCKS = [
  "air", "stone", "granite", "diorite", "andesite", "grass_block", "snowy_grass", "podzol", "dirt",
  "cobblestone", "mossy_cobblestone", "oak_planks", "oak_log", "oak_leaves", "spruce_planks", "spruce_log",
  "spruce_leaves", "birch_planks", "birch_log", "birch_leaves", "jungle_planks", "jungle_log",
  "jungle_leaves", "acacia_planks", "acacia_log", "acacia_leaves", "bedrock", "water", "lava", "sand",
  "red_sand", "gravel", "coal_ore", "iron_ore", "copper_ore", "gold_ore", "redstone_ore", "lapis_ore",
  "diamond_ore", "emerald_ore", "glass", "sandstone", "white_wool", "orange_wool", "magenta_wool",
  "light_blue_wool", "yellow_wool", "lime_wool", "pink_wool", "gray_wool", "light_gray_wool", "cyan_wool",
  "purple_wool", "blue_wool", "brown_wool", "green_wool", "red_wool", "black_wool", "white_concrete",
  "orange_concrete", "magenta_concrete", "light_blue_concrete", "yellow_concrete", "lime_concrete",
  "pink_concrete", "gray_concrete", "light_gray_concrete", "cyan_concrete", "purple_concrete",
  "blue_concrete", "brown_concrete", "green_concrete", "red_concrete", "black_concrete", "gold_block",
  "iron_block", "diamond_block", "emerald_block", "lapis_block", "coal_block", "redstone_block",
  "copper_block", "quartz_block", "bricks", "stone_bricks", "mossy_stone_bricks", "smooth_stone", "tnt",
  "bookshelf", "obsidian", "crying_obsidian", "torch", "soul_torch", "crafting_table", "furnace",
  "lit_furnace", "chest", "farmland", "farmland_wet", "wheat_0", "wheat_1", "wheat_2", "wheat_3", "wheat_4",
  "wheat_5", "wheat_6", "wheat_7", "carrots_0", "carrots_1", "carrots_2", "carrots_3", "carrots_4",
  "carrots_5", "carrots_6", "carrots_7", "potatoes_0", "potatoes_1", "potatoes_2", "potatoes_3",
  "potatoes_4", "potatoes_5", "potatoes_6", "potatoes_7", "snow_block", "snow", "ice", "packed_ice",
  "cactus", "clay", "terracotta", "sugar_cane", "pumpkin", "jack_o_lantern", "melon", "hay_block", "sponge",
  "ladder", "cobweb", "short_grass", "fern", "dead_bush", "dandelion", "poppy", "cornflower", "blue_orchid",
  "allium", "oxeye_daisy", "oak_sapling", "spruce_sapling", "birch_sapling", "brown_mushroom",
  "red_mushroom", "bed", "oak_door", "netherrack", "soul_sand", "soul_soil", "glowstone", "nether_portal",
  "nether_quartz_ore", "nether_gold_ore", "ancient_debris", "nether_bricks", "red_nether_bricks",
  "magma_block", "basalt", "blackstone", "nether_wart_block", "crimson_nylium", "shroomlight", "end_stone",
  "end_stone_bricks", "end_portal_frame", "end_portal_frame_eye", "end_portal", "purpur_block", "dragon_egg",
  "oak_slab", "oak_stairs", "spruce_slab", "spruce_stairs", "birch_slab", "birch_stairs", "jungle_slab",
  "jungle_stairs", "acacia_slab", "acacia_stairs", "stone_slab", "stone_stairs", "cobblestone_slab",
  "cobblestone_stairs", "stone_brick_slab", "stone_brick_stairs", "brick_slab", "brick_stairs",
  "sandstone_slab", "sandstone_stairs", "smooth_stone_slab", "quartz_slab", "quartz_stairs",
  "nether_brick_slab", "nether_brick_stairs", "purpur_slab", "purpur_stairs", "oak_fence", "spruce_fence",
  "nether_brick_fence", "glass_pane", "iron_bars", "lantern", "spawner", "path", "fire",
];
const V1_ITEMS = [
  "wooden_sword", "stone_sword", "iron_sword", "golden_sword", "diamond_sword", "netherite_sword",
  "wooden_pickaxe", "stone_pickaxe", "iron_pickaxe", "golden_pickaxe", "diamond_pickaxe",
  "netherite_pickaxe", "wooden_axe", "stone_axe", "iron_axe", "golden_axe", "diamond_axe", "netherite_axe",
  "wooden_shovel", "stone_shovel", "iron_shovel", "golden_shovel", "diamond_shovel", "netherite_shovel",
  "wooden_hoe", "stone_hoe", "iron_hoe", "golden_hoe", "diamond_hoe", "netherite_hoe", "leather_helmet",
  "chainmail_helmet", "iron_helmet", "golden_helmet", "diamond_helmet", "netherite_helmet",
  "leather_chestplate", "chainmail_chestplate", "iron_chestplate", "golden_chestplate", "diamond_chestplate",
  "netherite_chestplate", "leather_leggings", "chainmail_leggings", "iron_leggings", "golden_leggings",
  "diamond_leggings", "netherite_leggings", "leather_boots", "chainmail_boots", "iron_boots", "golden_boots",
  "diamond_boots", "netherite_boots", "stick", "coal", "charcoal", "iron_ingot", "gold_ingot",
  "copper_ingot", "netherite_ingot", "netherite_scrap", "raw_iron", "raw_gold", "raw_copper", "gold_nugget",
  "iron_nugget", "diamond", "emerald", "quartz", "lapis_lazuli", "redstone", "glowstone_dust", "gunpowder",
  "sugar", "blaze_powder", "bone_meal", "flint", "wheat", "wheat_seeds", "egg", "feather", "leather",
  "string", "bone", "arrow", "ender_pearl", "ender_eye", "blaze_rod", "ghast_tear", "slime_ball", "paper",
  "book", "snowball", "clay_ball", "brick", "nether_brick", "bowl", "compass", "clock", "saddle", "ink_sac",
  "totem", "bow", "shears", "flint_and_steel", "bucket", "water_bucket", "lava_bucket", "milk_bucket",
  "apple", "golden_apple", "bread", "porkchop", "cooked_porkchop", "beef", "cooked_beef", "chicken",
  "cooked_chicken", "mutton", "cooked_mutton", "rotten_flesh", "carrot", "potato", "baked_potato",
  "melon_slice", "mushroom_stew", "pig_spawn_egg", "cow_spawn_egg", "sheep_spawn_egg", "chicken_spawn_egg",
  "wolf_spawn_egg", "horse_spawn_egg", "villager_spawn_egg", "zombie_spawn_egg", "skeleton_spawn_egg",
  "creeper_spawn_egg", "spider_spawn_egg", "enderman_spawn_egg", "slime_spawn_egg",
  "zombified_piglin_spawn_egg", "ghast_spawn_egg", "blaze_spawn_egg", "ender_dragon_spawn_egg",
  "iron_golem_spawn_egg", "witch_spawn_egg",
];
const V1_ITEM_BASE = 256;

const blockMap = Uint16Array.from(V1_BLOCKS, (n) => B[n] ?? 0);
const mapStackId = (id) => (id >= V1_ITEM_BASE ? I[V1_ITEMS[id - V1_ITEM_BASE]] : blockMap[id]);
const CHUNK_LEN = 16 * 16 * 128;

export function migrateSave(save) {
  if (!save || (save.version ?? 1) >= 2) return save;
  const fix = (s) => { if (s) { const id = mapStackId(s.id); if (id === undefined) s.id = 0, s.count = 0; else s.id = id; } };
  const fixList = (l) => { if (!l) return; for (let i = 0; i < l.length; i++) { fix(l[i]); if (l[i] && !l[i].count) l[i] = null; } };
  const p = save.player;
  if (p) { fixList(p.inventory); fixList(p.armor); }
  for (const d of Object.values(save.dims ?? {})) {
    for (const t of Object.values(d.tiles ?? {})) {
      fixList(t.items);
    }
    for (const c of Object.values(d.chunks ?? {})) {
      if (!c.d || c.d.startsWith('2:')) continue;
      const data = rleDecode(c.d, CHUNK_LEN);
      for (let i = 0; i < data.length; i++) data[i] = blockMap[data[i]] ?? 0;
      c.d = rleEncode(data);
    }
  }
  save.version = 2;
  return save;
}
