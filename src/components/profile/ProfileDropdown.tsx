import './ProfileDropdown.css';
import { useEffect, useRef } from 'react';
import { User, LogOut, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from './UserAvatar';

interface ProfileDropdownProps {
    onClose: () => void;
    onOpenProfile: () => void;
}

export function ProfileDropdown({ onClose, onOpenProfile }: ProfileDropdownProps) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    if (!user) return null;

    const handleOpenProfile = () => {
        onOpenProfile();
        onClose();
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
        onClose();
    };

    return (
        <div className="bk-profile-dd" ref={ref}>
            <div className="bk-profile-dd__user">
                <UserAvatar user={user} size="md" showStatus />
                <div className="bk-profile-dd__info">
                    <span className="bk-profile-dd__name">{user.name}</span>
                    <span className="bk-profile-dd__email">{user.email}</span>
                </div>
            </div>

            <div className="bk-profile-dd__divider" />

            <button className="bk-profile-dd__item" onClick={handleOpenProfile}>
                <User size={16} />
                <span>Profile Settings</span>
                <ChevronRight size={14} className="bk-profile-dd__arrow" />
            </button>

            <div className="bk-profile-dd__divider" />

            <button className="bk-profile-dd__item bk-profile-dd__item--danger" onClick={handleLogout}>
                <LogOut size={16} />
                <span>Sign out</span>
            </button>
        </div>
    );
}

