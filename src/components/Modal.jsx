import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="modal-overlay fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        dir="rtl"
        className={`modal-content card rounded-lg w-full ${widths[size]} max-h-[90vh] flex flex-col my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b divider flex-shrink-0">
          <h3 className="display text-xl font-bold ink">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-md"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'تأكيد', danger = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="ink mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`${danger ? 'btn-danger' : 'btn-primary'} px-4 py-2 rounded-md text-sm font-medium`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
