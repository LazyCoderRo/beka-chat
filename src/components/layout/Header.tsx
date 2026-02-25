import './Header.css';
import { ThemeToggle } from './ThemeToggle';
import { UserAvatar } from '../profile/UserAvatar';
import { ProfileDropdown } from '../profile/ProfileDropdown';
import { useAuth } from '../../context/AuthContext';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
    onOpenProfile: () => void;
}

export function Header({ onOpenProfile }: HeaderProps) {
    const { user } = useAuth();
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Close profile dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="bk-header">
            <div className="bk-header__left">
                {/* ModelSelector moved to ChatInput */}
            </div>

            <div className="bk-header__right">
                <ThemeToggle />

                <div className="bk-header__user" ref={profileRef}>
                    <button
                        className={`bk-header__profile-btn ${profileOpen ? 'active' : ''}`}
                        onClick={() => setProfileOpen(!profileOpen)}
                    >
                        {user && <UserAvatar user={user} size="sm" />}
                    </button>
                    {profileOpen && (
                        <ProfileDropdown
                            onClose={() => setProfileOpen(false)}
                            onOpenProfile={onOpenProfile}
                        />
                    )}
                </div>
            </div>
        </header>
    );
}

