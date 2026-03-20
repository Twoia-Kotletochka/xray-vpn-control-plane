const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), byteUnits.length - 1);
  const scaled = value / 1024 ** exponent;

  return `${scaled.toFixed(scaled >= 100 || exponent === 0 ? 0 : 1)} ${byteUnits[exponent]}`;
}
