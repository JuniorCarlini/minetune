#!/usr/bin/env node
/**
 * Gera o template do EasyPanel (easypanel/minetune/) a partir do deploy/compose.yaml.
 *
 * Por que gerar: o template precisa levar o compose inteiro dentro do index.ts, e dois
 * arquivos editados à mão acabariam diferentes. Rode depois de mudar o deploy/compose.yaml
 * ou a versão do painel; a pasta gerada é a que vai no PR para easypanel-io/templates.
 *
 *   node scripts/build-easypanel.mjs
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const out = new URL('easypanel/minetune/', root);

const compose = await readFile(new URL('deploy/compose.yaml', root), 'utf8');
const { version } = JSON.parse(await readFile(new URL('panel/package.json', root), 'utf8'));

// O EasyPanel recusa template com imagem sem versão fixa: o compose precisa apontar para a versão atual.
if (!compose.includes(`MINETUNE_VERSION:-${version}`)) {
  throw new Error(`deploy/compose.yaml não usa MINETUNE_VERSION:-${version}; atualize antes de gerar o template`);
}

const index = `// Gerado por scripts/build-easypanel.mjs a partir de deploy/compose.yaml (Minetune ${version}). Não edite à mão.
import { Output, randomPassword, Services } from "~templates-utils";
import { Input } from "./meta";

const compose = ${JSON.stringify(compose)};

export function generate(input: Input): Output {
  const services: Services = [];
  const env = [
    \`MINETUNE_VERSION=\${input.version}\`,
    \`INSTANCE_NAME=\${input.serviceName}\`,
    \`MC_MEMORY_LIMIT=\${input.memoryLimit}\`,
    \`PANEL_PASSWORD=\${randomPassword()}\`,
    // O painel exige pelo menos 32 caracteres no segredo da sessão.
    \`PANEL_SESSION_SECRET=\${randomPassword()}\${randomPassword()}\`,
    \`RCON_PASSWORD=\${randomPassword()}\`,
    \`RESTIC_PASSWORD=\${randomPassword()}\`,
  ];

  services.push({
    type: "compose",
    data: {
      serviceName: input.serviceName,
      source: { type: "inline", content: compose },
      env: env.join("\\n"),
      createDotEnv: true,
      domains: [{ host: "$(EASYPANEL_DOMAIN)", port: 8080, service: "panel" }],
    },
  });

  return { services };
}
`;

await mkdir(new URL('assets/', out), { recursive: true });
await writeFile(new URL('index.ts', out), index);
await copyFile(new URL('docs/assets/logo/rack-512.png', root), new URL('assets/logo.png', out));
const shots = ['overview', 'players', 'settings'];
await Promise.all(
  shots.map((name, i) => copyFile(new URL(`docs/assets/screenshots/en/${name}.png`, root), new URL(`assets/screenshot${i + 1}.png`, out))),
);
console.log(`template do EasyPanel gerado em easypanel/minetune/ (Minetune ${version})`);
