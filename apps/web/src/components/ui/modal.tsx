import type { KeyboardEvent, PropsWithChildren } from 'react';

import { useI18n } from '../../i18n';

type ModalProps = PropsWithChildren<{
  bodyClassName?: string;
  dialogClassName?: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}>;

export function Modal({
  bodyClassName,
  children,
  dialogClassName,
  isOpen,
  onClose,
  title,
}: ModalProps) {
  const { ui } = useI18n();

  if (!isOpen) {
    return null;
  }

  const handleBackdropKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={handleBackdropKeyDown}
    >
      <dialog
        aria-modal="true"
        className={`modal${dialogClassName ? ` ${dialogClassName}` : ''}`}
        open
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleBackdropKeyDown}
      >
        <div className="modal__header">
          <div>
            <strong>{title}</strong>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={ui.common.closeDialog}
          >
            ×
          </button>
        </div>
        <div className={`modal__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
      </dialog>
    </div>
  );
}
