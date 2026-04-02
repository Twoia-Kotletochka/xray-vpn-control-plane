import type { ReactNode } from 'react';

import { useI18n } from '../../i18n';

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
  description,
  eyebrow,
  actionLabel,
  actionDisabled,
  onAction,
  actions,
}: PageHeaderProps) {
  const { ui } = useI18n();

  return (
    <div className="page-header">
      <div>
        <p className="page-header__eyebrow">{eyebrow ?? ui.common.operations}</p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
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
