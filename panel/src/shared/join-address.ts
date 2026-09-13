/** Endereço que os jogadores digitam no Minecraft, e até onde ele alcança. */

export interface JoinInfo {
  /** PUBLIC_ADDRESS do .env: domínio ou endereço do túnel (ex.: playit.gg). */
  publicAddress?: string;
  /** Porta publicada do servidor (MC_PORT). */
  port: number;
}

/** public: qualquer um na internet · lan: só quem está na mesma rede · this-computer: só esta máquina. */
export type JoinScope = 'public' | 'lan' | 'this-computer';

const DEFAULT_PORT = 25565;

function scopeOf(host: string): JoinScope {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || h.startsWith('127.')) return 'this-computer';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h) || h.endsWith('.local') || /^f[cd]/.test(h) || !h.includes('.')) {
    return 'lan';
  }
  return 'public';
}

/**
 * Sem PUBLIC_ADDRESS, o melhor palpite é o host por onde o painel foi aberto, mas ele
 * pode ser 127.0.0.1: mostrar isso como "mande para seus amigos" engana quem não é técnico.
 */
export function joinAddress(join: JoinInfo, browserHost: string): { address: string; scope: JoinScope } {
  const configured = join.publicAddress?.trim();
  if (configured) return { address: configured, scope: 'public' };
  const port = join.port === DEFAULT_PORT ? '' : `:${join.port}`;
  return { address: `${browserHost}${port}`, scope: scopeOf(browserHost) };
}
