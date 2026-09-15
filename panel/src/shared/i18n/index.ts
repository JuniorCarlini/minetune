/**
 * Textos do painel em português, inglês e espanhol. A tela e o servidor usam o mesmo pacote:
 * `messages(locale).players.title`. Uma área por arquivo, para cada parte do painel ter os
 * seus textos perto e ninguém precisar mexer num arquivo gigante.
 */

import { LOCALES, type Locale } from './define.ts';
import { app } from './app.ts';
import { archive } from './archive.ts';
import { backups } from './backups.ts';
import { common } from './common.ts';
import { gamerules } from './gamerules.ts';
import { home } from './home.ts';
import { players } from './players.ts';
import { plugins } from './plugins.ts';
import { server } from './server.ts';
import { settings } from './settings.ts';
import { worlds } from './worlds.ts';

export { LOCALES, matchLocale, type Locale } from './define.ts';

const NAMESPACES = { common, app, home, players, worlds, settings, gamerules, plugins, backups, server, archive };

type Namespaces = typeof NAMESPACES;
export type Messages = { [K in keyof Namespaces]: Namespaces[K]['pt-BR'] };

const BUNDLES = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(Object.entries(NAMESPACES).map(([name, texts]) => [name, texts[locale]]))]),
) as Record<Locale, Messages>;

export function messages(locale: Locale): Messages {
  return BUNDLES[locale];
}

/** Português: o padrão de funções compartilhadas chamadas sem língua (testes, CLI). */
export const PT = BUNDLES['pt-BR'];

/** Nome de cada língua escrito nela mesma, para o seletor. */
export const LOCALE_NAMES: Record<Locale, string> = { 'pt-BR': 'Português', en: 'English', es: 'Español' };

/** Tag para Intl (datas, números). */
export const INTL_LOCALE: Record<Locale, string> = { 'pt-BR': 'pt-BR', en: 'en-US', es: 'es-ES' };
