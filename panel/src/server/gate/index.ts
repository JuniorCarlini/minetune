/**
 * Processo do Portão Minetune. Roda na mesma imagem do painel, em outro contêiner:
 *   node src/server/gate/index.ts
 *
 * Variáveis:
 *   GATE_PORT          porta onde os jogadores conectam (padrão 25565)
 *   GATE_BACKEND       servidor de verdade, host:porta (padrão mc:25565)
 *   GATE_DATA_DIR      pasta do servidor, com server.properties e listas de ban (padrão /data)
 *   GATE_ACCOUNTS_DIR  onde ficam as senhas (padrão <GATE_DATA_DIR>/minetune-gate)
 *   GATE_CONFIG_DIR    onde o painel grava gate.json (padrão /minetune/config)
 *   RCON_HOST, RCON_PORT, RCON_PASSWORD  para desfazer um /ban-ip que acerte o portão
 */

import { join } from 'node:path';
import { GATE_ACCOUNTS_DIR } from '../../shared/gate.ts';
import { MinetuneGate } from './gate.ts';

const dataDir = process.env.GATE_DATA_DIR ?? '/data';
const [backendHost = 'mc', backendPort = '25565'] = (process.env.GATE_BACKEND ?? 'mc:25565').split(':');

const gate = new MinetuneGate({
  listenPort: Number(process.env.GATE_PORT ?? 25565),
  backendHost,
  backendPort: Number(backendPort),
  dataDir,
  accountsDir: process.env.GATE_ACCOUNTS_DIR ?? join(dataDir, GATE_ACCOUNTS_DIR),
  configDir: process.env.GATE_CONFIG_DIR ?? '/minetune/config',
  rcon: process.env.RCON_PASSWORD
    ? { host: process.env.RCON_HOST ?? backendHost, port: Number(process.env.RCON_PORT ?? 25575), password: process.env.RCON_PASSWORD }
    : undefined,
});

const port = await gate.listen();
console.log(`[portão] ouvindo na porta ${port}, servidor em ${backendHost}:${backendPort}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void gate.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
