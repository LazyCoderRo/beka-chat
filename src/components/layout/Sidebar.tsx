import './Sidebar.css';
import { useEffect, useRef, useState } from 'react';
import { Plus, PanelLeftClose, PanelLeft, Bot, Settings as SettingsIcon, ListChecks, CheckSquare, Square, Trash2 } from 'lucide-react';
import { SessionSearch } from '../session/SessionSearch';
import { SessionFilters } from '../session/SessionFilters';
import { SessionList } from '../session/SessionList';
import { UserAvatar } from '../profile/UserAvatar';
import { Button } from '../shared/Button';
import { useSession } from '../../context/SessionContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { TypographySelector } from './TypographySelector';

interface SidebarProps {
    onOpenAdmin?: () => void;
    onOpenProfile?: () => void;
    mobileOpen?: boolean;
    onRequestCloseMobile?: () => void;
}

export function Sidebar({ onOpenAdmin, onOpenProfile, mobileOpen = false, onRequestCloseMobile }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    const {
        createNewSession,
        bulkSelectionEnabled,
        selectedCount,
        areAllFilteredSelected,
        toggleBulkSelection,
        selectAllFilteredSessions,
        clearSessionSelection,
        deleteSelectedSessions
    } = useSession();
    const { user } = useAuth();
    const location = useLocation();
    const previousPathnameRef = useRef(location.pathname);
    const navigate = useNavigate();

    const closeMobileSidebar = () => {
        onRequestCloseMobile?.();
    };

    const handleNewChat = () => {
        createNewSession();
        navigate('/chat');
        closeMobileSidebar();
    };

    useEffect(() => {
        if (previousPathnameRef.current === location.pathname) return;
        previousPathnameRef.current = location.pathname;
        if (mobileOpen) onRequestCloseMobile?.();
        // Close mobile drawer after navigation to avoid split screen on phones.
    }, [location.pathname, mobileOpen, onRequestCloseMobile]);

    return (
        <aside className={`bk-sidebar ${collapsed ? 'bk-sidebar--collapsed' : ''} ${mobileOpen ? 'bk-sidebar--mobile-open' : ''}`}>
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

                    <div className="bk-sidebar__bulk-actions">
                        <button
                            type="button"
                            className={`bk-sidebar__bulk-btn ${bulkSelectionEnabled ? 'active' : ''}`}
                            onClick={toggleBulkSelection}
                            title={bulkSelectionEnabled ? 'Exit bulk selection' : 'Activate bulk selection'}
                        >
                            <ListChecks size={14} />
                            <span>{bulkSelectionEnabled ? 'Exit bulk' : 'Bulk select'}</span>
                        </button>

                        <button
                            type="button"
                            className="bk-sidebar__bulk-btn"
                            onClick={areAllFilteredSelected ? clearSessionSelection : selectAllFilteredSessions}
                            disabled={!bulkSelectionEnabled}
                            title={areAllFilteredSelected ? 'Deselect all visible chats' : 'Select all visible chats'}
                        >
                            {areAllFilteredSelected ? <Square size={14} /> : <CheckSquare size={14} />}
                            <span>{areAllFilteredSelected ? 'Deselect all' : 'Select all'}</span>
                        </button>

                        <button
                            type="button"
                            className="bk-sidebar__bulk-btn bk-sidebar__bulk-btn--danger"
                            onClick={deleteSelectedSessions}
                            disabled={!bulkSelectionEnabled || selectedCount === 0}
                            title="Delete selected chats"
                        >
                            <Trash2 size={14} />
                            <span>{selectedCount > 0 ? `Delete (${selectedCount})` : 'Delete selected'}</span>
                        </button>
                    </div>

                    <TypographySelector />

                    {user?.role === 'admin' && (
                        <div className="bk-sidebar__nav-item" onClick={() => { onOpenAdmin?.(); closeMobileSidebar(); }} style={{ cursor: 'pointer', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--bk-text-secondary)', transition: 'all 0.2s' }}>
                            <SettingsIcon size={18} />
                            {!collapsed && <span style={{ fontSize: '0.875rem' }}>Admin Settings</span>}
                        </div>
                    )}

                    {user && (
                        <div className="bk-sidebar__footer" onClick={() => { onOpenProfile?.(); closeMobileSidebar(); }} style={{ cursor: 'pointer' }}>
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
