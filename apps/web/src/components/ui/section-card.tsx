import type { PropsWithChildren } from 'react';

type SectionCardProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
}>;

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section className="section-card">
      {title ? (
        <div className="section-card__header">
          <div>{title ? <h3>{title}</h3> : null}</div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
