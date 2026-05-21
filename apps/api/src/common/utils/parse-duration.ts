const durationPattern = /^(?<value>\d+)(?<unit>ms|s|m|h|d)$/;

const durationMultiplier = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function parseDurationToMs(input: string): number {
  const normalizedInput = input.trim();

  if (/^\d+$/.test(normalizedInput)) {
    return Number(normalizedInput);
  }

  const match = durationPattern.exec(normalizedInput);

  if (!match?.groups) {
    throw new Error(`Unsupported duration format: ${input}`);
  }

  const value = Number(match.groups.value);
  const unit = match.groups.unit as keyof typeof durationMultiplier;

  return value * durationMultiplier[unit];
}
