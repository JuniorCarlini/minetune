import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Configuração comum ao servidor HTTP e à CLI (backup/restore). */
const baseSchema = z.object({
  INSTANCE_NAME: z.string().min(1).default('minetune'),
  DATA_DIR: z.string().default('/data'),
  CONFIG_DIR: z.string().default('/config'),

  RCON_HOST: z.string().default('mc'),
  RCON_PORT: z.coerce.number().int().default(25575),
  RCON_PASSWORD: z.string().min(1, 'RCON_PASSWORD é obrigatório'),

  DOCKER_API: z.url().default('http://docker-proxy:2375'),

  /** Endereço que os amigos usam (domínio ou túnel); vazio = painel deduz pelo navegador. */
  PUBLIC_ADDRESS: z.string().default(''),
  MC_PORT: z.coerce.number().int().default(25565),
  /** Tamanho máximo de um .zip de mundo enviado pelo painel (padrão 8 GB). */
  WORLD_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 ** 3),

  RESTIC_REPOSITORY: z.string().min(1, 'RESTIC_REPOSITORY é obrigatório'),
  RESTIC_PASSWORD: z.string().min(1, 'RESTIC_PASSWORD é obrigatório'),
  RESTIC_HOST: z.string().min(1).default('minetune'),
  BACKUP_NAME: z.string().default('world'),
  BACKUP_EXCLUDES: z.string().default(''),
  BACKUP_RETENTION: z.string().default(''),
  BACKUP_INTERVAL: z.string().default(''),
});

const panelSchema = baseSchema.extend({
  PORT: z.coerce.number().int().default(8080),
  PANEL_PASSWORD: z.string().min(8, 'PANEL_PASSWORD precisa de pelo menos 8 caracteres'),
  PANEL_SESSION_SECRET: z.string().min(32, 'PANEL_SESSION_SECRET precisa de pelo menos 32 caracteres'),
  WEB_DIR: z.string().default(fileURLToPath(new URL('../../dist/web', import.meta.url))),
});

export type BaseConfig = z.infer<typeof baseSchema>;
export type PanelConfig = z.infer<typeof panelSchema>;

function parse<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    console.error(`Configuração inválida:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}

export const loadBaseConfig = (env = process.env): BaseConfig => parse(baseSchema, env);
export const loadPanelConfig = (env = process.env): PanelConfig => parse(panelSchema, env);
