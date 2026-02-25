import './Input.css';
import type { SelectHTMLAttributes, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftIcon?: ReactNode;
    wrapperClassName?: string;
    options: { value: string | number; label: string }[];
}

export function Select({
    label,
    error,
    hint,
    leftIcon,
    wrapperClassName = '',
    className = '',
    options,
    ...props
}: SelectProps) {
    const selectId = props.id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
        <div className={`bk-input-wrapper ${wrapperClassName}`}>
            {label && (
                <label htmlFor={selectId} className="bk-input-label">
                    {label}
                </label>
            )}
            <div className={`bk-input-field ${error ? 'bk-input-field--error' : ''}`}>
                {leftIcon && <span className="bk-input-icon bk-input-icon--left">{leftIcon}</span>}
                <select
                    id={selectId}
                    className={`bk-input ${leftIcon ? 'bk-input--has-left' : ''} ${className}`}
                    style={{
                        appearance: 'none',
                        paddingRight: '2rem',
                        cursor: 'pointer'
                    }}
                    {...props}
                >
                    {options.map(opt => (
                        <option
                            key={opt.value}
                            value={opt.value}
                            style={{ fontFamily: typeof opt.value === 'string' && opt.value.length > 3 ? opt.value : 'inherit' }}
                        >
                            {opt.label}
                        </option>
                    ))}
                </select>
                <span className="bk-input-icon bk-input-icon--right" style={{ pointerEvents: 'none' }}>
                    <ChevronDown size={14} />
                </span>
            </div>
            {error && <span className="bk-input-error">{error}</span>}
            {hint && !error && <span className="bk-input-hint">{hint}</span>}
        </div>
    );
}

