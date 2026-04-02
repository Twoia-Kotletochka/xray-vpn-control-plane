import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { useI18n } from '../../i18n';

type ToastTone = 'success' | 'danger' | 'info';

type ToastProps = {
  isOpen: boolean;
  message: string;
  tone?: ToastTone;
  onClose: () => void;
};

const iconMap = {
  success: CheckCircle2,
  danger: TriangleAlert,
  info: Info,
} as const;

export function Toast({ isOpen, message, tone = 'success', onClose }: ToastProps) {
  const { ui } = useI18n();

  if (!isOpen) {
    return null;
  }

  const Icon = iconMap[tone];

  return (
    <div className={`toast toast--${tone}`} role="status" aria-live="polite">
      <div className="toast__content">
        <Icon size={18} />
        <span>{message}</span>
      </div>
      <button
        className="icon-button toast__close"
        type="button"
        onClick={onClose}
        aria-label={ui.common.closeDialog}
      >
        <X size={16} />
      </button>
    </div>
  );
}
