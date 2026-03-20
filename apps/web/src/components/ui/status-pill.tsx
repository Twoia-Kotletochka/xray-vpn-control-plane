type StatusPillProps = {
  tone: 'success' | 'warning' | 'muted';
  children: string;
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}
