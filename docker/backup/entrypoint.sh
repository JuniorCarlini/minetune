#!/usr/bin/env bash
# =============================================================================
# Entrypoint do container `backup`.
#
# Por que existe: o itzg/mc-backup só lê variáveis de ambiente, e variáveis do
# compose só mudam recriando o container. Carregando config/backup.env aqui, o
# painel aplica destino, agenda e retenção apenas reiniciando o agendador.
#
# Só as chaves de destino/agenda podem vir do arquivo. Senha do repositório,
# RCON, host e tags ficam no compose (o arquivo não consegue sobrescrevê-las).
# =============================================================================
set -euo pipefail

BACKUP_ENV=/minetune/config/backup.env
ALLOWED_KEYS=(
  RESTIC_REPOSITORY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
  BACKUP_INTERVAL PRUNE_RESTIC_RETENTION PAUSE_IF_NO_PLAYERS RESTIC_LIMIT_UPLOAD
)

log() { echo "[minetune] $*"; }

if [[ -f "$BACKUP_ENV" ]]; then
  log "Carregando $BACKUP_ENV"
  # Lê o arquivo num subshell e exporta só as chaves permitidas.
  exports="$(
    set -a
    # shellcheck disable=SC1090
    . "$BACKUP_ENV"
    set +a
    for key in "${ALLOWED_KEYS[@]}"; do
      if [[ -n "${!key+x}" ]]; then printf 'export %s=%q\n' "$key" "${!key}"; fi
    done
  )"
  eval "$exports"
else
  log "Sem $BACKUP_ENV: usando destino e agenda do .env"
fi

log "Destino: ${RESTIC_REPOSITORY//\/\/*@//***@} · a cada ${BACKUP_INTERVAL:-?}"
exec /usr/bin/backup "$@"
