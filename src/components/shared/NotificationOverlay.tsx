import './NotificationOverlay.css';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error';
    duration?: number;
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

    useEffect(() => {
        const duration = notification.duration || 10000;
        const timer = setTimeout(() => {
            handleDismiss();
        }, duration);

        return () => clearTimeout(timer);
    }, [notification]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(onDismiss, 300); // Wait for animation
    };

    return (
        <div className={`bk-notification-item ${notification.type || 'info'} ${isExiting ? 'exiting' : ''}`}>
            <div className="bk-notification-item__icon">
                <AlertTriangle size={20} />
            </div>
            <div className="bk-notification-item__content">
                <div className="bk-notification-item__title">{notification.title}</div>
                <div className="bk-notification-item__message">{notification.message}</div>
            </div>
            <button className="bk-notification-item__close" onClick={handleDismiss}>
                <X size={16} />
            </button>
        </div>
    );
}
