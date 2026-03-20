const byteUnits = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] as const;

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 Б';
  }

  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), byteUnits.length - 1);
  const scaled = value / 1024 ** exponent;
  const formatter = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: scaled >= 100 || exponent === 0 ? 0 : 1,
    maximumFractionDigits: scaled >= 100 || exponent === 0 ? 0 : 1,
  });

  return `${formatter.format(scaled)} ${byteUnits[exponent]}`;
}

export function formatDateTime(value: string | null | undefined, fallback = 'Не задано'): string {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatClientStatus(status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'BLOCKED'): string {
  switch (status) {
    case 'ACTIVE':
      return 'Активен';
    case 'DISABLED':
      return 'Отключен';
    case 'EXPIRED':
      return 'Истек';
    case 'BLOCKED':
      return 'Заблокирован';
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
