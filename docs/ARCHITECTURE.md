# Arquitetura e decisões

Este documento registra **por que** o projeto é como é. Antes de mudar uma
dessas decisões, leia o contexto dela.

## 1. Não escrevemos o servidor de Minecraft

O servidor é Java e o protocolo muda a cada versão. Reimplementar isso é
trabalho de anos, com compatibilidade pior que a oficial. O valor deste projeto
está em **operar** bem um servidor existente: configuração, backup, segurança,
observabilidade e experiência de administração.

**Linguagens:**

| Camada | Linguagem | Motivo |
|---|---|---|
| Servidor | Java (Paper/Fabric/NeoForge) | É o ecossistema do jogo. Plugins próprios, se vierem, em Java ou Kotlin com a API do Paper. |
| Infra | Docker Compose + Bash | Portável para qualquer host (local, VPS, EasyPanel), sem dependências. |
| Painel | TypeScript (Node 24 + React) | Um só idioma e **os mesmos catálogos e validações** no backend e na UI (`panel/src/shared`). |

## 2. Imagem `itzg/minecraft-server` como base

Padrão de fato da comunidade, com milhares de estrelas e mantida ativamente.
Resolve download e verificação de Paper/Fabric/NeoForge/etc., Modrinth,
flags de JVM, RCON, healthcheck e desligamento gracioso. Construir uma imagem
própria significaria manter tudo isso sem ganho.

Tag padrão `java25`, exigida pelo Minecraft 26.x. Para versões antigas do jogo,
use `MC_IMAGE_TAG=java21|java17|java8`.

## 3. Duas camadas de configuração

- **`.env`** (infra): portas, limites, segredos, destino de backup. Lido pelo
  Compose; mudar exige recriar containers (`make up`).
- **`config/server.env`** (jogo): lido pelo `docker/minecraft/entrypoint.sh`
  **a cada start** do container.

O ponto importante é o segundo: o painel só precisa **reiniciar** o container
para aplicar uma mudança, e reiniciar é uma operação que o proxy do Docker
pode liberar com segurança. Recriar containers exigiria acesso irrestrito ao Docker.

O entrypoint protege chaves de infraestrutura (`RCON_PASSWORD`, `EULA`...)
contra sobrescrita pelo `server.env` e deriva o que depende da configuração:
lista do Modrinth por loader, Geyser/Floodgate e patches aplicáveis.

## 4. Painel com privilégio mínimo

```
panel ──► docker-proxy (wollomatic/socket-proxy) ──► /var/run/docker.sock
```

O proxy usa allowlist **por método e caminho**:

- `GET`: `containers/json`, `containers/{id}/json|logs|stats`
- `POST`: `containers/{id}/start|stop|restart`

Não há `exec`, `create`, `images` nem `volumes`. Mesmo com o painel
comprometido, não dá para criar um container privilegiado e escapar para o host.
(O `tecnativa/docker-socket-proxy` foi descartado porque liberar `POST` nele
também libera criar containers.)

O proxy fica numa rede `internal` alcançável só pelo painel. O container do
painel roda com filesystem somente leitura, `no-new-privileges` e só as
capabilities necessárias para o restore preservar dono e permissões dos arquivos.

Containers são localizados por **label** (`minetune.instance` + `minetune.role`),
não por nome, então funciona com qualquer nome de projeto ou orquestrador.

**Autenticação:** senha única + cookie assinado com HMAC (`HttpOnly`,
`SameSite=Strict`, `Secure` atrás de HTTPS), rate limit de login e cabeçalho
obrigatório em requisições mutáveis. Não há banco de dados. Multiusuário com
papéis fica para uma fase futura; o desenho de rotas já isola as ações.

## 5. Backups com restic

Comparado com `.tar.gz` periódicos:

- **Incremental e deduplicado**: um mundo de 5 GB com mudanças pequenas gera
  poucos MB por snapshot. Dá para ter backups de hora em hora sem explodir o armazenamento.
- **Criptografado no cliente**: o provedor S3/R2 nunca vê o mundo.
- **Backends nativos**: disco local, S3, R2, MinIO/RustFS, B2, SFTP.
- **Retenção declarativa**: `--keep-daily 7 --keep-weekly 4 ...`

O agendamento fica no `itzg/mc-backup`, que já coordena `save-off` →
`save-all flush` → snapshot → `save-on` via RCON. O painel e a CLI geram
snapshots **compatíveis** (mesmo host, caminho `/data` e tags), então retenção e
listagem enxergam tudo como um só histórico.

`RESTIC_HOST` é fixado em `INSTANCE_NAME` porque o hostname padrão do container
muda a cada recriação, e o restic agrupa a retenção por host.

**Restore seguro:** snapshot de segurança do estado atual, parada do servidor,
restauração numa pasta temporária no mesmo disco, troca por `rename` item a item
com rollback em caso de falha e religamento. Um arquivo de lock em
`/data/.minetune` impede que painel e CLI rodem operações ao mesmo tempo.

## 6. Backend do painel sem etapa de build

O Node 24 executa TypeScript nativamente (type stripping). O backend roda os
`.ts` direto, sem bundler e sem `dist` para dessincronizar. A regra
`erasableSyntaxOnly` do `tsconfig` garante que só se use sintaxe compatível
(sem `enum` nem *parameter properties*). O frontend usa Vite normalmente.

Dependências de runtime: `hono`, `@hono/node-server`, `zod`. RCON, cliente
Docker e parser de `.env` são implementações pequenas e testadas no próprio projeto.

## 7. Decisões validadas em teste real (Paper 26.2, ARM64)

- **Flags MeowIce derrubaram a JVM em ARM64** (`barrierSetAssembler_aarch64
  ShouldNotReachHere`). O padrão é Aikar, estável em x86 e ARM.
- **Geyser/Floodgate só publicam builds beta no Modrinth.** Sem `:beta` o boot
  falha. O entrypoint já pede a variante certa.
- **Geyser gera `auth-type: online`** mesmo com Floodgate instalado. O
  entrypoint semeia ou corrige para `floodgate`.
- **Gamerules são por mundo no Paper.** O painel aplica em overworld, nether e end.
- **Nomes de gamerules mudaram na 1.21.11** (`keepInventory` → `keep_inventory`).
  O painel descobre o formato consultando o servidor.
- **O RCON do Paper devolve cores ANSI.** A saída é limpa antes de ser interpretada.

## 8. Fora de escopo por enquanto (roadmap)

- Múltiplos servidores / proxy Velocity na mesma stack
- Usuários e papéis no painel, log de auditoria
- Métricas Prometheus + Grafana (`mc-monitor` exporter)
- Upload de mundos e datapacks pelo painel
- Notificações (Discord webhook) de backup falho / servidor caído
