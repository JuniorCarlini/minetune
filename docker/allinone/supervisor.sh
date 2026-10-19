#!/usr/bin/env bash
# =============================================================================
# Supervisor do container único (ghcr.io/juniorcarlini/minetune).
#
# Roda como usuário 1000, filho do tini (PID 1, que recolhe processos órfãos), e cuida de
# quatro processos, os mesmos da instalação em vários containers:
#
#   mc      servidor Minecraft (wrapper docker/minecraft/entrypoint.sh + imagem da itzg)
#   gate    Portão Minetune, dono da porta do jogo (25565); o servidor fica em 25566 local
#   backup  agendador de backups (backup-loop do itzg/mc-backup + restic)
#   panel   painel web (8080), em MINETUNE_CONTROL=local: sem API do Docker
#
# Por que bash e não s6/supervisord/Node: são quatro processos e um protocolo pequeno; o
# bash já vem na imagem, ocupa ~4 MB e não traz outra árvore de processos para entender.
#
# O que faz:
#   - religa quem cai, com espera crescente (1 s, 2 s, 4 s... até 60 s), como o
#     `restart: unless-stopped` do Docker; com MINETUNE_MC_MAX_RESTARTS > 0 desiste do
#     servidor depois de tantas quedas seguidas e sai com erro, para a plataforma agir.
#   - atende pedidos do painel em $RUN_DIR/control/*.cmd ("start|stop|restart mc|gate|backup")
#     e grava o estado de cada processo em $RUN_DIR/state/<nome>.json (ver local-control.ts).
#   - guarda a saída de cada um em /data/.minetune/logs/<nome>.log (o console do painel lê o
#     do servidor), girando os arquivos acima de 10 MB.
#   - no SIGTERM (docker stop) para agendador, portão e painel e manda o SIGTERM ao servidor,
#     que avisa os jogadores, salva o mundo e desliga (até STOP_DURATION, 60 s).
#     Use stop_grace_period/--stop-timeout de 90 s ou mais.
# =============================================================================
set -uo pipefail
shopt -s nullglob

log() { printf '[minetune] %s\n' "$*"; }

STATE_ROOT=/data/.minetune
RUN_DIR="${MINETUNE_RUN_DIR:-/tmp/minetune}"
LOG_DIR="${MINETUNE_LOG_DIR:-$STATE_ROOT/logs}"
CONFIG_DIR="${MINETUNE_CONFIG_DIR:-/data/minetune-config}"
SECRETS_FILE="$STATE_ROOT/secrets.env"
# Servidor desligado pelo painel continua desligado quando o container volta (reboot da
# máquina), como um container parado pela API do Docker com `restart: unless-stopped`.
MC_STOPPED_FLAG="$STATE_ROOT/mc.stopped"
LOG_MAX_BYTES="${MINETUNE_LOG_MAX_BYTES:-10485760}"
MC_MAX_RESTARTS="${MINETUNE_MC_MAX_RESTARTS:-0}"
# Sem resposta do servidor por esse tempo depois de ligar, ele passa a "com problema".
# A primeira subida baixa servidor e plugins e gera o mundo: ~5 min numa máquina modesta.
BOOT_GRACE="${MINETUNE_BOOT_GRACE:-900}"
STOP_DURATION="${STOP_DURATION:-60}"

# Mesma casa e mesma umask do usuário minecraft na imagem da itzg.
export HOME=/data
umask 0002

# --- Pastas -------------------------------------------------------------------------
mkdir -p "$RUN_DIR/state" "$RUN_DIR/control" "$LOG_DIR" "$CONFIG_DIR" "$STATE_ROOT" || {
  log "ERRO: não consegui criar as pastas em /data e $RUN_DIR (o volume /data é gravável pelo usuário 1000?)"
  exit 1
}
# Estado legível pela verificação de saúde (roda como root sem capabilities); pedidos, só o painel.
chmod 755 "$RUN_DIR" "$RUN_DIR/state"
chmod 700 "$RUN_DIR/control"
rm -f "$RUN_DIR"/state/* "$RUN_DIR"/control/*

# --- Segredos -----------------------------------------------------------------------
# Variável de ambiente sempre vence. Sem ela, usa a gerada na primeira subida (secrets.env).
random_string() {
  local length=$1 out=""
  while ((${#out} < length)); do
    out+=$(head -c 96 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9')
  done
  printf '%s' "${out:0:length}"
}

declare -A saved=()
if [[ -f "$SECRETS_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z_]+$ ]] && saved[$key]="$value"
  done <"$SECRETS_FILE"
fi
new_panel_password=""
for spec in PANEL_PASSWORD:20 PANEL_SESSION_SECRET:48 RCON_PASSWORD:32 RESTIC_PASSWORD:32; do
  key=${spec%%:*}
  [[ -n "${!key:-}" ]] && continue
  if [[ -n "${saved[$key]:-}" ]]; then
    export "$key=${saved[$key]}"
    continue
  fi
  value="$(random_string "${spec#*:}")"
  (umask 077 && printf '%s=%s\n' "$key" "$value" >>"$SECRETS_FILE")
  export "$key=$value"
  [[ "$key" == PANEL_PASSWORD ]] && new_panel_password="$value"
done
[[ -f "$SECRETS_FILE" ]] && chmod 600 "$SECRETS_FILE"
unset saved

# --- Ambiente derivado ----------------------------------------------------------------
export INSTANCE_NAME="${INSTANCE_NAME:-minetune}"
export RESTIC_HOST="${RESTIC_HOST:-$INSTANCE_NAME}"
export CONFIG_DIR GATE_CONFIG_DIR="$CONFIG_DIR"

# Configuração inicial do jogo (padrões da imagem + memória que cabe no limite do container),
# antes de qualquer processo: o painel já precisa do server.env na primeira subida.
MINETUNE_PREPARE_ONLY=true bash /minetune/bin/minecraft.sh || log "AVISO: falha ao preparar $CONFIG_DIR"

if [[ -n "$new_panel_password" ]]; then
  log "=================================================================="
  log " Senha do painel (aparece só nesta primeira subida): $new_panel_password"
  log " Fica guardada em $SECRETS_FILE, junto da senha dos backups"
  log " (RESTIC_PASSWORD). Sem ela os backups não abrem: guarde uma cópia."
  log "=================================================================="
fi
unset new_panel_password

# --- Processos ------------------------------------------------------------------------
SERVICES=(mc gate backup panel)
# Segredos que cada parte não precisa ver: o servidor roda plugins de terceiros.
PANEL_ONLY=(PANEL_PASSWORD PANEL_SESSION_SECRET)
BACKUP_SECRETS=(RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY)

# Roda num subshell em segundo plano; `exec setsid` mantém o mesmo PID e põe o processo num
# grupo próprio, para o sinal de parar chegar também aos filhos (restic, sleep do agendador).
svc_exec() {
  case "$1" in
    mc)
      unset "${PANEL_ONLY[@]}" "${BACKUP_SECRETS[@]}"
      exec setsid bash /minetune/bin/minecraft.sh
      ;;
    gate)
      unset "${PANEL_ONLY[@]}" "${BACKUP_SECRETS[@]}"
      cd /app && exec setsid node src/server/gate/index.ts
      ;;
    backup)
      unset "${PANEL_ONLY[@]}"
      # Nomes que o backup-loop do itzg/mc-backup entende (no compose vêm do mesmo .env).
      export PRUNE_RESTIC_RETENTION="${BACKUP_RETENTION-}" EXCLUDES="${BACKUP_EXCLUDES-}" \
        PAUSE_IF_NO_PLAYERS="${BACKUP_PAUSE_IF_NO_PLAYERS:-true}" INITIAL_DELAY="${BACKUP_INITIAL_DELAY:-5m}"
      # Como o depends_on: service_healthy do compose: só começa a contar com o servidor de pé.
      exec setsid bash -c 'until mc-health >/dev/null 2>&1; do sleep 10; done; exec bash /minetune/bin/backup.sh loop'
      ;;
    panel)
      cd /app && exec setsid node src/server/index.ts
      ;;
  esac
}

declare -A PID=() WANT=() STATE=() STARTED=() FINISHED=() CODE=() RESTARTS=() STARTS=() FAILS=() NEXT=() KILL_AT=() AFTER_STOP=() UP_AT=()
HEALTH=""
HC_PID=""
HC_LAST=0
HC_FAILS=0
HC_OK=0
SHUTDOWN_REQUESTED=0
SHUTTING_DOWN=0
FATAL=0

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

write_state() {
  local name=$1 file="$RUN_DIR/state/$1.json" health=""
  [[ "$name" == mc ]] && health="$HEALTH"
  printf '{"state":"%s","want":"%s","pid":%d,"startedAt":"%s","finishedAt":"%s","exitCode":%d,"restarts":%d,"starts":%d,"health":"%s"}\n' \
    "${STATE[$name]}" "${WANT[$name]}" "${PID[$name]:-0}" "${STARTED[$name]}" "${FINISHED[$name]}" \
    "${CODE[$name]:-0}" "${RESTARTS[$name]}" "${STARTS[$name]}" "$health" >"$file.tmp" && mv -f "$file.tmp" "$file"
}

# Vivo e não zumbi, sem abrir outro processo (é chamado a cada segundo).
alive() {
  local line
  [[ -n "$1" ]] && read -r line 2>/dev/null <"/proc/$1/stat" || return 1
  line=${line##*) }
  [[ "${line%% *}" != Z ]]
}

set_health() {
  [[ "$HEALTH" == "$1" ]] && return
  HEALTH=$1
  write_state mc
}

start_svc() {
  local name=$1 logfile="$LOG_DIR/$1.log"
  if [[ "$name" == mc ]]; then
    # Sem prefixo: no `docker logs` o servidor aparece como na imagem da itzg.
    svc_exec mc > >(tee -a "$logfile") 2>&1 &
  else
    svc_exec "$name" > >(tee -a "$logfile" | sed -u "s/^/[$name] /") 2>&1 &
  fi
  PID[$name]=$!
  STATE[$name]=running
  STARTED[$name]="$(now_iso)"
  UP_AT[$name]=$EPOCHSECONDS
  STARTS[$name]=$((STARTS[$name] + 1))
  KILL_AT[$name]=0
  if [[ "$name" == mc ]]; then
    HEALTH=starting HC_OK=0 HC_FAILS=0 HC_PID="" HC_LAST=$EPOCHSECONDS
  fi
  write_state "$name"
}

stop_svc() {
  local name=$1 pid=${PID[$1]}
  [[ "${STATE[$name]}" == running && -n "$pid" ]] || return 0
  STATE[$name]=stopping
  if [[ "$name" == mc ]]; then
    # Só o mc-server-runner: ele manda "stop" ao console e espera o mundo ser salvo.
    # Um SIGTERM direto no java no meio disso atrapalharia o desligamento.
    kill -TERM "$pid" 2>/dev/null
    KILL_AT[$name]=$((EPOCHSECONDS + STOP_DURATION + 30))
  else
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    KILL_AT[$name]=$((EPOCHSECONDS + 15))
  fi
  write_state "$name"
}

on_exit() {
  local name=$1 code=$2 uptime delay
  FINISHED[$name]="$(now_iso)"
  CODE[$name]=$code
  KILL_AT[$name]=0
  [[ "$name" == mc ]] && HEALTH=""

  if ((SHUTTING_DOWN)) || [[ "${WANT[$name]}" == down ]]; then
    STATE[$name]=exited
    log "$name parado (código $code)"
  elif [[ "${AFTER_STOP[$name]}" == restart ]]; then
    AFTER_STOP[$name]=""
    log "$name: religando"
    start_svc "$name"
    return
  else
    uptime=$((EPOCHSECONDS - UP_AT[$name]))
    # Ficou de pé um bom tempo: é uma queda nova, não a mesma se repetindo.
    if ((uptime >= 120)); then FAILS[$name]=1; else FAILS[$name]=$((FAILS[$name] + 1)); fi
    RESTARTS[$name]=$((RESTARTS[$name] + 1))
    if [[ "$name" == mc ]] && ((MC_MAX_RESTARTS > 0 && FAILS[mc] > MC_MAX_RESTARTS)); then
      log "ERRO: o servidor caiu ${FAILS[mc]} vezes seguidas; desligando o container"
      STATE[$name]=exited
      write_state "$name"
      FATAL=1
      begin_shutdown
      return
    fi
    delay=$((1 << (FAILS[$name] - 1)))
    ((delay > 60)) && delay=60
    STATE[$name]=restarting
    NEXT[$name]=$((EPOCHSECONDS + delay))
    log "$name parou sozinho (código $code); ligando de novo em ${delay}s"
  fi
  write_state "$name"
}

reap() {
  local name pid code
  for name in "${SERVICES[@]}"; do
    pid=${PID[$name]}
    [[ -n "$pid" ]] || continue
    alive "$pid" && continue
    wait "$pid" 2>/dev/null
    code=$?
    PID[$name]=""
    # O que tiver sobrado no grupo (ex.: download da itzg interrompido no meio da preparação).
    kill -TERM -- "-$pid" 2>/dev/null
    on_exit "$name" "$code"
  done
}

enforce_deadlines() {
  local name pid
  for name in "${SERVICES[@]}"; do
    pid=${PID[$name]}
    if [[ -n "$pid" ]] && ((KILL_AT[$name] > 0 && EPOCHSECONDS >= KILL_AT[$name])); then
      log "$name não desligou a tempo; forçando"
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
      KILL_AT[$name]=0
    fi
  done
}

handle_controls() {
  local file action name
  for file in "$RUN_DIR"/control/*.cmd; do
    action="" name=""
    read -r action name _ <"$file"
    rm -f "$file"
    case "$name" in
      mc | gate | backup) ;;
      *) log "pedido ignorado: $action $name"; continue ;;
    esac
    log "painel pediu: $action $name"
    if [[ "$name" == mc ]]; then
      if [[ "$action" == stop ]]; then : >"$MC_STOPPED_FLAG"; else rm -f "$MC_STOPPED_FLAG"; fi
    fi
    case "$action" in
      start)
        WANT[$name]=up FAILS[$name]=0
        case "${STATE[$name]}" in
          exited | created | restarting) AFTER_STOP[$name]=""; start_svc "$name" ;;
          stopping) AFTER_STOP[$name]=restart ;;
        esac
        ;;
      stop)
        WANT[$name]=down AFTER_STOP[$name]=""
        case "${STATE[$name]}" in
          running) stop_svc "$name" ;;
          restarting | created) STATE[$name]=exited; write_state "$name" ;;
        esac
        ;;
      restart)
        WANT[$name]=up FAILS[$name]=0
        case "${STATE[$name]}" in
          running) AFTER_STOP[$name]=restart; stop_svc "$name" ;;
          stopping) AFTER_STOP[$name]=restart ;;
          *) AFTER_STOP[$name]=""; start_svc "$name" ;;
        esac
        ;;
      *) log "pedido ignorado: $action $name" ;;
    esac
  done
}

start_due() {
  local name
  for name in "${SERVICES[@]}"; do
    if [[ "${STATE[$name]}" == restarting && "${WANT[$name]}" == up ]] && ((EPOCHSECONDS >= NEXT[$name])); then
      start_svc "$name"
    fi
  done
}

# Mesma verificação da imagem da itzg (mc-health), em segundo plano para não travar os pedidos:
# a cada 10 s enquanto liga, a cada 30 s depois. Três falhas seguidas = com problema.
health_tick() {
  local rc interval=30
  [[ "${STATE[mc]}" == running ]] || return 0
  if [[ -n "$HC_PID" ]]; then
    alive "$HC_PID" && return 0
    wait "$HC_PID" 2>/dev/null
    rc=$?
    HC_PID=""
    if ((rc == 0)); then
      HC_OK=1 HC_FAILS=0
      set_health healthy
    else
      HC_FAILS=$((HC_FAILS + 1))
      if ((HC_OK && HC_FAILS >= 3)) || ((!HC_OK && EPOCHSECONDS - UP_AT[mc] > BOOT_GRACE)); then
        set_health unhealthy
      fi
    fi
  fi
  ((HC_OK)) || interval=10
  if ((EPOCHSECONDS - HC_LAST >= interval)); then
    HC_LAST=$EPOCHSECONDS
    timeout 10 mc-health >/dev/null 2>&1 &
    HC_PID=$!
  fi
}

rotate_logs() {
  local file size
  for file in "$LOG_DIR"/*.log; do
    size=$(stat -c %s "$file" 2>/dev/null) || continue
    # Copia e esvazia: o tee de cada processo segue escrevendo no mesmo arquivo aberto.
    if ((size > LOG_MAX_BYTES)); then cp -f "$file" "$file.1" && : >"$file"; fi
  done
}

begin_shutdown() {
  local name
  SHUTTING_DOWN=1
  log "Desligando: o servidor salva o mundo antes de sair (até ${STOP_DURATION}s)"
  for name in backup gate panel mc; do
    WANT[$name]=down AFTER_STOP[$name]=""
    case "${STATE[$name]}" in
      running) stop_svc "$name" ;;
      restarting | created) STATE[$name]=exited; write_state "$name" ;;
    esac
  done
}

all_down() {
  local name
  for name in "${SERVICES[@]}"; do [[ -z "${PID[$name]}" ]] || return 1; done
}

trap 'SHUTDOWN_REQUESTED=1' TERM INT

for name in "${SERVICES[@]}"; do
  PID[$name]="" WANT[$name]=up STATE[$name]=created STARTED[$name]="" FINISHED[$name]="" CODE[$name]=0
  RESTARTS[$name]=0 STARTS[$name]=0 FAILS[$name]=0 NEXT[$name]=0 KILL_AT[$name]=0 AFTER_STOP[$name]="" UP_AT[$name]=0
  write_state "$name"
done
if [[ -f "$MC_STOPPED_FLAG" ]]; then
  WANT[mc]=down STATE[mc]=exited
  write_state mc
  log "O servidor foi desligado pelo painel e continua desligado (ligue pela tela Início)"
fi
for name in "${SERVICES[@]}"; do
  [[ "${WANT[$name]}" == up ]] && start_svc "$name"
done
log "Processos ligados: ${SERVICES[*]} (painel na porta ${PORT:-8080}, jogo na ${GATE_PORT:-25565})"

tick=0
while :; do
  if ((SHUTDOWN_REQUESTED && !SHUTTING_DOWN)); then begin_shutdown; fi
  reap
  if ((SHUTTING_DOWN)); then
    all_down && break
  else
    handle_controls
    start_due
    health_tick
    ((tick % 60 == 0)) && rotate_logs
  fi
  enforce_deadlines
  tick=$((tick + 1))
  sleep 1 &
  wait $! 2>/dev/null
done

log "Tudo desligado"
exit $((FATAL ? 1 : 0))
