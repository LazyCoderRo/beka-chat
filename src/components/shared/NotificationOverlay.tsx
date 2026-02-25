import './NotificationOverlay.css';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error';
    duration?: number;
    dismissible?: boolean;
    remainingSeconds?: number;
}

interface NotificationOverlayProps {
    notifications: Notification[];
    onDismiss: (id: string) => void;
}

export function NotificationOverlay({ notifications, onDismiss }: NotificationOverlayProps) {
    return (
        <div className="bk-notification-overlay">
            {notifications.map((notif) => (
                <NotificationItem 
                    key={notif.id} 
                    notification={notif} 
                    onDismiss={() => onDismiss(notif.id)} 
                />
            ))}
        </div>
    );
}

function NotificationItem({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
    const [isExiting, setIsExiting] = useState(false);
    const dismissible = notification.dismissible !== false;

    const handleDismiss = useCallback(() => {
        if (!dismissible) return;
        setIsExiting(true);
        setTimeout(onDismiss, 300); // Wait for animation
    }, [dismissible, onDismiss]);

    useEffect(() => {
        if (!dismissible) return;
        const duration = notification.duration || 10000;
        const timer = setTimeout(() => {
            handleDismiss();
        }, duration);

        return () => clearTimeout(timer);
    }, [notification, dismissible, handleDismiss]);

    const formatTime = (seconds: number) => {
        if (seconds <= 0) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };

    return (
        <div className={`bk-notification-item ${notification.type || 'info'} ${isExiting ? 'exiting' : ''} ${!dismissible ? 'non-dismissible' : ''}`}>
            <div className="bk-notification-item__icon">
                <AlertTriangle size={20} />
            </div>
            <div className="bk-notification-item__content">
                <div className="bk-notification-item__title">
                    {notification.title}
                    {notification.remainingSeconds !== undefined && (
                        <span className="bk-notification-item__timer">
                            {formatTime(notification.remainingSeconds)}
                        </span>
                    )}
                </div>
                <div className="bk-notification-item__message">{notification.message}</div>
            </div>
            {dismissible && (
                <button className="bk-notification-item__close" onClick={handleDismiss}>
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
