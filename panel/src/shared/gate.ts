/** Portão Minetune: o que o painel e o portão dividem (onde ficam as senhas e o liga/desliga). */

/** Pasta dentro de /data com as senhas e o segredo do encaminhamento; entra nos backups. */
export const GATE_ACCOUNTS_DIR = 'minetune-gate';
/** Arquivo na pasta de config gravado pelo painel e lido pelo portão a cada entrada. */
export const GATE_CONFIG_FILE = 'gate.json';

export interface GateConfig {
  requirePassword: boolean;
}

/** Arquivo ausente ou estragado vale como senha ligada: na dúvida, o portão continua fechado. */
export function parseGateConfig(text: string): GateConfig {
  try {
    const data = JSON.parse(text) as Partial<GateConfig> | null;
    return { requirePassword: data?.requirePassword !== false };
  } catch {
    return { requirePassword: true };
  }
}

export interface GateAccount {
  name: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface GateResponse {
  /** Existe um contêiner do portão nesta instalação. */
  installed: boolean;
  running: boolean;
  requirePassword: boolean;
  /** Servidor em modo online (contas originais): o portão só repassa, sem pedir senha. */
  onlineMode: boolean;
  accounts: GateAccount[];
}
