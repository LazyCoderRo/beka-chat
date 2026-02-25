import './Badge.css';
import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'vision' | 'web' | 'deep';

interface BadgeProps {
    variant?: BadgeVariant;
    children: ReactNode;
    size?: 'sm' | 'md';
    className?: string;
}

export function Badge({ variant = 'default', children, size = 'sm', className = '' }: BadgeProps) {
    return (
        <span className={`bk-badge bk-badge--${variant} bk-badge--${size} ${className}`}>
            {children}
        </span>
    );
}
