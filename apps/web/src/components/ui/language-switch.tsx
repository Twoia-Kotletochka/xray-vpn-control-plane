import { useI18n, type Locale } from '../../i18n';

const locales: Locale[] = ['ru', 'en'];

export function LanguageSwitch() {
  const { locale, setLocale, ui } = useI18n();

  return (
    <div className="locale-switch" role="group" aria-label={ui.common.languageLabel}>
      {locales.map((item) => (
        <button
          key={item}
          className={`locale-switch__button ${locale === item ? 'locale-switch__button--active' : ''}`}
          type="button"
          aria-pressed={locale === item}
          onClick={() => setLocale(item)}
        >
          {item === 'ru' ? ui.common.languageRussian : ui.common.languageEnglish}
        </button>
      ))}
    </div>
  );
}
