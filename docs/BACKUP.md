# Backups e recuperação

## Como funciona

| Quando | Quem | Tag |
|---|---|---|
| A cada `BACKUP_INTERVAL` (padrão 6h) | container `backup` | *(sem tag extra)* |
| Botão "Fazer backup agora" / `make backup` | painel / CLI | `manual` |
| Antes de restaurar | painel / CLI | `pre-restore` |
| Antes de aplicar mudança sensível (versão, tipo...) | painel | `pre-config-change` |
| `make update` | CLI | `pre-update` |

Cada backup força o servidor a gravar tudo em disco (`save-all flush`) com o
autosave pausado. O snapshot sai consistente sem desligar o servidor.

Com `BACKUP_PAUSE_IF_NO_PLAYERS=true`, o agendador não repete backups enquanto
ninguém joga, porque o mundo não mudou.

**Fica fora do backup** (`BACKUP_EXCLUDES`): jar do servidor, bibliotecas,
logs e cache. Tudo isso é baixado de novo no boot. Plugins, configs, whitelist,
ops e mundos entram.

> A **senha do restic** (`RESTIC_PASSWORD`) criptografa o repositório. Sem ela,
> os backups são irrecuperáveis. Guarde-a num gerenciador de senhas, **fora** do servidor.

## Destinos

### Pelo painel (recomendado)

Na página **Backups → Destino → Configurar**, escolha onde guardar (disco local,
Cloudflare R2, AWS S3, S3 próprio como RustFS/MinIO, ou um repositório restic
qualquer em "Avançado"), a frequência, quantos backups manter e o limite de
upload. **Testar conexão** confere o destino antes de salvar e diz se ele já tem
backups ou está vazio. **Salvar e aplicar** cria o repositório se precisar e
reinicia o agendador.

O painel grava tudo em `config/backup.env` (permissão `600`, ignorado pelo git),
que tem prioridade sobre o `.env`. O container `backup` relê o arquivo a cada
início. A `RESTIC_PASSWORD` fica **só** no `.env`: trocar a senha deixaria os
backups existentes ilegíveis.

Ao trocar de destino, os backups antigos continuam no destino anterior. O
primeiro backup no novo destino é completo.

### Pelo `.env`

Sem `config/backup.env`, valem as variáveis abaixo. Troque e rode `make up`.

### Disco local (padrão)

```env
RESTIC_REPOSITORY=/backups/restic       # = ./backups/restic no host
```

Protege contra erro humano, plugin que corrompe o mundo e grief. **Não protege
contra perda do disco ou da máquina.** Use como ponto de partida e configure um
destino externo.

### Cloudflare R2 (recomendado para começar)

Sem cobrança de saída de dados (restaurar é gratuito) e com cota grátis generosa.

1. Painel da Cloudflare → R2 → **Create bucket** (ex.: `minetune-backups`)
2. R2 → **Manage API tokens** → *Object Read & Write*, restrito ao bucket
3. `.env`:

```env
RESTIC_REPOSITORY=s3:https://<ACCOUNT_ID>.r2.cloudflarestorage.com/minetune-backups
AWS_ACCESS_KEY_ID=<access key do token>
AWS_SECRET_ACCESS_KEY=<secret do token>
AWS_DEFAULT_REGION=auto
```

Crie o bucket antes: um token restrito a um bucket não consegue criá-lo.

### AWS S3

```env
RESTIC_REPOSITORY=s3:s3.sa-east-1.amazonaws.com/minetune-backups
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=sa-east-1
```

Política IAM mínima: `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`,
`s3:DeleteObject` no bucket. Considere a classe *Standard-IA* via lifecycle.

### RustFS (S3 próprio)

**Na mesma máquina** (útil para testar o fluxo S3):

```env
COMPOSE_FILE=compose.yaml:compose.s3-local.yaml
RESTIC_REPOSITORY=s3:http://rustfs:9000/minetune-backups
AWS_ACCESS_KEY_ID=minetune
AWS_SECRET_ACCESS_KEY=<gere uma senha longa>
AWS_DEFAULT_REGION=us-east-1
```

O bucket é criado no primeiro backup. O console do RustFS fica em
`http://localhost:9001`.

**Em outra máquina** (NAS, mini-PC, casa de um amigo), o jeito certo de ter
backup fora do servidor sem pagar nuvem:

```bash
# na máquina de backup
docker compose -f compose.s3-local.yaml up -d rustfs   # com AWS_* definidos no .env
# exponha a porta 9000 só para o IP do servidor (firewall/VPN/Tailscale)
```

```env
# no servidor
RESTIC_REPOSITORY=s3:http://192.168.0.50:9000/minetune-backups
```

MinIO ou qualquer S3 compatível funciona igual.

### Regra 3-2-1

Para um servidor com que você se importa: backup local (restore rápido) **e**
remoto (R2/S3/RustFS externo). Hoje o agendador envia para um destino; para dois,
rode um `restic copy` periódico do repositório local para o remoto ou use o
remoto como destino principal.

## Retenção

```env
BACKUP_RETENTION=--keep-last 4 --keep-daily 7 --keep-weekly 4 --keep-monthly 6
```

Aplicada após cada backup agendado, com `restic forget --prune`. Com o padrão
você tem as últimas 4 cópias, uma por dia na última semana, uma por semana no
último mês e uma por mês no último semestre.

## Restaurar

### Pelo painel

Backups → escolha o snapshot → **Restaurar** → digite `RESTAURAR`.

O painel faz backup do estado atual, para o servidor, restaura, troca os
arquivos com rollback em caso de erro e liga de novo.

### Pela linha de comando

```bash
make snapshots
make restore SNAPSHOT=a1b2c3d4      # ou SNAPSHOT=latest
```

### Recuperação de desastre (máquina nova)

```bash
git clone <seu repo> minetune && cd minetune
cp /caminho/seguro/.env .env        # ou make init e preencha RESTIC_* e AWS_* com os valores antigos
docker compose up -d docker-proxy panel
make restore SNAPSHOT=latest        # restaura para ./data
make up
```

`INSTANCE_NAME` precisa ser o mesmo da máquina antiga. Os snapshots são filtrados por ele.

### Restaurar só um arquivo ou pasta

Use o restic direto, sem mexer no servidor:

```bash
docker compose exec panel restic snapshots
docker compose exec panel restic restore <id>:/data/world/playerdata --target /data/.minetune/extract
# arquivos em ./data/.minetune/extract
```

## Verificar a saúde dos backups

```bash
docker compose exec panel restic check               # estrutura do repositório
docker compose exec panel restic check --read-data-subset=5%   # amostra dos dados
```

Teste um restore completo de tempos em tempos numa pasta separada. Backup que
nunca foi restaurado é só uma hipótese.
