/**
 * Rotas do Portão Minetune no painel: ligar/desligar a senha, ver quem já criou senha e
 * resetar a senha de alguém. O painel só mexe nos arquivos; o portão relê a cada entrada.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { z } from 'zod';
import { GATE_ACCOUNTS_DIR, GATE_CONFIG_FILE, gateHasPasswordWindow, parseGateConfig, type GateResponse } from '../shared/gate.ts';
import type { Services } from './context.ts';
import { AccountStore } from './gate/accounts.ts';
import { PLAYER_NAME } from './gate/protocol.ts';
import { requestMessages } from './i18n.ts';

export function registerGate(api: Hono, { config, docker, store }: Services): void {
  const accounts = new AccountStore(join(config.DATA_DIR, GATE_ACCOUNTS_DIR));
  const configFile = join(config.CONFIG_DIR, GATE_CONFIG_FILE);
  const readConfig = async () => parseGateConfig(await readFile(configFile, 'utf8').catch(() => ''));

  api.get('/gate', async (c) => {
    const [gate, settings, list, server] = await Promise.all([
      docker.info('gate').catch(() => ({ state: 'missing' as const })),
      readConfig(),
      accounts.list(),
      store.readSettings(),
    ]);
    const body: GateResponse = {
      installed: gate.state !== 'missing',
      running: gate.state === 'running',
      requirePassword: settings.requirePassword,
      // Sem ONLINE_MODE no server.env vale o padrão do Minecraft, que é ligado.
      onlineMode: (server.values.ONLINE_MODE ?? 'TRUE').toLowerCase() !== 'false',
      passwordWindow: gateHasPasswordWindow(server.values.VERSION),
      accounts: list.sort((a, b) => a.name.localeCompare(b.name)),
    };
    return c.json(body);
  });

  api.put('/gate', async (c) => {
    const { requirePassword } = z.object({ requirePassword: z.boolean() }).parse(await c.req.json());
    await mkdir(config.CONFIG_DIR, { recursive: true });
    const tmp = `${configFile}.tmp-${process.pid}`;
    await writeFile(tmp, `${JSON.stringify({ ...(await readConfig()), requirePassword }, null, 2)}\n`);
    await rename(tmp, configFile);
    return c.json({ requirePassword });
  });

  // Botão do aviso da tela Início: o proxy do Docker só libera start/stop/restart.
  api.post('/gate/start', async (c) => {
    await docker.action('gate', 'start');
    return c.json({ ok: true });
  });

  // POST em vez de DELETE: o proxy de alguns hosts barra métodos além de GET/POST/PUT.
  api.post('/gate/accounts/reset', async (c) => {
    const m = requestMessages(c);
    const { name } = z.object({ name: z.string().regex(PLAYER_NAME, m.server.invalidPlayerName) }).parse(await c.req.json());
    if (!(await accounts.remove(name))) return c.json({ error: m.players.gateNoAccount(name) }, 404);
    return c.json({ ok: true });
  });
}
