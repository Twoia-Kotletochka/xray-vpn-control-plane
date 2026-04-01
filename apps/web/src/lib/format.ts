import type { Locale } from '../i18n';

const byteUnits = {
  ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'],
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
} as const;

type ClientBackendStatus = 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'BLOCKED';
type ClientLiveStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
type ClientAccessStatus = 'ACTIVE' | 'DISABLED';

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

export function formatDate(
  value: string | null | undefined,
  fallback = 'Не задано',
  locale: Locale = 'ru',
): string {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(toLocaleTag(locale), {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function formatClientLiveStatus(status: ClientLiveStatus, locale: Locale = 'ru'): string {
  switch (status) {
    case 'ACTIVE':
      return locale === 'en' ? 'Active' : 'Активен';
    case 'INACTIVE':
      return locale === 'en' ? 'Inactive' : 'Не активен';
    case 'BLOCKED':
      return locale === 'en' ? 'Blocked' : 'Заблокирован';
  }
}

export function liveStatusTone(status: ClientLiveStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'INACTIVE':
      return 'muted' as const;
    case 'BLOCKED':
      return 'danger' as const;
  }
}

export function formatClientAccessStatus(
  status: ClientAccessStatus,
  locale: Locale = 'ru',
): string {
  switch (status) {
    case 'ACTIVE':
      return locale === 'en' ? 'Allowed' : 'Разрешен';
    case 'DISABLED':
      return locale === 'en' ? 'Blocked' : 'Заблокирован';
  }
}

export function resolveClientLiveStatus(client: {
  activeConnections: number;
  status: ClientBackendStatus;
}): ClientLiveStatus {
  if (client.status === 'DISABLED') {
    return 'BLOCKED';
  }

  return client.activeConnections > 0 ? 'ACTIVE' : 'INACTIVE';
}
