import './AppLayout.css';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Modal } from '../shared/Modal';
import { ProfileManager } from '../profile/ProfileManager';
import { useState } from 'react';

import { AdminPage } from '../../pages/AdminPage';

export function AppLayout() {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [profileModal, setProfileModal] = useState<{ isOpen: boolean; tab: string }>({
        isOpen: false,
        tab: 'profile'
    });

    const [isAdminOpen, setIsAdminOpen] = useState(false);

    const openProfile = () => {
        setProfileModal({ isOpen: true, tab: 'profile' });
    };

    const closeProfile = () => {
        setProfileModal(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <div className="bk-app-layout">
            <Sidebar
                onOpenAdmin={() => setIsAdminOpen(true)}
                onOpenProfile={() => openProfile()}
                mobileOpen={isMobileSidebarOpen}
                onRequestCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
            <button
                type="button"
                className={`bk-app-backdrop ${isMobileSidebarOpen ? 'bk-app-backdrop--visible' : ''}`}
                onClick={() => setIsMobileSidebarOpen(false)}
                aria-label="Close sidebar"
            />
            <div className="bk-app-main">
                <Header
                    onOpenProfile={openProfile}
                    onToggleSidebar={() => setIsMobileSidebarOpen(open => !open)}
                />
                <div className="bk-app-content">
                    <Outlet />
                </div>
            </div>

            <Modal
                isOpen={profileModal.isOpen}
                onClose={closeProfile}
                title="Account Settings"
                size="lg"
            >
                <ProfileManager />
            </Modal>

            <Modal
                isOpen={isAdminOpen}
                onClose={() => setIsAdminOpen(false)}
                title="AI Administration"
                size="lg"
            >
                <AdminPage />
            </Modal>
        </div>
    );
}
