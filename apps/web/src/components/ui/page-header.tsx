import { useI18n } from '../../i18n';

type PageHeaderProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
};

export function PageHeader({
  title,
  description,
  actionLabel,
  actionDisabled,
  onAction,
}: PageHeaderProps) {
  const { ui } = useI18n();

  return (
    <div className="page-header">
      <div>
        <p className="page-header__eyebrow">{ui.common.operations}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      {actionLabel ? (
        <button
          className="button button--primary"
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
