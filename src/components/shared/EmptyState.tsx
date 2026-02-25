import './EmptyState.css';
import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
    className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
    return (
        <div className={`bk-empty ${className}`}>
            {icon && <div className="bk-empty__icon">{icon}</div>}
            <h3 className="bk-empty__title">{title}</h3>
            {description && <p className="bk-empty__desc">{description}</p>}
            {action && (
                <Button variant="accent-outline" size="sm" onClick={action.onClick} className="bk-empty__action">
                    {action.label}
                </Button>
            )}
        </div>
    );
}
