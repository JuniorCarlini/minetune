/**
 * Catálogo das regras de jogo (/gamerule).
 *
 * A partir da 1.21.11 a Mojang renomeou tudo para snake_case (keepInventory ->
 * keep_inventory). O painel consulta o servidor para descobrir quais nomes ele
 * aceita, então o mesmo catálogo serve para versões antigas (`legacy`) e novas.
 * Regras que o servidor não reconhece simplesmente não aparecem.
 */

export type GameRuleCategory = 'players' | 'mobs' | 'spawning' | 'world' | 'drops' | 'chat' | 'misc';

export interface GameRuleDef {
  name: string;
  /** Nome camelCase antes da 1.21.11, quando existia com o mesmo significado. */
  legacy?: string;
  type: 'bool' | 'int';
  category: GameRuleCategory;
  label: string;
  help?: string;
  min?: number;
  max?: number;
}

export const GAMERULE_CATEGORIES: { id: GameRuleCategory; label: string }[] = [
  { id: 'players', label: 'Jogadores' },
  { id: 'mobs', label: 'Criaturas' },
  { id: 'spawning', label: 'Spawn de criaturas' },
  { id: 'world', label: 'Mundo e clima' },
  { id: 'drops', label: 'Drops' },
  { id: 'chat', label: 'Chat e mensagens' },
  { id: 'misc', label: 'Comandos e diversos' },
];

const b = (name: string, legacy: string | undefined, category: GameRuleCategory, label: string, help?: string): GameRuleDef => ({
  name,
  legacy,
  type: 'bool',
  category,
  label,
  help,
});

const i = (
  name: string,
  legacy: string | undefined,
  category: GameRuleCategory,
  label: string,
  min: number,
  max: number,
  help?: string,
): GameRuleDef => ({ name, legacy, type: 'int', category, label, min, max, help });

export const GAMERULES: GameRuleDef[] = [
  // Jogadores
  b('keep_inventory', 'keepInventory', 'players', 'Manter inventário ao morrer'),
  b('immediate_respawn', 'doImmediateRespawn', 'players', 'Renascer sem tela de morte'),
  b('natural_health_regeneration', 'naturalRegeneration', 'players', 'Regeneração natural de vida'),
  b('pvp', undefined, 'players', 'PvP entre jogadores'),
  b('fall_damage', 'fallDamage', 'players', 'Dano de queda'),
  b('fire_damage', 'fireDamage', 'players', 'Dano de fogo e lava'),
  b('drowning_damage', 'drowningDamage', 'players', 'Dano de afogamento'),
  b('freeze_damage', 'freezeDamage', 'players', 'Dano de congelamento (neve fofa)'),
  i('players_sleeping_percentage', 'playersSleepingPercentage', 'players', 'Jogadores dormindo para pular a noite (%)', 0, 100),
  i('respawn_radius', 'spawnRadius', 'players', 'Raio de renascimento ao redor do spawn', 0, 1000),
  b('limited_crafting', 'doLimitedCrafting', 'players', 'Só fabricar receitas desbloqueadas'),
  b('locator_bar', 'locatorBar', 'players', 'Barra de localização de jogadores'),
  b('ender_pearls_vanish_on_death', 'enderPearlsVanishOnDeath', 'players', 'Pérolas do End somem quando o jogador morre'),
  b('spectators_generate_chunks', 'spectatorsGenerateChunks', 'players', 'Espectadores geram chunks'),
  b('allow_entering_nether_using_portals', 'allowEnteringNetherUsingPortals', 'players', 'Entrar no Nether por portais'),
  i('players_nether_portal_default_delay', 'playersNetherPortalDefaultDelay', 'players', 'Espera no portal do Nether (ticks)', 0, 72000),
  i('players_nether_portal_creative_delay', 'playersNetherPortalCreativeDelay', 'players', 'Espera no portal no criativo (ticks)', 0, 72000),
  b('player_movement_check', undefined, 'players', 'Anticheat de velocidade de movimento'),
  b('elytra_movement_check', undefined, 'players', 'Anticheat de velocidade com elytra'),

  // Criaturas
  b('mob_griefing', 'mobGriefing', 'mobs', 'Criaturas alteram blocos (creeper, enderman...)'),
  b('raids', undefined, 'mobs', 'Invasões (raids)'),
  b('forgive_dead_players', 'forgiveDeadPlayers', 'mobs', 'Criaturas neutras perdoam jogador morto'),
  b('universal_anger', 'universalAnger', 'mobs', 'Raiva de criaturas neutras contra todos'),
  i('max_entity_cramming', 'maxEntityCramming', 'mobs', 'Máximo de entidades empilhadas antes de sofrer dano', 0, 1000),

  // Spawn
  b('spawn_mobs', 'doMobSpawning', 'spawning', 'Spawn natural de criaturas'),
  b('spawn_monsters', 'spawnMonsters', 'spawning', 'Spawn natural de monstros'),
  b('spawn_phantoms', 'doInsomnia', 'spawning', 'Phantoms (insônia)'),
  b('spawn_patrols', 'doPatrolSpawning', 'spawning', 'Patrulhas de saqueadores'),
  b('spawn_wandering_traders', 'doTraderSpawning', 'spawning', 'Vendedor ambulante'),
  b('spawn_wardens', 'doWardenSpawning', 'spawning', 'Wardens'),
  b('spawner_blocks_work', 'spawnerBlocksEnabled', 'spawning', 'Spawners funcionam'),

  // Mundo
  b('advance_time', 'doDaylightCycle', 'world', 'Ciclo de dia e noite'),
  b('advance_weather', 'doWeatherCycle', 'world', 'Mudança de clima'),
  i('random_tick_speed', 'randomTickSpeed', 'world', 'Velocidade de ticks aleatórios', 0, 4096, 'Crescimento de plantas, espalhamento de fogo... Padrão 3.'),
  i('fire_spread_radius_around_player', undefined, 'world', 'Raio de propagação do fogo ao redor dos jogadores', -1, 1024, '0 impede o fogo de se espalhar.'),
  b('spread_vines', 'doVinesSpread', 'world', 'Trepadeiras se espalham'),
  b('water_source_conversion', 'waterSourceConversion', 'world', 'Formar novas fontes de água'),
  b('lava_source_conversion', 'lavaSourceConversion', 'world', 'Formar novas fontes de lava'),
  i('max_snow_accumulation_height', 'snowAccumulationHeight', 'world', 'Camadas máximas de neve acumulada', 0, 8),
  b('tnt_explodes', 'tntExplodes', 'world', 'TNT explode'),
  b('projectiles_can_break_blocks', 'projectilesCanBreakBlocks', 'world', 'Projéteis quebram blocos'),

  // Drops
  b('block_drops', 'doTileDrops', 'drops', 'Blocos dropam itens'),
  b('mob_drops', 'doMobLoot', 'drops', 'Criaturas dropam itens e XP'),
  b('entity_drops', 'doEntityDrops', 'drops', 'Entidades (carrinhos, molduras...) dropam itens'),
  b('block_explosion_drop_decay', 'blockExplosionDropDecay', 'drops', 'Explosões de blocos perdem parte dos drops'),
  b('mob_explosion_drop_decay', 'mobExplosionDropDecay', 'drops', 'Explosões de criaturas perdem parte dos drops'),
  b('tnt_explosion_drop_decay', 'tntExplosionDropDecay', 'drops', 'Explosões de TNT perdem parte dos drops'),

  // Chat
  b('show_death_messages', 'showDeathMessages', 'chat', 'Mensagens de morte'),
  b('show_advancement_messages', 'announceAdvancements', 'chat', 'Anunciar conquistas'),
  b('send_command_feedback', 'sendCommandFeedback', 'chat', 'Retorno de comandos no chat'),
  b('command_block_output', 'commandBlockOutput', 'chat', 'Blocos de comando notificam operadores'),
  b('log_admin_commands', 'logAdminCommands', 'chat', 'Registrar comandos de administradores'),

  // Diversos
  b('command_blocks_work', undefined, 'misc', 'Blocos de comando funcionam'),
  b('reduced_debug_info', 'reducedDebugInfo', 'misc', 'Ocultar coordenadas no F3'),
  b('global_sound_events', 'globalSoundEvents', 'misc', 'Sons de chefes audíveis em todo o mundo'),
  i('max_block_modifications', 'commandModificationBlockLimit', 'misc', 'Blocos por /fill e /clone', 1, 100_000_000),
  i('max_command_sequence_length', 'maxCommandChainLength', 'misc', 'Tamanho máximo de cadeia de comandos', 0, 100_000_000),
  i('max_command_forks', 'maxCommandForkCount', 'misc', 'Máximo de contextos por comando', 0, 100_000_000),
  i('max_minecart_speed', 'minecartMaxSpeed', 'misc', 'Velocidade máxima de carrinhos (experimental)', 1, 1000),
];

export const GAMERULES_BY_NAME = new Map(GAMERULES.map((rule) => [rule.name, rule]));

export function validateGameRuleValue(rule: GameRuleDef, value: string): string | null {
  if (rule.type === 'bool') return value === 'true' || value === 'false' ? null : 'Use true ou false';
  if (!/^-?\d+$/.test(value)) return 'Precisa ser um número inteiro';
  const n = Number(value);
  if (rule.min !== undefined && n < rule.min) return `Mínimo ${rule.min}`;
  if (rule.max !== undefined && n > rule.max) return `Máximo ${rule.max}`;
  return null;
}
