// Material Design 3 の部品（必要なものだけ）
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  dense,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label?: string;
  dense?: boolean;
}) {
  return (
    <div className={`segmented${dense ? ' dense' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.value === value && (
            <svg className="check" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  variant = 'standard',
  disabled,
  selected,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${variant}${selected ? ' selected' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'filled',
  icon,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'filled' | 'tonal' | 'outlined' | 'text';
  icon?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`btn ${variant}${icon ? ' with-icon' : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
        <span className="thumb" />
      </button>
    </label>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // 画面の側から閉じたとき（open が false になったとき）は onClose を呼ばない。
  // 呼ぶと、別のダイアログに切り替えた直後に状態を消してしまう
  const closingByProp = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      closingByProp.current = true;
      d.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onClose={() => {
        if (closingByProp.current) {
          closingByProp.current = false;
          return;
        }
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-inner">
          <div className="dialog-head">
            <h2>{title}</h2>
            <IconButton icon="close" label="閉じる" onClick={onClose} />
          </div>
          <div className="dialog-body">{children}</div>
          {actions && <div className="dialog-actions">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Snackbar({ message }: { message: string | null }) {
  return (
    <div className={`snackbar${message ? ' show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
