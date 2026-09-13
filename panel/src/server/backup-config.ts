/**
 * config/backup.env: destino, agenda e retenção dos backups salvos pelo painel.
 *
 * O arquivo usa os nomes que o container itzg/mc-backup entende e é carregado
 * pelo docker/backup/entrypoint.sh a cada start, então aplicar = reiniciar o
 * agendador (o proxy do Docker permite; recriar o container, não). Enquanto o
 * arquivo não existe, valem as variáveis do .env, como antes.
 *
 * Tem segredos: gravado com permissão 600 e ignorado pelo git.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  destinationFromRepository,
  regionFor,
  repositoryFor,
  retentionArgs,
  scheduleFromEnv,
  usesS3Credentials,
  type BackupSettings,
  type BackupSettingsInput,
} from '../shared/backup-destination.ts';
import type { BaseConfig } from './config.ts';
import { EnvDocument, quoteValue } from './env-file.ts';

export const BACKUP_ENV_KEYS = [
  'RESTIC_REPOSITORY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_DEFAULT_REGION',
  'BACKUP_INTERVAL',
  'PRUNE_RESTIC_RETENTION',
  'PAUSE_IF_NO_PLAYERS',
  'RESTIC_LIMIT_UPLOAD',
] as const;

export type BackupEnv = Record<(typeof BACKUP_ENV_KEYS)[number], string>;

export class BackupConfig {
  private readonly path: string;
  private readonly base: BaseConfig;
  private readonly env: NodeJS.ProcessEnv;

  constructor(configDir: string, base: BaseConfig, env: NodeJS.ProcessEnv = process.env) {
    this.path = join(configDir, 'backup.env');
    this.base = base;
    this.env = env;
  }

  private async readFileValues(): Promise<Record<string, string> | null> {
    try {
      return new EnvDocument(await readFile(this.path, 'utf8')).toRecord();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /** Valores em uso: backup.env por cima do que veio do .env pelo compose. */
  async effective(): Promise<{ env: BackupEnv; managedByPanel: boolean }> {
    const file = await this.readFileValues();
    const fallback: BackupEnv = {
      RESTIC_REPOSITORY: this.base.RESTIC_REPOSITORY,
      AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID ?? '',
      AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY ?? '',
      AWS_DEFAULT_REGION: this.env.AWS_DEFAULT_REGION ?? 'auto',
      BACKUP_INTERVAL: this.base.BACKUP_INTERVAL,
      PRUNE_RESTIC_RETENTION: this.base.BACKUP_RETENTION,
      PAUSE_IF_NO_PLAYERS: this.env.BACKUP_PAUSE_IF_NO_PLAYERS ?? 'true',
      RESTIC_LIMIT_UPLOAD: this.env.RESTIC_LIMIT_UPLOAD ?? '0',
    };
    if (!file) return { env: fallback, managedByPanel: false };
    const env = { ...fallback };
    for (const key of BACKUP_ENV_KEYS) if (file[key] !== undefined) env[key] = file[key]!;
    return { env, managedByPanel: true };
  }

  async settings(): Promise<{ settings: BackupSettings; hasSecret: boolean; managedByPanel: boolean }> {
    const { env, managedByPanel } = await this.effective();
    const settings: BackupSettings = {
      destination: destinationFromRepository(env.RESTIC_REPOSITORY, env.AWS_DEFAULT_REGION, env.AWS_ACCESS_KEY_ID),
      schedule: scheduleFromEnv({
        interval: env.BACKUP_INTERVAL,
        retention: env.PRUNE_RESTIC_RETENTION,
        pauseIfNoPlayers: env.PAUSE_IF_NO_PLAYERS,
        uploadLimitKib: env.RESTIC_LIMIT_UPLOAD,
      }),
    };
    return { settings, hasSecret: env.AWS_SECRET_ACCESS_KEY !== '', managedByPanel };
  }

  /** Variáveis que valeriam com esta configuração (usado para testar antes de salvar). */
  async candidate(input: BackupSettingsInput): Promise<BackupEnv> {
    const { env: current } = await this.effective();
    const d = input.destination;
    const s3 = usesS3Credentials(d.provider);
    const keepSecret = s3 && !input.secretAccessKey?.trim() && d.accessKeyId.trim() === current.AWS_ACCESS_KEY_ID;
    return {
      RESTIC_REPOSITORY: repositoryFor(d),
      AWS_ACCESS_KEY_ID: s3 ? d.accessKeyId.trim() : '',
      AWS_SECRET_ACCESS_KEY: s3 ? (keepSecret ? current.AWS_SECRET_ACCESS_KEY : (input.secretAccessKey?.trim() ?? '')) : '',
      AWS_DEFAULT_REGION: regionFor(d),
      BACKUP_INTERVAL: input.schedule.interval,
      PRUNE_RESTIC_RETENTION: retentionArgs(input.schedule),
      PAUSE_IF_NO_PLAYERS: String(input.schedule.pauseIfNoPlayers),
      RESTIC_LIMIT_UPLOAD: String(Math.round(input.schedule.uploadLimitMb * 1024)),
    };
  }

  /** Segredo só pode ser mantido se a chave de acesso não mudou. */
  async canKeepSecret(input: BackupSettingsInput): Promise<boolean> {
    const { env } = await this.effective();
    return env.AWS_SECRET_ACCESS_KEY !== '' && input.destination.accessKeyId.trim() === env.AWS_ACCESS_KEY_ID;
  }

  async save(env: BackupEnv): Promise<void> {
    const lines = [
      '# =============================================================================',
      '# Backups: destino, agenda e retenção. Gerado pelo painel (página Backups).',
      '#',
      '# Tem segredos: não versione. Pode editar à mão (sintaxe shell) e reiniciar o',
      '# container `backup`. RESTIC_PASSWORD continua no .env de propósito: trocar a',
      '# senha deixaria os backups existentes ilegíveis.',
      '# =============================================================================',
      '',
      ...BACKUP_ENV_KEYS.map((key) => `${key}=${quoteValue(env[key])}`),
      '',
    ];
    await mkdir(join(this.path, '..'), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}`;
    await writeFile(tmp, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, this.path);
  }
}

/** Traduz os erros mais comuns do restic/S3 para algo que dá para agir. */
export function explainBackupError(message: string): string {
  const rules: [RegExp, string][] = [
    [/wrong password|no key found|ciphertext verification/i, 'O destino já tem um repositório criado com outra senha (RESTIC_PASSWORD do .env).'],
    // RustFS/MinIO escrevem "Access Denied" com espaço; AWS e R2, "AccessDenied".
    [/SignatureDoesNotMatch|InvalidAccessKeyId|Access ?Denied|\b403\b|Forbidden|Unauthorized|\b401\b/i, 'O destino recusou as credenciais. Confira a chave de acesso, o segredo e as permissões do token no bucket.'],
    [/NoSuchBucket|bucket does not exist|The specified bucket does not exist/i, 'Bucket não encontrado. Crie o bucket no provedor ou confira o nome.'],
    [/no such host|dial tcp|connection refused|i\/o timeout|Tempo esgotado|network is unreachable|TLS handshake/i, 'Não foi possível conectar ao endereço do destino. Confira o endereço, a porta e o firewall.'],
    [/permission denied/i, 'Sem permissão para gravar no destino.'],
  ];
  const match = rules.find(([pattern]) => pattern.test(message));
  return match ? `${match[1]} (${message.slice(0, 180)})` : message;
}
