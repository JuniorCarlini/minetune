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

/** A janela de senha existe a partir do Minecraft 1.21.6; "LATEST" e as versões 26.x são sempre novas. */
export function gateHasPasswordWindow(version: string | undefined): boolean {
  const match = /^1\.(\d+)(?:\.(\d+))?/.exec(version ?? '');
  if (!match) return true;
  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);
  return minor > 21 || (minor === 21 && patch >= 6);
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
  /** A versão do servidor tem a janela de senha (1.21.6+); antes disso o portão só repassa. */
  passwordWindow: boolean;
  accounts: GateAccount[];
}
