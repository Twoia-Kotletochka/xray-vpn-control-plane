import type { KeyboardEvent, PropsWithChildren } from 'react';

type ModalProps = PropsWithChildren<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
}>;

export function Modal({ children, isOpen, onClose, title }: ModalProps) {
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
        className="modal"
        open
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleBackdropKeyDown}
      >
        <div className="modal__header">
          <div>
            <strong>{title}</strong>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </dialog>
    </div>
  );
}
