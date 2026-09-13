/**
 * Destino, agenda e retenção dos backups, no formato que o painel edita.
 *
 * O arquivo config/backup.env guarda o que o container de backup entende
 * (RESTIC_REPOSITORY, AWS_*, BACKUP_INTERVAL...). Aqui ficam as conversões entre
 * esse formato e o formulário, e a validação usada pela API e pela UI.
 */

export const BACKUP_PROVIDERS = ['local', 'r2', 's3', 's3-compatible', 'custom'] as const;
export type BackupProvider = (typeof BACKUP_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<BackupProvider, string> = {
  local: 'Disco local',
  r2: 'Cloudflare R2',
  s3: 'AWS S3',
  's3-compatible': 'S3 próprio',
  custom: 'Avançado',
};

export const LOCAL_REPOSITORY = '/backups/restic';

export interface BackupDestination {
  provider: BackupProvider;
  /** R2: ID da conta Cloudflare. */
  accountId: string;
  /** S3 próprio: endereço do servidor, ex.: http://192.168.0.50:9000. */
  endpoint: string;
  /** AWS e S3 próprio. */
  region: string;
  bucket: string;
  /** Pasta dentro do bucket (opcional). */
  prefix: string;
  accessKeyId: string;
  /** Avançado: repositório restic escrito à mão (sftp:, rest:, b2:...). */
  repository: string;
}

export interface BackupSchedule {
  /** Formato do agendador: 30m, 6h, 1d. */
  interval: string;
  keepLast: number;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  pauseIfNoPlayers: boolean;
  /** MB/s; 0 = sem limite. */
  uploadLimitMb: number;
}

export interface BackupSettings {
  destination: BackupDestination;
  schedule: BackupSchedule;
}

/** Na gravação, segredo vazio mantém o que já está salvo. */
export interface BackupSettingsInput extends BackupSettings {
  secretAccessKey?: string;
}

export const INTERVAL_OPTIONS = [
  { value: '1h', label: 'A cada 1 hora' },
  { value: '3h', label: 'A cada 3 horas' },
  { value: '6h', label: 'A cada 6 horas (recomendado)' },
  { value: '12h', label: 'A cada 12 horas' },
  { value: '24h', label: 'Uma vez por dia' },
];

export const DEFAULT_SCHEDULE: BackupSchedule = {
  interval: '6h',
  keepLast: 4,
  keepDaily: 7,
  keepWeekly: 4,
  keepMonthly: 6,
  pauseIfNoPlayers: true,
  uploadLimitMb: 0,
};

export const emptyDestination = (provider: BackupProvider = 'local'): BackupDestination => ({
  provider,
  accountId: '',
  endpoint: '',
  region: '',
  bucket: '',
  prefix: '',
  accessKeyId: '',
  repository: '',
});

const cleanPrefix = (prefix: string) => prefix.trim().replace(/^\/+|\/+$/g, '');
const withPrefix = (base: string, prefix: string) => (cleanPrefix(prefix) ? `${base}/${cleanPrefix(prefix)}` : base);

/** Monta o RESTIC_REPOSITORY a partir do formulário. */
export function repositoryFor(d: BackupDestination): string {
  switch (d.provider) {
    case 'local':
      return LOCAL_REPOSITORY;
    case 'r2':
      return withPrefix(`s3:https://${d.accountId.trim()}.r2.cloudflarestorage.com/${d.bucket.trim()}`, d.prefix);
    case 's3':
      return withPrefix(`s3:s3.${d.region.trim()}.amazonaws.com/${d.bucket.trim()}`, d.prefix);
    case 's3-compatible':
      return withPrefix(`s3:${d.endpoint.trim().replace(/\/+$/, '')}/${d.bucket.trim()}`, d.prefix);
    case 'custom':
      return d.repository.trim();
  }
}

/** Região enviada ao S3: R2 usa "auto"; servidores S3 próprios aceitam qualquer uma. */
export function regionFor(d: BackupDestination): string {
  if (d.provider === 's3') return d.region.trim();
  if (d.provider === 's3-compatible') return d.region.trim() || 'us-east-1';
  return 'auto';
}

export const usesS3Credentials = (provider: BackupProvider) => provider === 'r2' || provider === 's3' || provider === 's3-compatible';

/** Caminho inverso: lê um RESTIC_REPOSITORY existente (ex.: vindo do .env) de volta no formulário. */
export function destinationFromRepository(repository: string, region = '', accessKeyId = ''): BackupDestination {
  const repo = repository.trim();
  const base = { ...emptyDestination(), accessKeyId, region: region === 'auto' ? '' : region };

  if (!repo || repo === LOCAL_REPOSITORY) return { ...base, provider: 'local', accessKeyId: '' };

  const r2 = repo.match(/^s3:https:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com\/([^/]+)(?:\/(.+))?$/i);
  if (r2) return { ...base, provider: 'r2', accountId: r2[1]!, bucket: r2[2]!, prefix: r2[3] ?? '', region: '' };

  const aws = repo.match(/^s3:(?:https:\/\/)?s3[.-]([a-z0-9-]+)\.amazonaws\.com\/([^/]+)(?:\/(.+))?$/i);
  if (aws) return { ...base, provider: 's3', region: aws[1]!, bucket: aws[2]!, prefix: aws[3] ?? '' };

  const compatible = repo.match(/^s3:(https?:\/\/[^/]+)\/([^/]+)(?:\/(.+))?$/i);
  if (compatible) return { ...base, provider: 's3-compatible', endpoint: compatible[1]!, bucket: compatible[2]!, prefix: compatible[3] ?? '' };

  return { ...base, provider: 'custom', repository: repo };
}

export function retentionArgs(s: BackupSchedule): string {
  return [
    ['last', s.keepLast],
    ['daily', s.keepDaily],
    ['weekly', s.keepWeekly],
    ['monthly', s.keepMonthly],
  ]
    .filter(([, n]) => Number(n) > 0)
    .map(([kind, n]) => `--keep-${kind} ${n}`)
    .join(' ');
}

/** Lê a agenda das variáveis do agendador; o que faltar fica no padrão. */
export function scheduleFromEnv(env: {
  interval?: string;
  retention?: string;
  pauseIfNoPlayers?: string;
  uploadLimitKib?: string;
}): BackupSchedule {
  const keep = (kind: string, fallback: number) => {
    if (!env.retention) return fallback;
    const match = env.retention.match(new RegExp(`--keep-${kind}[ =](\\d+)`));
    return match ? Number(match[1]) : 0;
  };
  const kib = Number(env.uploadLimitKib ?? 0);
  return {
    interval: env.interval || DEFAULT_SCHEDULE.interval,
    keepLast: keep('last', DEFAULT_SCHEDULE.keepLast),
    keepDaily: keep('daily', DEFAULT_SCHEDULE.keepDaily),
    keepWeekly: keep('weekly', DEFAULT_SCHEDULE.keepWeekly),
    keepMonthly: keep('monthly', DEFAULT_SCHEDULE.keepMonthly),
    pauseIfNoPlayers: (env.pauseIfNoPlayers ?? 'true').toLowerCase() !== 'false',
    uploadLimitMb: Number.isFinite(kib) && kib > 0 ? Math.round((kib / 1024) * 10) / 10 : 0,
  };
}

export function describeInterval(interval: string): string {
  const option = INTERVAL_OPTIONS.find((o) => o.value === interval);
  if (option) return option.label.replace(' (recomendado)', '').toLowerCase();
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) return interval;
  const unit = { m: ['minuto', 'minutos'], h: ['hora', 'horas'], d: ['dia', 'dias'] }[match[2] as 'm' | 'h' | 'd'];
  return `a cada ${match[1]} ${match[1] === '1' ? unit[0] : unit[1]}`;
}

export function describeRetention(s: BackupSchedule): string {
  const parts = [
    [s.keepLast, 'último', 'últimos'],
    [s.keepDaily, 'diário', 'diários'],
    [s.keepWeekly, 'semanal', 'semanais'],
    [s.keepMonthly, 'mensal', 'mensais'],
  ] as const;
  return (
    parts
      .filter(([n]) => n > 0)
      .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
      .join(' · ') || 'sem retenção'
  );
}

/** Nunca mostra credenciais embutidas na URL do repositório. */
export const maskRepository = (repository: string) => repository.replace(/\/\/[^/@]+@/, '//***@');

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const PREFIX = /^[A-Za-z0-9._/-]*$/;
const ENDPOINT = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/;
const REGION = /^[a-z0-9-]{2,32}$/;
const KEY = /^[\x21-\x7e]{4,256}$/;
const CUSTOM_REPOSITORY = /^(\/\S+|(s3|b2|azure|gs|sftp|rest|rclone|swift):\S+)$/;
const INTERVAL = /^\d{1,4}[mhd]$/;

/**
 * Erros por campo (chaves: accountId, bucket, secretAccessKey, keepLast...).
 * `hasSecret` indica se já existe um segredo salvo que pode ser mantido.
 */
export function validateBackupSettings(input: BackupSettingsInput, { hasSecret }: { hasSecret: boolean }): Record<string, string> {
  const errors: Record<string, string> = {};
  const d = input.destination;
  const s = input.schedule;

  if (!BACKUP_PROVIDERS.includes(d.provider)) errors.provider = 'Destino desconhecido';

  if (d.provider === 'r2' && !/^[a-f0-9]{32}$/i.test(d.accountId.trim())) {
    errors.accountId = 'O ID da conta tem 32 caracteres (painel da Cloudflare → R2 → Account ID)';
  }
  if (d.provider === 's3' && !REGION.test(d.region.trim())) errors.region = 'Use a região do bucket, ex.: us-east-1 ou sa-east-1';
  if (d.provider === 's3-compatible') {
    if (!ENDPOINT.test(d.endpoint.trim())) errors.endpoint = 'Use o endereço completo, ex.: http://192.168.0.50:9000';
    if (d.region.trim() && !REGION.test(d.region.trim())) errors.region = 'Região inválida';
  }
  if (usesS3Credentials(d.provider)) {
    if (!BUCKET.test(d.bucket.trim())) errors.bucket = 'Nome de bucket inválido (minúsculas, números, ponto e hífen)';
    if (!PREFIX.test(d.prefix.trim())) errors.prefix = 'Use só letras, números, ponto, hífen, sublinhado e /';
    if (!KEY.test(d.accessKeyId.trim())) errors.accessKeyId = 'Informe a chave de acesso (Access Key ID)';
    const secret = input.secretAccessKey?.trim() ?? '';
    if (secret && !KEY.test(secret)) errors.secretAccessKey = 'Segredo inválido';
    if (!secret && !hasSecret) errors.secretAccessKey = 'Informe o segredo (Secret Access Key)';
  }
  if (d.provider === 'custom' && !CUSTOM_REPOSITORY.test(d.repository.trim())) {
    errors.repository = 'Repositório restic inválido, ex.: sftp:usuario@host:/backups ou b2:bucket:pasta';
  }

  if (!INTERVAL.test(s.interval)) errors.interval = 'Frequência inválida';
  for (const key of ['keepLast', 'keepDaily', 'keepWeekly', 'keepMonthly'] as const) {
    if (!Number.isInteger(s[key]) || s[key] < 0 || s[key] > 1000) errors[key] = 'Use um número de 0 a 1000';
  }
  if (!errors.keepLast && s.keepLast + s.keepDaily + s.keepWeekly + s.keepMonthly === 0) {
    errors.keepLast = 'Mantenha pelo menos um backup';
  }
  if (!Number.isFinite(s.uploadLimitMb) || s.uploadLimitMb < 0 || s.uploadLimitMb > 10_000) {
    errors.uploadLimitMb = 'Use 0 (sem limite) ou um valor em MB/s';
  }
  return errors;
}
