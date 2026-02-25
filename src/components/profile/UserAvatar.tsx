import './UserAvatar.css';
import type { User } from '../../types';

interface UserAvatarProps {
    user: User;
    size?: 'sm' | 'md' | 'lg';
    showStatus?: boolean;
}

function getInitials(name: string) {
    return name
        .split(' ')
        .map(p => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

const AVATAR_COLORS = [
    '#6c63ff', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6',
];

function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function UserAvatar({ user, size = 'md', showStatus }: UserAvatarProps) {
    const color = getAvatarColor(user.name);
    return (
        <div className={`bk-avatar bk-avatar--${size}`} style={{ background: color }}>
            {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="bk-avatar__img" />
                : <span className="bk-avatar__initials">{getInitials(user.name)}</span>
            }
            {showStatus && <span className="bk-avatar__status" />}
        </div>
    );
}
