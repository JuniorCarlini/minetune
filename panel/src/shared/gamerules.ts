/**
 * Catálogo das regras de jogo (/gamerule).
 *
 * A partir da 1.21.11 a Mojang renomeou tudo para snake_case (keepInventory ->
 * keep_inventory). O painel consulta o servidor para descobrir quais nomes ele
 * aceita, então o mesmo catálogo serve para versões antigas (`legacy`) e novas.
 * Regras que o servidor não reconhece simplesmente não aparecem.
 *
 * Nome e ajuda de cada regra ficam em shared/i18n/gamerules.ts, nas três línguas.
 */

import { PT, type Messages } from './i18n/index.ts';
import type { GameRuleText } from './i18n/gamerules.ts';

export type GameRuleCategory = 'players' | 'mobs' | 'spawning' | 'world' | 'drops' | 'chat' | 'misc';

export interface GameRuleDef {
  name: string;
  /** Nome camelCase antes da 1.21.11, quando existia com o mesmo significado. */
  legacy?: string;
  type: 'bool' | 'int';
  category: GameRuleCategory;
  min?: number;
  max?: number;
}

export const GAMERULE_CATEGORIES: { id: GameRuleCategory }[] = [
  { id: 'players' },
  { id: 'mobs' },
  { id: 'spawning' },
  { id: 'world' },
  { id: 'drops' },
  { id: 'chat' },
  { id: 'misc' },
];

const b = (name: string, legacy: string | undefined, category: GameRuleCategory): GameRuleDef => ({ name, legacy, type: 'bool', category });

const i = (name: string, legacy: string | undefined, category: GameRuleCategory, min: number, max: number): GameRuleDef => ({
  name,
  legacy,
  type: 'int',
  category,
  min,
  max,
});

export const GAMERULES: GameRuleDef[] = [
  // Jogadores
  b('keep_inventory', 'keepInventory', 'players'),
  b('immediate_respawn', 'doImmediateRespawn', 'players'),
  b('natural_health_regeneration', 'naturalRegeneration', 'players'),
  b('pvp', undefined, 'players'),
  b('fall_damage', 'fallDamage', 'players'),
  b('fire_damage', 'fireDamage', 'players'),
  b('drowning_damage', 'drowningDamage', 'players'),
  b('freeze_damage', 'freezeDamage', 'players'),
  i('players_sleeping_percentage', 'playersSleepingPercentage', 'players', 0, 100),
  i('respawn_radius', 'spawnRadius', 'players', 0, 1000),
  b('limited_crafting', 'doLimitedCrafting', 'players'),
  b('locator_bar', 'locatorBar', 'players'),
  b('ender_pearls_vanish_on_death', 'enderPearlsVanishOnDeath', 'players'),
  b('spectators_generate_chunks', 'spectatorsGenerateChunks', 'players'),
  b('allow_entering_nether_using_portals', 'allowEnteringNetherUsingPortals', 'players'),
  i('players_nether_portal_default_delay', 'playersNetherPortalDefaultDelay', 'players', 0, 72000),
  i('players_nether_portal_creative_delay', 'playersNetherPortalCreativeDelay', 'players', 0, 72000),
  b('player_movement_check', undefined, 'players'),
  b('elytra_movement_check', undefined, 'players'),

  // Criaturas
  b('mob_griefing', 'mobGriefing', 'mobs'),
  b('raids', undefined, 'mobs'),
  b('forgive_dead_players', 'forgiveDeadPlayers', 'mobs'),
  b('universal_anger', 'universalAnger', 'mobs'),
  i('max_entity_cramming', 'maxEntityCramming', 'mobs', 0, 1000),

  // Spawn
  b('spawn_mobs', 'doMobSpawning', 'spawning'),
  b('spawn_monsters', 'spawnMonsters', 'spawning'),
  b('spawn_phantoms', 'doInsomnia', 'spawning'),
  b('spawn_patrols', 'doPatrolSpawning', 'spawning'),
  b('spawn_wandering_traders', 'doTraderSpawning', 'spawning'),
  b('spawn_wardens', 'doWardenSpawning', 'spawning'),
  b('spawner_blocks_work', 'spawnerBlocksEnabled', 'spawning'),

  // Mundo
  b('advance_time', 'doDaylightCycle', 'world'),
  b('advance_weather', 'doWeatherCycle', 'world'),
  i('random_tick_speed', 'randomTickSpeed', 'world', 0, 4096),
  i('fire_spread_radius_around_player', undefined, 'world', -1, 1024),
  b('spread_vines', 'doVinesSpread', 'world'),
  b('water_source_conversion', 'waterSourceConversion', 'world'),
  b('lava_source_conversion', 'lavaSourceConversion', 'world'),
  i('max_snow_accumulation_height', 'snowAccumulationHeight', 'world', 0, 8),
  b('tnt_explodes', 'tntExplodes', 'world'),
  b('projectiles_can_break_blocks', 'projectilesCanBreakBlocks', 'world'),

  // Drops
  b('block_drops', 'doTileDrops', 'drops'),
  b('mob_drops', 'doMobLoot', 'drops'),
  b('entity_drops', 'doEntityDrops', 'drops'),
  b('block_explosion_drop_decay', 'blockExplosionDropDecay', 'drops'),
  b('mob_explosion_drop_decay', 'mobExplosionDropDecay', 'drops'),
  b('tnt_explosion_drop_decay', 'tntExplosionDropDecay', 'drops'),

  // Chat
  b('show_death_messages', 'showDeathMessages', 'chat'),
  b('show_advancement_messages', 'announceAdvancements', 'chat'),
  b('send_command_feedback', 'sendCommandFeedback', 'chat'),
  b('command_block_output', 'commandBlockOutput', 'chat'),
  b('log_admin_commands', 'logAdminCommands', 'chat'),

  // Diversos
  b('command_blocks_work', undefined, 'misc'),
  b('reduced_debug_info', 'reducedDebugInfo', 'misc'),
  b('global_sound_events', 'globalSoundEvents', 'misc'),
  i('max_block_modifications', 'commandModificationBlockLimit', 'misc', 1, 100_000_000),
  i('max_command_sequence_length', 'maxCommandChainLength', 'misc', 0, 100_000_000),
  i('max_command_forks', 'maxCommandForkCount', 'misc', 0, 100_000_000),
  i('max_minecart_speed', 'minecartMaxSpeed', 'misc', 1, 1000),
];

export const GAMERULES_BY_NAME = new Map(GAMERULES.map((rule) => [rule.name, rule]));

/** Nome e ajuda de uma regra na língua pedida; sem texto, o nome técnico. */
export function gameRuleText(name: string, m: Messages = PT): GameRuleText {
  return (m.gamerules.rules as Record<string, GameRuleText>)[name] ?? { label: name };
}

/** Mesmas mensagens de Configurações: o erro de um número é igual nas duas telas. */
export function validateGameRuleValue(rule: GameRuleDef, value: string, m: Messages = PT): string | null {
  const errors = m.settings.errors;
  if (rule.type === 'bool') return value === 'true' || value === 'false' ? null : errors.useBoolean;
  if (!/^-?\d+$/.test(value)) return errors.integer;
  const n = Number(value);
  if (rule.min !== undefined && n < rule.min) return errors.min(rule.min);
  if (rule.max !== undefined && n > rule.max) return errors.max(rule.max);
  return null;
}
