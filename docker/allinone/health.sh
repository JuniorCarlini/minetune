#!/usr/bin/env bash
# =============================================================================
# Verificação de saúde do container único: saudável quando o painel responde e o servidor
# está de pé. Também conta como saudável:
#   - servidor ainda ligando (primeira subida baixa servidor e plugins e gera o mundo, ~5 min;
#     o supervisor dá até MINETUNE_BOOT_GRACE, 15 min, antes de considerar problema);
#   - servidor desligado de propósito pelo painel (senão a plataforma reiniciaria o container
#     e religaria o que a pessoa desligou).
# O estado vem do supervisor (/tmp/minetune/state/mc.json), sem abrir conexão com o jogo.
# =============================================================================
set -uo pipefail

RUN_DIR="${MINETUNE_RUN_DIR:-/tmp/minetune}"

if ! curl -fsS -m 5 -o /dev/null "http://127.0.0.1:${PORT:-8080}/api/health"; then
  echo "painel não responde na porta ${PORT:-8080}"
  exit 1
fi

if ! state_json="$(cat "$RUN_DIR/state/mc.json" 2>/dev/null)"; then
  echo "supervisor sem estado do servidor"
  exit 1
fi

field() { [[ "$state_json" =~ \"$1\":\"([a-z]*)\" ]] && printf '%s' "${BASH_REMATCH[1]}"; }
state="$(field state)"
want="$(field want)"
health="$(field health)"

if [[ "$want" == down ]]; then
  echo "servidor desligado pelo painel"
  exit 0
fi
if [[ "$state" == running && ( "$health" == healthy || "$health" == starting ) ]]; then
  echo "ok: servidor $health"
  exit 0
fi
echo "servidor: ${state:-?} ${health}"
exit 1
