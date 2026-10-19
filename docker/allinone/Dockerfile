# syntax=docker/dockerfile:1
#
# Minetune num container só: servidor Minecraft, Portão, agendador de backups e painel,
# os mesmos processos da instalação em vários containers, sob um supervisor pequeno.
# Para plataformas que instalam um container por app (Hangar) e para `docker run` com um volume.
#
# Base: a imagem da itzg (Java 25), a mesma do compose. Por cima só entram binários prontos,
# copiados das imagens oficiais: node (painel e portão), restic e o backup-loop do mc-backup
# (rcon-cli e mc-monitor, que ele usa, já vêm na imagem da itzg).
#
# Construir a partir da raiz do repositório:
#   docker build -f docker/allinone/Dockerfile -t minetune .

ARG MC_IMAGE_TAG=java25
ARG MC_BACKUP_IMAGE_TAG=latest
# Mesma versão principal do Node da imagem do painel (panel/Dockerfile). Imagem Debian, não
# Alpine: o binário do node vai rodar sobre o Ubuntu (glibc) da imagem da itzg.
ARG NODE_IMAGE=node:24-bookworm-slim
ARG RESTIC_IMAGE=restic/restic:0.19.1

# --- Painel: frontend e dependências de produção ------------------------------------
FROM ${NODE_IMAGE} AS web
WORKDIR /app
COPY panel/package.json panel/package-lock.json ./
RUN npm ci
COPY panel/tsconfig.json panel/vite.config.ts ./
COPY panel/src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY panel/package.json panel/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM itzg/mc-backup:${MC_BACKUP_IMAGE_TAG} AS mcbackup
FROM ${RESTIC_IMAGE} AS restic

# --- Imagem final -------------------------------------------------------------------
FROM itzg/minecraft-server:${MC_IMAGE_TAG}

# tini como PID 1: repassa o SIGTERM ao supervisor e recolhe processos órfãos.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /usr/local/bin/node /usr/local/bin/node
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY --from=mcbackup /opt/backup-loop.sh /opt/backup-loop.sh
# O docker/backup/entrypoint.sh termina em /usr/bin/backup, como no itzg/mc-backup.
# Aqui não há troca de usuário (o entrypoint-demoter de lá): tudo já roda como 1000.
COPY --chmod=755 <<'EOF' /usr/bin/backup
#!/bin/bash
case "${1:-loop}" in
  now) export ONE_SHOT=true ;;
  *) export ONE_SHOT=false ;;
esac
exec /opt/backup-loop.sh
EOF

WORKDIR /app
COPY panel/package.json panel/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY panel/src/server ./src/server
COPY panel/src/shared ./src/shared
COPY --from=web /app/dist/web ./dist/web

COPY docker/minecraft/entrypoint.sh /minetune/bin/minecraft.sh
COPY docker/backup/entrypoint.sh /minetune/bin/backup.sh
COPY docker/allinone/entrypoint.sh docker/allinone/supervisor.sh docker/allinone/health.sh /minetune/bin/
# Padrões copiados para /data/minetune-config na primeira subida, sem sobrescrever nada.
COPY config/server.env /minetune/defaults/server.env
COPY config/modrinth /minetune/defaults/modrinth
COPY config/patches /minetune/defaults/patches

# /backups: repositório local do restic (destino "Disco local" do painel). Monte um volume
# próprio, de preferência em outro disco; sem ele o Docker cria um anônimo.
RUN mkdir -p /backups && chown 1000:1000 /backups
WORKDIR /data

ENV \
  MINETUNE_CONTROL=local \
  MINETUNE_IMAGE=ghcr.io/juniorcarlini/minetune \
  MINETUNE_CONFIG_DIR=/data/minetune-config \
  # Painel, portão e agendador dividem o limite de memória com o servidor (~200 MB juntos).
  MINETUNE_MEMORY_RESERVE_MB=256 \
  NODE_ENV=production \
  TZ=America/Sao_Paulo \
  # --- servidor (mesmos valores do compose.yaml) ---
  EULA=TRUE \
  ENABLE_RCON=true \
  CREATE_CONSOLE_IN_PIPE=true \
  ENABLE_ROLLING_LOGS=true \
  STOP_SERVER_ANNOUNCE_DELAY=5 \
  STOP_DURATION=60 \
  MINETUNE_GATE=true \
  # O portão é dono da 25565; o servidor fica numa porta interna, sem publicar.
  SERVER_PORT=25566 \
  RCON_HOST=127.0.0.1 \
  RCON_PORT=25575 \
  # --- portão ---
  GATE_PORT=25565 \
  GATE_BACKEND=127.0.0.1:25566 \
  # --- painel ---
  PORT=8080 \
  MC_PORT=25565 \
  DATA_DIR=/data \
  # --- backups (agendador e painel) ---
  RESTIC_REPOSITORY=/backups/restic \
  RESTIC_CACHE_DIR=/data/.minetune/restic-cache \
  AWS_DEFAULT_REGION=auto \
  BACKUP_METHOD=restic \
  BACKUP_NAME=world \
  BACKUP_INITIAL_DELAY=5m \
  BACKUP_INTERVAL=6h \
  BACKUP_PAUSE_IF_NO_PLAYERS=true \
  BACKUP_RETENTION="--keep-last 4 --keep-daily 7 --keep-weekly 4 --keep-monthly 6" \
  BACKUP_EXCLUDES="/data/*.jar,/data/libraries,/data/versions,/data/cache,/data/logs,/data/.minetune,/data/minetune-config,*.tmp" \
  RESTIC_LIMIT_UPLOAD=0

EXPOSE 8080/tcp 25565/tcp 19132/udp
VOLUME ["/data", "/backups"]

# Primeira subida baixa servidor e plugins e gera o mundo: ~5 min numa máquina modesta.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=3 CMD ["bash", "/minetune/bin/health.sh"]
STOPSIGNAL SIGTERM
# O entrypoint acerta o dono dos volumes e vira o tini (PID 1) já como usuário 1000.
ENTRYPOINT ["bash", "/minetune/bin/entrypoint.sh"]
CMD []
