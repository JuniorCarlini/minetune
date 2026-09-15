/**
 * Formato dos textos traduzidos. Cada área tem um arquivo com o português (a referência)
 * e as traduções ao lado. O tipo vem só do português: se faltar uma chave em inglês ou
 * espanhol, ou se sobrar uma, o TypeScript não compila.
 *
 * Texto com número ou nome é uma função, para o plural e a ordem das palavras saírem
 * certos em cada língua: `players: (n: number) => (n === 1 ? '1 jogador' : `${n} jogadores`)`.
 */

export const LOCALES = ['pt-BR', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export function defineMessages<T>(ptBR: T, translations: { en: NoInfer<T>; es: NoInfer<T> }): Record<Locale, T> {
  return { 'pt-BR': ptBR, en: translations.en, es: translations.es };
}

/** "en-US" → en, "es-419" → es, "pt" ou "pt-PT" → pt-BR. Sem nada reconhecível, português. */
export function matchLocale(input: string | null | undefined): Locale {
  for (const part of (input ?? '').split(',')) {
    const tag = part.split(';')[0]!.trim().toLowerCase();
    if (tag.startsWith('pt')) return 'pt-BR';
    if (tag.startsWith('en')) return 'en';
    if (tag.startsWith('es')) return 'es';
  }
  return 'pt-BR';
}
