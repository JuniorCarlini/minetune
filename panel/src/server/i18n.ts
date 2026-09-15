import type { Context } from 'hono';
import { matchLocale, messages, type Locale, type Messages } from '../shared/i18n/index.ts';

/**
 * Língua de quem fez o pedido. A tela manda X-Minetune-Lang (a escolha no painel);
 * sem ele, vale o Accept-Language do navegador; sem nada, português.
 */
export function requestLocale(c: Context): Locale {
  return matchLocale(c.req.header('x-minetune-lang') ?? c.req.header('accept-language'));
}

/** Textos na língua de quem fez o pedido. */
export function requestMessages(c: Context): Messages {
  return messages(requestLocale(c));
}
