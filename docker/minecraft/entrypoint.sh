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

# Primeira subida numa plataforma sem o repositório (imagem minetune-mc, pasta de config vazia):
# copia a configuração inicial sem sobrescrever nada. No compose.yaml local a pasta é só leitura
# e não há padrões na imagem da itzg, então isto não faz nada.
DEFAULTS_DIR=/minetune/defaults
if [[ -d "$DEFAULTS_DIR" && -w "$CONFIG_DIR" ]]; then
  first_boot=false
  [[ -f "$SERVER_ENV" ]] || first_boot=true
  # Arquivo a arquivo em vez de `cp -n`: nas coreutils novas o -n sai com erro quando o
  # arquivo já existe, e com `set -e` isso impediria o servidor de ligar.
  while IFS= read -r -d '' file; do
    target="$CONFIG_DIR/${file#"$DEFAULTS_DIR"/}"
    if [[ ! -e "$target" ]]; then
      mkdir -p "$(dirname "$target")"
      cp "$file" "$target"
    fi
  done < <(find "$DEFAULTS_DIR" -type f -print0)
  if [[ "$first_boot" == true ]]; then
    log "Configuração inicial copiada para $CONFIG_DIR"
    # Máquinas com pouca RAM (Umbrel de 8 GB): a heap padrão de 4G não cabe no limite do container.
    # Só na primeira cópia; depois vale o que for salvo pelo painel.
    initial_memory="${MINETUNE_INITIAL_MEMORY:-}"
    # Sem valor definido, a heap cabe no limite do container: com 4 GB ou menos, a padrão de 4G
    # não deixa espaço para a JVM e o servidor não liga. Deixa ~1 GB livre, mínimo de 1G.
    if [[ -z "$initial_memory" ]]; then
      limit_bytes=""
      if [[ -r /sys/fs/cgroup/memory.max ]]; then
        limit_bytes="$(cat /sys/fs/cgroup/memory.max)"
      elif [[ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]]; then
        limit_bytes="$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)"
      fi
      if [[ "$limit_bytes" =~ ^[0-9]+$ ]] && (( limit_bytes < 5 * 1024 * 1024 * 1024 )); then
        heap_gb=$(( (limit_bytes / 1024 / 1024 - 1024) / 1024 ))
        if (( heap_gb < 1 )); then heap_gb=1; fi
        initial_memory="${heap_gb}G"
      fi
    fi
    if [[ -n "$initial_memory" ]]; then
      sed -i -E "s/^MEMORY=.*/MEMORY=\"${initial_memory}\"/" "$SERVER_ENV"
      log "Memória inicial do servidor: $initial_memory"
    fi
  fi
fi

# Chaves de infraestrutura: vêm do compose e não podem ser sobrescritas pelo server.env.
PROTECTED_KEYS=(EULA ENABLE_RCON RCON_PASSWORD RCON_PORT SERVER_PORT TZ MINETUNE_GATE)
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

# Sem limite de uma conexão a cada 4s por IP: atrás de túnel (playit) ou proxy todos os
# jogadores chegam com o mesmo IP, e quem entrasse logo depois de outro era recusado.
if [[ "$loader" == "paper" ]]; then
  add_patches bukkit
fi

# Portão Minetune na frente: o Paper passa a aceitar só quem chega por ele e recebe o IP real
# de cada jogador (encaminhamento do Velocity, assinado com um segredo dividido com o portão).
# Assim /ban-ip e os logs usam o IP de verdade, e ninguém entra direto na porta do servidor.
# Vanilla, Fabric e NeoForge não têm isso: o portão cuida dos bans por IP sozinho.
# Em modo online (contas originais) o portão só repassa e o Paper autentica normalmente,
# então o encaminhamento fica desligado: com ele ligado o Paper deixaria de conferir as contas.
online_mode="${ONLINE_MODE:-TRUE}"
# A janela de senha existe a partir da 1.21.6 (26.x incluso). Antes disso o portão também só repassa.
gate_dialogs=true
if [[ "${VERSION:-LATEST}" =~ ^1\.([0-9]+)(\.([0-9]+))? ]]; then
  gate_minor=${BASH_REMATCH[1]}
  gate_patch=${BASH_REMATCH[3]:-0}
  if (( gate_minor < 21 || (gate_minor == 21 && gate_patch < 6) )); then gate_dialogs=false; fi
fi
if [[ "${MINETUNE_GATE:-false}" == "true" && "$loader" == "paper" && ( "${online_mode,,}" != "false" || "$gate_dialogs" == "false" ) ]]; then
  cat >"$patches_dir/minetune-gate.json" <<'EOF'
{
  "file": "/data/config/paper-global.yml",
  "ops": [
    { "$set": { "path": "$['proxies']['velocity']['enabled']", "value": false } }
  ]
}
EOF
  if [[ "$gate_dialogs" == "false" ]]; then
    log "Portão Minetune: a versão ${VERSION} não tem janela de senha, o portão só repassa as conexões"
  else
    log "Portão Minetune: modo online, o portão só repassa as conexões"
  fi
elif [[ "${MINETUNE_GATE:-false}" == "true" && "$loader" == "paper" ]]; then
  gate_secret_file=/data/minetune-gate/forwarding.secret
  mkdir -p "$(dirname "$gate_secret_file")"
  if [[ ! -s "$gate_secret_file" ]]; then
    (umask 077 && head -c 32 /dev/urandom | base64 | tr -d '\n/+=' >"$gate_secret_file")
  fi
  gate_secret="$(tr -d '\n' <"$gate_secret_file")"
  # O paper-global.yml só existe depois do primeiro boot; até lá o portão funciona sem o IP real.
  cat >"$patches_dir/minetune-gate.json" <<EOF
{
  "file": "/data/config/paper-global.yml",
  "ops": [
    { "\$set": { "path": "\$['proxies']['velocity']['enabled']", "value": true } },
    { "\$set": { "path": "\$['proxies']['velocity']['online-mode']", "value": false } },
    { "\$set": { "path": "\$['proxies']['velocity']['secret']", "value": "$gate_secret" } }
  ]
}
EOF
  log "Portão Minetune: servidor aceita só conexões vindas do portão"
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
