/**
 * Autenticação do painel: senha única (PANEL_PASSWORD) e sessão em cookie
 * assinado com HMAC. Sem banco de dados, sem estado no servidor.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const COOKIE = 'minetune_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export class Auth {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly password: string;
  private readonly secret: string;

  constructor(password: string, secret: string) {
    this.password = password;
    this.secret = secret;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  checkPassword(candidate: string): boolean {
    // Compara hashes de tamanho fixo: tempo constante independente do tamanho da senha.
    return timingSafeEqual(sha256(candidate), sha256(this.password));
  }

  /** Retorna false quando o IP excedeu as tentativas. */
  allowAttempt(ip: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(ip);
    if (!entry || entry.resetAt < now) {
      this.attempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return true;
    }
    entry.count++;
    return entry.count <= LOGIN_MAX_ATTEMPTS;
  }

  clearAttempts(ip: string): void {
    this.attempts.delete(ip);
  }

  startSession(c: Context): void {
    const expires = Date.now() + SESSION_TTL_MS;
    const payload = String(expires);
    setCookie(c, COOKIE, `${payload}.${this.sign(payload)}`, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: isHttps(c),
      path: '/',
      expires: new Date(expires),
    });
  }

  endSession(c: Context): void {
    deleteCookie(c, COOKIE, { path: '/' });
  }

  isAuthenticated(c: Context): boolean {
    const token = getCookie(c, COOKIE);
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;

    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    return Number(payload) > Date.now();
  }

  /**
   * Protege /api/*. Métodos que alteram estado exigem o cabeçalho X-Minetune:
   * formulários de outros sites não conseguem enviá-lo (defesa extra contra CSRF).
   */
  middleware(publicPaths: string[]): MiddlewareHandler {
    return async (c, next) => {
      if (publicPaths.includes(c.req.path)) return next();
      if (!this.isAuthenticated(c)) return c.json({ error: 'Não autenticado' }, 401);
      if (c.req.method !== 'GET' && c.req.header('x-minetune') !== '1') {
        return c.json({ error: 'Cabeçalho X-Minetune ausente' }, 403);
      }
      return next();
    };
  }
}

function isHttps(c: Context): boolean {
  return c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';
}

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return forwarded || incoming?.socket?.remoteAddress || 'unknown';
}
