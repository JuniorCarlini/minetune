#!/usr/bin/env bash
# =============================================================================
# Entrada do container único (ghcr.io/juniorcarlini/minetune), PID 1 até virar o tini.
#
# Única parte que pode rodar como root: acerta o dono de /data e /backups (pasta do host
# montada pertencendo ao root, dados vindos da instalação em vários containers) e desce
# para o usuário 1000, o mesmo do servidor na imagem da itzg. Daí em diante nada roda
# como root. Com --user 1000:1000 e volumes nomeados esta etapa é pulada e o container
# não precisa de nenhuma capability.
# =============================================================================
set -euo pipefail

APP_UID=1000
APP_GID=1000

if [[ "$(id -u)" == 0 ]]; then
  for dir in /data /backups; do
    [[ -d "$dir" ]] || continue
    # Para no primeiro arquivo de outro dono: num mundo grande a busca inteira leva ~1 s.
    if [[ -n "$(find "$dir" -xdev \( ! -uid "$APP_UID" -o ! -gid "$APP_GID" \) -print -quit 2>/dev/null)" ]]; then
      echo "[minetune] Ajustando o dono de $dir para $APP_UID:$APP_GID"
      chown -R "$APP_UID:$APP_GID" "$dir"
    fi
  done
  # O tini desce junto: como root, sem CAP_KILL (cap_drop: ALL), ele não conseguiria repassar o
  # SIGTERM do `docker stop` ao supervisor de outro usuário e o servidor cairia sem salvar.
  exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --clear-groups -- \
    /usr/bin/tini -- bash /minetune/bin/supervisor.sh "$@"
fi

exec /usr/bin/tini -- bash /minetune/bin/supervisor.sh "$@"
