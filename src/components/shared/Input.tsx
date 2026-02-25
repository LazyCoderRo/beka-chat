import './Input.css';
import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftIcon?: ReactNode;
    rightElement?: ReactNode;
    wrapperClassName?: string;
}

export function Input({
    label,
    error,
    hint,
    leftIcon,
    rightElement,
    wrapperClassName = '',
    className = '',
    ...props
}: InputProps) {
    const inputId = props.id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
        <div className={`bk-input-wrapper ${wrapperClassName}`}>
            {label && (
                <label htmlFor={inputId} className="bk-input-label">
                    {label}
                </label>
            )}
            <div className={`bk-input-field ${error ? 'bk-input-field--error' : ''}`}>
                {leftIcon && <span className="bk-input-icon bk-input-icon--left">{leftIcon}</span>}
                <input
                    id={inputId}
                    className={`bk-input ${leftIcon ? 'bk-input--has-left' : ''} ${rightElement ? 'bk-input--has-right' : ''} ${className}`}
                    {...props}
                />
                {rightElement && <span className="bk-input-icon bk-input-icon--right">{rightElement}</span>}
            </div>
            {error && <span className="bk-input-error">{error}</span>}
            {hint && !error && <span className="bk-input-hint">{hint}</span>}
        </div>
    );
}
