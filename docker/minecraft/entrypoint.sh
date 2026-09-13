#!/usr/bin/env bash
# =============================================================================
# Entrypoint do container `mc`.
#
# Por que existe: a imagem itzg configura tudo por variáveis de ambiente, mas
# variáveis do compose só mudam recriando o container. Carregando
# config/server.env aqui, um simples `restart` aplica o que o painel salvou.
#
# Também resolve o que é derivado da configuração:
#   - lista de plugins/mods do Modrinth conforme o loader (paper/fabric/...)
#   - Geyser + Floodgate quando BEDROCK_CROSSPLAY=true
#   - patches de otimização do Paper
# =============================================================================
set -euo pipefail

CONFIG_DIR=/minetune/config
SERVER_ENV="$CONFIG_DIR/server.env"

log() { echo "[minetune] $*"; }

# Chaves de infraestrutura: vêm do compose e não podem ser sobrescritas pelo server.env.
PROTECTED_KEYS=(EULA ENABLE_RCON RCON_PASSWORD RCON_PORT SERVER_PORT TZ)
declare -A protected
for key in "${PROTECTED_KEYS[@]}"; do
  protected[$key]="${!key-}"
done

if [[ -f "$SERVER_ENV" ]]; then
  log "Carregando $SERVER_ENV"
  set -a
  # shellcheck disable=SC1090
  . "$SERVER_ENV"
  set +a
else
  log "AVISO: $SERVER_ENV não encontrado, usando padrões da imagem"
fi

for key in "${PROTECTED_KEYS[@]}"; do
  if [[ -n "${protected[$key]}" ]]; then
    export "$key=${protected[$key]}"
  fi
done

: "${TYPE:=PAPER}"
case "${TYPE^^}" in
  PAPER | PURPUR | FOLIA | PUFFERFISH | LEAF) loader=paper ;;
  FABRIC | QUILT) loader=fabric ;;
  NEOFORGE) loader=neoforge ;;
  FORGE) loader=forge ;;
  *) loader="" ;;
esac
log "TYPE=$TYPE VERSION=${VERSION:-LATEST} loader=${loader:-nenhum}"

# --- Plugins/mods do Modrinth ---------------------------------------------------
projects_file=/tmp/minetune-modrinth.txt
: >"$projects_file"
if [[ -n "$loader" && -f "$CONFIG_DIR/modrinth/$loader.txt" ]]; then
  cat "$CONFIG_DIR/modrinth/$loader.txt" >>"$projects_file"
  echo >>"$projects_file"
fi

if [[ "${BEDROCK_CROSSPLAY:-false}" == "true" ]]; then
  # O Geyser/Floodgate só publicam builds "beta" no Modrinth; sem o sufixo o boot falha.
  case "$loader" in
    paper)
      echo "geyser:beta" >>"$projects_file"
      # Floodgate para Paper não é publicado no Modrinth; vem direto da GeyserMC.
      export PLUGINS="${PLUGINS:+$PLUGINS,}https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot"
      ;;
    fabric) printf 'fabric-api\ngeyser:beta\nfloodgate:beta\n' >>"$projects_file" ;;
    neoforge) printf 'geyser:beta\nfloodgate:beta\n' >>"$projects_file" ;;
    *) log "AVISO: BEDROCK_CROSSPLAY não é suportado com TYPE=$TYPE, ignorando" ;;
  esac
  log "Crossplay Bedrock habilitado (UDP 19132)"
elif [[ -d /data/plugins ]]; then
  # O Modrinth remove o Geyser sozinho; o Floodgate baixado por URL precisa de limpeza manual.
  rm -f /data/plugins/floodgate-spigot.jar
fi

# Remove comentários/linhas vazias e duplicatas mantendo a ordem.
sed -E 's/[[:space:]]*#.*$//; /^[[:space:]]*$/d' "$projects_file" | awk '!seen[$0]++' >"$projects_file.clean"
mv "$projects_file.clean" "$projects_file"

if [[ -s "$projects_file" ]]; then
  export MODRINTH_PROJECTS="@$projects_file"
  : "${MODRINTH_DOWNLOAD_DEPENDENCIES:=required}"
  export MODRINTH_DOWNLOAD_DEPENDENCIES
  log "Projetos Modrinth: $(paste -sd, "$projects_file")"
fi

# --- Patches em arquivos de configuração -------------------------------------------
# Monta um diretório só com os patches que se aplicam a esta combinação de config.
patches_dir=/tmp/minetune-patches
rm -rf "$patches_dir" && mkdir -p "$patches_dir"
add_patches() { [[ -d "$CONFIG_DIR/patches/$1" ]] && cp "$CONFIG_DIR/patches/$1"/*.json "$patches_dir/" 2>/dev/null || true; }

if [[ "$loader" == "paper" && "${APPLY_PAPER_OPTIMIZATIONS:-true}" == "true" ]]; then
  add_patches paper
fi

if [[ "${BEDROCK_CROSSPLAY:-false}" == "true" ]]; then
  # Bedrock autentica via Floodgate (conta Xbox), não exige conta Java.
  # O plugin só cria o config no primeiro boot; até lá, semeamos o mínimo e ele completa o resto.
  case "$loader" in
    paper) geyser_config=/data/plugins/Geyser-Spigot/config.yml ;;
    fabric) geyser_config=/data/config/Geyser-Fabric/config.yml ;;
    *) geyser_config="" ;;
  esac
  if [[ -n "$geyser_config" ]]; then
    if [[ -f "$geyser_config" ]]; then
      # Edição pontual em vez de PATCH_DEFINITIONS: o patcher reescreve o YAML e apaga os comentários.
      sed -i -E 's/^([[:space:]]+auth-type:).*/\1 floodgate/' "$geyser_config"
    else
      mkdir -p "$(dirname "$geyser_config")"
      printf 'java:\n  auth-type: floodgate\n' >"$geyser_config"
    fi
  fi
fi

if compgen -G "$patches_dir/*.json" >/dev/null; then
  export PATCH_DEFINITIONS="$patches_dir"
fi

exec /image/scripts/start "$@"
