/** Interpretação das respostas de texto do servidor via RCON. */

import { GAMERULES, type GameRuleDef } from '../shared/gamerules.ts';
import type { GameRulesResponse, GameRuleValue } from '../shared/api.ts';
import type { RconClient } from './rcon.ts';

/** "There are 2 of a max of 20 players online: Steve, Alex" */
export function parseList(output: string): { online: number; max: number; names: string[] } | null {
  const match = /There are (\d+) of a max(?: of)? (\d+) players online:?\s*(.*)$/s.exec(output.trim());
  if (!match) return null;
  const names = match[3]!
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return { online: Number(match[1]), max: Number(match[2]), names };
}

/** Paper: "TPS from last 1m, 5m, 15m: 20.0, *20.0, 19.98" */
export function parseTps(output: string): number[] | undefined {
  const match = /TPS from last[^:]*:\s*(.+)$/s.exec(output.trim());
  if (!match) return undefined;
  const values = match[1]!.split(',').map((v) => Number.parseFloat(v.replace(/[^\d.]/g, '')));
  return values.every(Number.isFinite) ? values : undefined;
}

/** Extrai o valor de "Gamerule keep_inventory is currently set to: false". Null = regra desconhecida. */
export function parseGameRuleQuery(output: string): string | null {
  const match = /set to:\s*(\S+)\s*$/i.exec(output.trim());
  return match ? match[1]! : null;
}

export async function readGameRules(rcon: RconClient): Promise<GameRulesResponse> {
  const probe = await rcon.command('gamerule keep_inventory');
  const naming: GameRulesResponse['naming'] = parseGameRuleQuery(probe) !== null ? 'modern' : 'legacy';

  const rules: GameRuleValue[] = [];
  for (const rule of GAMERULES) {
    const serverName = serverNameFor(rule, naming);
    if (!serverName) continue;
    const value = parseGameRuleQuery(await rcon.command(`gamerule ${serverName}`));
    if (value !== null) rules.push({ name: rule.name, serverName, value });
  }
  return { naming, rules };
}

export function serverNameFor(rule: GameRuleDef, naming: GameRulesResponse['naming']): string | undefined {
  return naming === 'modern' ? rule.name : rule.legacy;
}

/**
 * Aplica em todas as dimensões. No vanilla/Fabric a regra é global e os
 * comandos extras só repetem o valor; no Paper cada mundo tem as suas.
 */
export async function setGameRule(rcon: RconClient, serverName: string, value: string): Promise<string> {
  const output = await rcon.command(`gamerule ${serverName} ${value}`);
  if (/unknown|incorrect|invalid|expected/i.test(output)) throw new Error(output);
  for (const dimension of ['minecraft:the_nether', 'minecraft:the_end']) {
    await rcon.command(`execute in ${dimension} run gamerule ${serverName} ${value}`).catch(() => undefined);
  }
  return output;
}
