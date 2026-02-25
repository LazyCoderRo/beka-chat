import './Button.css';
import type { ReactNode, ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent-outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    fullWidth?: boolean;
}

export function Button({
    variant = 'primary',
    size = 'md',
    isLoading,
    leftIcon,
    rightIcon,
    fullWidth,
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    const cls = [
        'bk-btn',
        `bk-btn--${variant}`,
        `bk-btn--${size}`,
        fullWidth && 'bk-btn--full',
        (isLoading || disabled) && 'bk-btn--disabled',
        className,
    ].filter(Boolean).join(' ');

    return (
        <button className={cls} disabled={disabled || isLoading} {...props}>
            {isLoading ? (
                <span className="bk-btn__spinner" aria-hidden />
            ) : leftIcon ? (
                <span className="bk-btn__icon">{leftIcon}</span>
            ) : null}
            {children && <span className="bk-btn__label">{children}</span>}
            {rightIcon && !isLoading && <span className="bk-btn__icon">{rightIcon}</span>}
        </button>
    );
}
