import { LOCALE_NAMES, LOCALES } from '../../shared/i18n/index.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Button } from './ui.tsx';

/** Botões com o nome de cada língua escrito nela mesma: quem não lê a atual ainda acha a sua. */
export function LanguagePicker() {
  const { locale, setLocale, m } = useI18n();
  return (
    <div className="row" role="radiogroup" aria-label={m.common.language}>
      {LOCALES.map((option) => (
        <Button
          key={option}
          size="sm"
          role="radio"
          aria-checked={option === locale}
          lang={option}
          variant={option === locale ? 'primary' : 'secondary'}
          onClick={() => setLocale(option)}
        >
          {LOCALE_NAMES[option]}
        </Button>
      ))}
    </div>
  );
}
