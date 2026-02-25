import './ContextNotification.css';
import { AlertCircle, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ContextNotificationProps {
    message: string;
    duration?: number; // Auto-dismiss after this many ms
    onDismiss?: () => void;
}

export function ContextNotification({ message, duration = 6000, onDismiss }: ContextNotificationProps) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (!duration) return;
        
        const timer = setTimeout(() => {
            setIsVisible(false);
            onDismiss?.();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onDismiss]);

    if (!isVisible) return null;

    return (
        <div className="bk-context-notification">
            <div className="bk-context-notification__content">
                <AlertCircle size={18} className="bk-context-notification__icon" />
                <div className="bk-context-notification__text">
                    <p className="bk-context-notification__title">Context Summarized</p>
                    <p className="bk-context-notification__message">{message}</p>
                </div>
            </div>
            <button 
                className="bk-context-notification__close"
                onClick={() => {
                    setIsVisible(false);
                    onDismiss?.();
                }}
                aria-label="Dismiss"
            >
                <X size={16} />
            </button>
        </div>
    );
}
