#!/usr/bin/env bash
# Cria o .env a partir do .env.example, gerando segredos aleatórios.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo ".env já existe — nada foi alterado."
  exit 0
fi

random() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }

# Preenche KEY= somente se estiver vazio no template.
set_if_empty() {
  local key=$1 value=$2
  awk -v k="$key" -v v="$value" '
    index($0, k"=") == 1 && length($0) == length(k) + 1 { print k "=" v; next }
    { print }
  ' .env >.env.tmp && mv .env.tmp .env
}

umask 077
cp .env.example .env

panel_password=$(random 20)
restic_password=$(random 40)

set_if_empty RCON_PASSWORD "$(random 32)"
set_if_empty PANEL_PASSWORD "$panel_password"
set_if_empty PANEL_SESSION_SECRET "$(random 64)"
set_if_empty RESTIC_PASSWORD "$restic_password"
# O awk recria o arquivo: garante a permissão no final, não no começo.
chmod 600 .env

umask 022
mkdir -p data backups

cat <<EOF
.env criado.

  Senha do painel ........ $panel_password
  Senha dos backups ...... $restic_password

GUARDE A SENHA DOS BACKUPS FORA DESTE SERVIDOR (gerenciador de senhas).
Sem ela, nenhum backup pode ser restaurado.

Próximo passo: make up   ->   painel em http://localhost:8080
EOF
