import { CheckCircle, AlertCircle, Info } from 'lucide-react';

export default function Toast({ toast }) {
  if (!toast) return null;
  const config = {
    success: { bg: '#1F4D3F', icon: CheckCircle },
    error: { bg: '#8B2635', icon: AlertCircle },
    info: { bg: '#1E40AF', icon: Info },
  };
  const { bg, icon: Icon } = config[toast.kind] || config.success;
  return (
    <div
      dir="rtl"
      className="toast fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-md shadow-lg flex items-center gap-2 z-50 max-w-md"
      style={{ background: bg, color: '#F7F3E9' }}
    >
      <Icon size={18} />
      <span className="text-sm">{toast.message}</span>
    </div>
  );
}
