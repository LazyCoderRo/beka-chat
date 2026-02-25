import './Sidebar.css';
import { useState } from 'react';
import { Plus, PanelLeftClose, PanelLeft, Bot, Settings as SettingsIcon } from 'lucide-react';
import { SessionSearch } from '../session/SessionSearch';
import { SessionFilters } from '../session/SessionFilters';
import { SessionList } from '../session/SessionList';
import { UserAvatar } from '../profile/UserAvatar';
import { Button } from '../shared/Button';
import { useSession } from '../../context/SessionContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { TypographySelector } from './TypographySelector';

interface SidebarProps {
    onOpenAdmin?: () => void;
    onOpenProfile?: () => void;
}

export function Sidebar({ onOpenAdmin, onOpenProfile }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    const { createNewSession } = useSession();
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleNewChat = () => { createNewSession(); navigate('/chat'); };

    return (
        <aside className={`bk-sidebar ${collapsed ? 'bk-sidebar--collapsed' : ''}`}>
            <div className="bk-sidebar__header">
                {!collapsed && (
                    <div className="bk-sidebar__brand">
                        <div className="bk-sidebar__logo">
                            <Bot size={18} />
                        </div>
                        <span className="bk-sidebar__brand-name">BekaChat</span>
                    </div>
                )}
                <button
                    className="bk-sidebar__collapse-btn"
                    onClick={() => setCollapsed(c => !c)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                </button>
            </div>

            {!collapsed && (
                <>
                    <div className="bk-sidebar__controls">
                        <Button variant="primary" size="sm" fullWidth leftIcon={<Plus size={15} />} onClick={handleNewChat}>
                            New chat
                        </Button>
                        <SessionSearch />
                        <SessionFilters />
                    </div>

                    <SessionList />

                    <TypographySelector />

                    {user?.role === 'admin' && (
                        <div className="bk-sidebar__nav-item" onClick={onOpenAdmin} style={{ cursor: 'pointer', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--bk-text-secondary)', transition: 'all 0.2s' }}>
                            <SettingsIcon size={18} />
                            {!collapsed && <span style={{ fontSize: '0.875rem' }}>Admin Settings</span>}
                        </div>
                    )}

                    {user && (
                        <div className="bk-sidebar__footer" onClick={onOpenProfile} style={{ cursor: 'pointer' }}>
                            <UserAvatar user={user} size="sm" showStatus />
                            <div className="bk-sidebar__footer-info">
                                <span className="bk-sidebar__footer-name">{user.name}</span>
                                <span className="bk-sidebar__footer-plan">Free plan</span>
                            </div>
                        </div>
                    )}
                </>
            )}

            {collapsed && (
                <div className="bk-sidebar__collapsed-actions">
                    <button className="bk-sidebar__icon-btn" onClick={handleNewChat} title="New chat">
                        <Plus size={18} />
                    </button>
                </div>
            )}
        </aside>
    );
}
