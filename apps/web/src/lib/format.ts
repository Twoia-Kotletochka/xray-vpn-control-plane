import type { Locale } from '../i18n';

const byteUnits = {
  ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'],
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
} as const;

function toLocaleTag(locale: Locale) {
  return locale === 'en' ? 'en-US' : 'ru-RU';
}

export function formatBytes(value: number, locale: Locale = 'ru'): string {
  if (!Number.isFinite(value) || value <= 0) {
    return `0 ${byteUnits[locale][0]}`;
  }

  const units = byteUnits[locale];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** exponent;
  const formatter = new Intl.NumberFormat(toLocaleTag(locale), {
    minimumFractionDigits: scaled >= 100 || exponent === 0 ? 0 : 1,
    maximumFractionDigits: scaled >= 100 || exponent === 0 ? 0 : 1,
  });

  return `${formatter.format(scaled)} ${units[exponent]}`;
}

export function formatDateTime(
  value: string | null | undefined,
  fallback = 'Не задано',
  locale: Locale = 'ru',
): string {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(toLocaleTag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatClientStatus(
  status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'BLOCKED',
  locale: Locale = 'ru',
): string {
  switch (status) {
    case 'ACTIVE':
      return locale === 'en' ? 'Active' : 'Активен';
    case 'DISABLED':
      return locale === 'en' ? 'Disabled' : 'Отключен';
    case 'EXPIRED':
      return locale === 'en' ? 'Expired' : 'Истек';
    case 'BLOCKED':
      return locale === 'en' ? 'Blocked' : 'Заблокирован';
  }
}

export function statusTone(status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'BLOCKED') {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'EXPIRED':
      return 'warning' as const;
    case 'BLOCKED':
      return 'danger' as const;
    case 'DISABLED':
      return 'muted' as const;
  }
}
