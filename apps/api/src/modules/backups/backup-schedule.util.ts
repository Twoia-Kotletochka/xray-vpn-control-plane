const DAY_MS = 86_400_000;

export function isAutomaticBackupDue(input: {
  intervalDays: number;
  latestSuccessfulBackupCreatedAt: Date | null;
  now: Date;
}) {
  if (!input.latestSuccessfulBackupCreatedAt) {
    return true;
  }

  return (
    input.now.getTime() - input.latestSuccessfulBackupCreatedAt.getTime() >=
    input.intervalDays * DAY_MS
  );
}
