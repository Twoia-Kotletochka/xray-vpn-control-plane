type PageHeaderProps = {
  title: string;
  description: string;
  actionLabel?: string;
};

export function PageHeader({ title, description, actionLabel }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <p className="page-header__eyebrow">operations</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      {actionLabel ? (
        <button className="button button--primary" type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
