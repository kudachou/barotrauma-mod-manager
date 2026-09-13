import { IconAlert, IconCheck, IconInfo, IconClose } from './Icons';

export interface ToastItem {
  id: number;
  kind: 'ok' | 'warn' | 'err' | 'info';
  title: string;
  msg?: string;
}

export default function Toasts({
  items,
  onClose
}: {
  items: ToastItem[];
  onClose: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'ok' ? '' : t.kind}`}>
          <span style={{ marginTop: 1, flex: 'none' }}>
            {t.kind === 'ok' ? (
              <IconCheck size={16} />
            ) : t.kind === 'info' ? (
              <IconInfo size={16} />
            ) : (
              <IconAlert size={16} />
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-title">{t.title}</div>
            {t.msg && <div className="t-msg">{t.msg}</div>}
          </div>
          <button
            className="btn icon sm"
            style={{ border: 'none', background: 'none', height: 20, width: 20 }}
            onClick={() => onClose(t.id)}
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
