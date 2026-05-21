import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  actionLabel,
  actionDisabled,
  onAction,
  actions,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
      </div>

      {actions ?? (
        actionLabel ? (
          <div className="page-header__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
            >
              {actionLabel}
            </button>
          </div>
        ) : null
      )}
    </div>
  );
}
