import './AdminPage.css';
import { useState, useEffect } from 'react';
import { useAIConfig } from '../context/AIConfigContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/shared/Button';
import { LoadModelModal } from '../components/shared/LoadModelModal';
import { Cpu, Image, Database, Save, CheckCircle2, Zap, Layers, Eye, Download, Trash2, Clock, Sparkles, Settings, AlertCircle, Users, Shield, User as UserIcon, MessageSquare, RefreshCw } from 'lucide-react';
import { CustomDropdown } from '../components/shared/CustomDropdown';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import type { AIModel, ChatSession, Message } from '../types';

type AdminSection = 'models' | 'defaults' | 'general' | 'users' | 'sessions';

interface AdminUser {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user';
    avatarUrl?: string;
    createdAt: string;
    sessionCount?: number;
}

interface AdminSessionSummary {
    id: string;
    title: string;
    preview?: string;
    updatedAt: string;
    messageCount: number;
}

export function AdminPage() {
    const { config, updateConfig, availableModels, fetchModels, loadModel, unloadModel } = useAIConfig();
    const { user } = useAuth();
    const [visionModel, setVisionModel] = useState(config.defaultVisionModelId);
    const [chatModel, setChatModel] = useState(config.defaultChatModelId);
    const [embeddingModel, setEmbeddingModel] = useState(config.defaultEmbeddingModelId);
    const [toolCallingModel, setToolCallingModel] = useState(config.defaultToolCallingModelId);
    const [reasoningLevel, setReasoningLevel] = useState(config.reasoningLevel || 'medium');
    const [idleTimeMinutes, setIdleTimeMinutes] = useState(config.defaultIdleTimeMinutes || 60);
    const [isSaved, setIsSaved] = useState(false);
    const [loadModelModalOpen, setLoadModelModalOpen] = useState(false);
    const [selectedModelToLoad, setSelectedModelToLoad] = useState<AIModel | null>(null);
    const [isLoadingAModel, setIsLoadingAModel] = useState(false);
    const [activeSection, setActiveSection] = useState<AdminSection>('models');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userActionId, setUserActionId] = useState<number | null>(null);
    const [selectedUserForSessions, setSelectedUserForSessions] = useState<string>('');
    const [userSessions, setUserSessions] = useState<AdminSessionSummary[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string>('');
    const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
    const [isLoadingUserSessions, setIsLoadingUserSessions] = useState(false);
    const [isLoadingSessionDetail, setIsLoadingSessionDetail] = useState(false);

    // Auto-refresh models when admin modal opens
    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    const fetchUsers = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setIsLoadingUsers(true);
        try {
            const response = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json() as { users?: AdminUser[]; error?: string };
            if (!response.ok) throw new Error(data.error || 'Failed to fetch users');
            setUsers(data.users || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    useEffect(() => {
        if (user?.role === 'admin') {
            void fetchUsers();
        }
    }, [user?.role]);

    useEffect(() => {
        if (activeSection === 'sessions' && users.length === 0 && user?.role === 'admin') {
            void fetchUsers();
        }
    }, [activeSection, users.length, user?.role]);

    if (user?.role !== 'admin') {
        return (
            <div className="bk-admin-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <div className="bk-admin-card" style={{ padding: '40px', textAlign: 'center' }}>
                    <h2>Access Denied</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>You must be an administrator to view this page.</p>
                </div>
            </div>
        );
    }

    const handleSave = () => {
        updateConfig({
            defaultVisionModelId: visionModel,
            defaultChatModelId: chatModel,
            defaultEmbeddingModelId: embeddingModel,
            defaultToolCallingModelId: toolCallingModel,
            reasoningLevel: reasoningLevel as 'off' | 'low' | 'medium' | 'high',
            defaultIdleTimeMinutes: idleTimeMinutes
        });
        setIsSaved(true);
        setTimeout(() => {
            setIsSaved(false);
        }, 1500);
    };

    const handleLoadModelClick = (model: AIModel) => {
        setSelectedModelToLoad(model);
        setLoadModelModalOpen(true);
    };

    const handleLoadModel = async (contextWindow: number, idleTimeMinutes: number, unloadOthers: boolean) => {
        if (!selectedModelToLoad) return;
        try {
            setIsLoadingAModel(true);
            await loadModel(selectedModelToLoad.id, {
                contextWindow,
                idleTimeMinutes,
                unloadOtherModels: unloadOthers
            });
        } catch (error) {
            console.error('Error loading model:', error);
        } finally {
            setIsLoadingAModel(false);
        }
    };

    const handleUnloadModel = async (modelId: string) => {
        try {
            await unloadModel(modelId);
        } catch (error) {
            console.error('Error unloading model:', error);
        }
    };

    const handleRoleChange = async (targetUser: AdminUser, role: 'admin' | 'user') => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setUserActionId(targetUser.id);
        try {
            const response = await fetch(`/api/admin/users/${targetUser.id}/role`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role })
            });
            const data = await response.json() as { user?: AdminUser; error?: string };
            if (!response.ok) throw new Error(data.error || 'Failed to update role');
            setUsers(prev => prev.map(u => (u.id === targetUser.id ? { ...u, role } : u)));
        } catch (error) {
            console.error('Error updating user role:', error);
        } finally {
            setUserActionId(null);
        }
    };

    const handleDeleteUser = async (targetUser: AdminUser) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        if (!window.confirm(`Delete user "${targetUser.name}" (${targetUser.email})?`)) return;
        setUserActionId(targetUser.id);
        try {
            const response = await fetch(`/api/admin/users/${targetUser.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json() as { success?: boolean; error?: string };
            if (!response.ok) throw new Error(data.error || 'Failed to delete user');
            setUsers(prev => prev.filter(u => u.id !== targetUser.id));
        } catch (error) {
            console.error('Error deleting user:', error);
        } finally {
            setUserActionId(null);
        }
    };

    const fetchUserSessions = async (targetUserId: string) => {
        const token = localStorage.getItem('token');
        if (!token || !targetUserId) return;
        setIsLoadingUserSessions(true);
        setSelectedSession(null);
        setSelectedSessionId('');
        try {
            const response = await fetch(`/api/admin/users/${targetUserId}/sessions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json() as { sessions?: AdminSessionSummary[]; error?: string };
            if (!response.ok) throw new Error(data.error || 'Failed to fetch user sessions');
            setUserSessions(data.sessions || []);
        } catch (error) {
            console.error('Error fetching user sessions:', error);
            setUserSessions([]);
        } finally {
            setIsLoadingUserSessions(false);
        }
    };

    const fetchSessionDetail = async (targetUserId: string, targetSessionId: string) => {
        const token = localStorage.getItem('token');
        if (!token || !targetUserId || !targetSessionId) return;
        setIsLoadingSessionDetail(true);
        try {
            const response = await fetch(`/api/admin/users/${targetUserId}/sessions/${targetSessionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json() as { session?: ChatSession; error?: string };
            if (!response.ok) throw new Error(data.error || 'Failed to fetch session detail');
            setSelectedSession(data.session || null);
        } catch (error) {
            console.error('Error fetching session detail:', error);
            setSelectedSession(null);
        } finally {
            setIsLoadingSessionDetail(false);
        }
    };

    const handleSelectUserForSessions = (value: string) => {
        setSelectedUserForSessions(value);
        void fetchUserSessions(value);
    };

    const handleSelectSession = (value: string) => {
        setSelectedSessionId(value);
        if (!selectedUserForSessions) return;
        void fetchSessionDetail(selectedUserForSessions, value);
    };

    const handleRefreshUserSessions = () => {
        if (!selectedUserForSessions) return;
        void fetchUserSessions(selectedUserForSessions);
    };

    const renderRoleIcon = (role: string) => {
        switch (role) {
            case 'vision':
                return <Eye key={role} size={14} className="bk-admin-model-role-icon" />;
            case 'reasoning':
                return <Sparkles key={role} size={14} className="bk-admin-model-role-icon" />;
            default:
                return null;
        }
    };

    const loadedModels = availableModels.filter(m => m.isLoaded);
    const notLoadedModels = availableModels.filter(m => !m.isLoaded);

    return (
        <div className="bk-admin-modal">
            {/* Navigation Tabs */}
            <div className="bk-admin-nav">
                <button
                    className={`bk-admin-nav-item ${activeSection === 'models' ? 'active' : ''}`}
                    onClick={() => setActiveSection('models')}
                >
                    <AlertCircle size={16} />
                    Models
                </button>
                <button
                    className={`bk-admin-nav-item ${activeSection === 'defaults' ? 'active' : ''}`}
                    onClick={() => setActiveSection('defaults')}
                >
                    <Zap size={16} />
                    Defaults
                </button>
                <button
                    className={`bk-admin-nav-item ${activeSection === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveSection('general')}
                >
                    <Settings size={16} />
                    General
                </button>
                <button
                    className={`bk-admin-nav-item ${activeSection === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveSection('users')}
                >
                    <Users size={16} />
                    Users
                </button>
                <button
                    className={`bk-admin-nav-item ${activeSection === 'sessions' ? 'active' : ''}`}
                    onClick={() => setActiveSection('sessions')}
                >
                    <MessageSquare size={16} />
                    Sessions
                </button>
            </div>

            {/* Content */}
            <div className="bk-admin-content">
                {/* MODEL MANAGEMENT SECTION */}
                {activeSection === 'models' && (
                    <section className="bk-admin-section" style={{ gridColumn: '1 / -1' }}>
                        <h3 className="bk-admin-subsection-title">Model Management</h3>

                        {/* Loaded Models */}
                        {loadedModels.length > 0 && (
                            <div className="bk-admin-models-section">
                                <h4 className="bk-admin-models-header">Loaded Models ({loadedModels.length})</h4>
                                <div className="bk-admin-models-grid">
                                    {loadedModels.map(model => (
                                        <div key={model.id} className="bk-admin-model-card bk-admin-model-card--loaded">
                                            <div className="bk-admin-model-info">
                                                <div className="bk-admin-model-header">
                                                    <div className="bk-admin-model-name">{model.name}</div>
                                                    {model.modelRoles && model.modelRoles.length > 0 && (
                                                        <div className="bk-admin-model-roles">
                                                            {model.modelRoles.map(role => renderRoleIcon(role))}
                                                        </div>
                                                    )}
                                                </div>
                                                {model.loadedInstance?.idleTimeMinutes && (
                                                    <div className="bk-admin-model-meta">
                                                        <Clock size={12} />
                                                        <span>Idle: {model.loadedInstance.idleTimeMinutes}m</span>
                                                    </div>
                                                )}
                                                {model.maxContextLength && (
                                                    <div className="bk-admin-model-meta">
                                                        <Cpu size={12} />
                                                        <span>Context: {model.maxContextLength.toLocaleString()} tokens</span>
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleUnloadModel(model.id)}
                                                leftIcon={<Trash2 size={14} />}
                                            >
                                                Unload
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Not Loaded Models */}
                        {notLoadedModels.length > 0 && (
                            <div className="bk-admin-models-section">
                                <h4 className="bk-admin-models-header">Available Models ({notLoadedModels.length})</h4>
                                <div className="bk-admin-models-grid">
                                    {notLoadedModels.map(model => (
                                        <div key={model.id} className="bk-admin-model-card">
                                            <div className="bk-admin-model-info">
                                                <div className="bk-admin-model-header">
                                                    <div className="bk-admin-model-name">{model.name}</div>
                                                    {model.modelRoles && model.modelRoles.length > 0 && (
                                                        <div className="bk-admin-model-roles">
                                                            {model.modelRoles.map(role => renderRoleIcon(role))}
                                                        </div>
                                                    )}
                                                </div>
                                                {model.maxContextLength && (
                                                    <div className="bk-admin-model-meta">
                                                        <Cpu size={12} />
                                                        <span>Max: {model.maxContextLength.toLocaleString()} tokens</span>
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => handleLoadModelClick(model)}
                                                leftIcon={<Download size={14} />}
                                            >
                                                Load
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* DEFAULT MODELS SECTION */}
                {activeSection === 'defaults' && (
                    <div className="bk-admin-grid">
                        {/* Chat Model */}
                        <section className="bk-admin-section">
                            <label className="bk-admin-label">
                                <Cpu size={16} />
                                Default Chat Model
                            </label>
                            <CustomDropdown
                                options={availableModels
                                    .filter(m => !m.capabilities.includes('embedding'))
                                    .map(m => ({
                                        id: m.id,
                                        name: m.name,
                                        meta: m.provider,
                                        subMeta: m.capabilities.includes('vision') ? <Eye size={12} /> : null
                                    }))}
                                value={chatModel}
                                onChange={(v: string) => setChatModel(v)}
                                placeholder="Select chat model"
                                label="Available Models"
                                icon={<Zap size={18} />}
                            />
                        </section>

                        {/* Vision Model */}
                        <section className="bk-admin-section">
                            <label className="bk-admin-label">
                                <Image size={16} />
                                Default Vision Model
                            </label>
                            <CustomDropdown
                                options={availableModels
                                    .filter(m => m.capabilities.includes('vision'))
                                    .map(m => ({
                                        id: m.id,
                                        name: m.name,
                                        meta: m.provider
                                    }))}
                                value={visionModel}
                                onChange={setVisionModel}
                                placeholder="Select vision model"
                                label="Vision Models"
                                icon={<Image size={18} />}
                            />
                        </section>

                        {/* Embedding Model */}
                        <section className="bk-admin-section">
                            <label className="bk-admin-label">
                                <Database size={16} />
                                Default Embedding Model
                            </label>
                            <CustomDropdown
                                options={availableModels
                                    .filter(m => m.capabilities.includes('embedding'))
                                    .map(m => ({
                                        id: m.id,
                                        name: m.name,
                                        meta: m.provider
                                    }))}
                                value={embeddingModel}
                                onChange={setEmbeddingModel}
                                placeholder="Select embedding model"
                                label="Embedding Models"
                                icon={<Layers size={18} />}
                            />
                        </section>

                        {/* Tool Calling Model */}
                        <section className="bk-admin-section">
                            <label className="bk-admin-label">
                                <Zap size={16} />
                                Default Tool Calling Model
                            </label>
                            <CustomDropdown
                                options={availableModels
                                    .filter(m => !m.capabilities.includes('embedding'))
                                    .map(m => ({
                                        id: m.id,
                                        name: m.name,
                                        meta: m.provider,
                                        subMeta: m.capabilities.includes('vision') ? <Eye size={12} /> : null
                                    }))}
                                value={toolCallingModel}
                                onChange={setToolCallingModel}
                                placeholder="Select tool calling model"
                                label="Available Models"
                                icon={<Zap size={18} />}
                            />
                        </section>
                    </div>
                )}

                {/* GENERAL SETTINGS SECTION */}
                {activeSection === 'general' && (
                    <div className="bk-admin-grid">
                        {/* Reasoning Level */}
                        <section className="bk-admin-section">
                            <label className="bk-admin-label">
                                <Cpu size={16} />
                                Global Reasoning (O1, DeepSeek)
                            </label>
                            <CustomDropdown
                                options={[
                                    { id: 'off', name: 'Off (Standard Output)' },
                                    { id: 'low', name: 'Low Reasoning' },
                                    { id: 'medium', name: 'Medium Reasoning' },
                                    { id: 'high', name: 'High Reasoning' },
                                ]}
                                value={reasoningLevel}
                                onChange={(v: string) => setReasoningLevel(v as 'off' | 'low' | 'medium' | 'high')}
                                placeholder="Select reasoning level"
                                label="Reasoning Profile"
                            />
                        </section>

                        {/* Default Idle Time */}
                        <section className="bk-admin-section">
                            <label className="bk-admin-label">
                                <Clock size={16} />
                                Default Model Idle Time (minutes)
                            </label>
                            <input
                                type="number"
                                value={idleTimeMinutes}
                                onChange={(e) => setIdleTimeMinutes(Math.max(1, parseInt(e.target.value) || 60))}
                                className="bk-input"
                                placeholder="60"
                                min="1"
                                max="1440"
                                style={{ flex: 1 }}
                            />
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                                Models will automatically unload after this period of inactivity
                            </p>
                        </section>
                    </div>
                )}

                {/* USER MANAGEMENT SECTION */}
                {activeSection === 'users' && (
                    <section className="bk-admin-section" style={{ gridColumn: '1 / -1' }}>
                        <h3 className="bk-admin-subsection-title">User Management</h3>

                        {isLoadingUsers ? (
                            <p style={{ color: 'var(--text-muted)' }}>Loading users...</p>
                        ) : (
                            <div className="bk-admin-users-list">
                                {users.map(u => {
                                    const isCurrentUser = user?.id === String(u.id);
                                    const isBusy = userActionId === u.id;
                                    return (
                                        <div key={u.id} className="bk-admin-user-card">
                                            <div className="bk-admin-user-info">
                                                <div className="bk-admin-user-name-row">
                                                    <span className="bk-admin-user-name">{u.name}</span>
                                                    <span className={`bk-admin-user-role ${u.role === 'admin' ? 'bk-admin-user-role--admin' : ''}`}>
                                                        {u.role === 'admin' ? <Shield size={12} /> : <UserIcon size={12} />}
                                                        {u.role}
                                                    </span>
                                                </div>
                                                <div className="bk-admin-user-email">{u.email}</div>
                                                <div className="bk-admin-user-meta">Created: {new Date(u.createdAt).toLocaleString()}</div>
                                            </div>
                                            <div className="bk-admin-user-actions">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    disabled={isBusy || isCurrentUser}
                                                    onClick={() => handleRoleChange(u, u.role === 'admin' ? 'user' : 'admin')}
                                                >
                                                    {u.role === 'admin' ? 'Set User' : 'Set Admin'}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    disabled={isBusy || isCurrentUser}
                                                    leftIcon={<Trash2 size={14} />}
                                                    onClick={() => handleDeleteUser(u)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {/* SESSION AUDIT SECTION */}
                {activeSection === 'sessions' && (
                    <section className="bk-admin-section" style={{ gridColumn: '1 / -1' }}>
                        <h3 className="bk-admin-subsection-title">Check User Sessions</h3>

                        <div className="bk-admin-grid">
                            <section className="bk-admin-section">
                                <label className="bk-admin-label">
                                    <Users size={16} />
                                    Select User
                                </label>
                                <CustomDropdown
                                    options={users.map(u => ({
                                        id: String(u.id),
                                        name: u.name,
                                        meta: u.email,
                                        subMeta: <span>{u.sessionCount || 0} sessions</span>
                                    }))}
                                    value={selectedUserForSessions}
                                    onChange={handleSelectUserForSessions}
                                    placeholder="Choose a user"
                                    label="Users"
                                />
                            </section>

                            <section className="bk-admin-section">
                                <label className="bk-admin-label">
                                    <MessageSquare size={16} />
                                    Select Session
                                </label>
                                <CustomDropdown
                                    options={userSessions.map(s => ({
                                        id: s.id,
                                        name: s.title || 'Untitled Chat',
                                        meta: `${s.messageCount} messages`,
                                        subMeta: <span>{new Date(s.updatedAt).toLocaleString()}</span>
                                    }))}
                                    value={selectedSessionId}
                                    onChange={handleSelectSession}
                                    placeholder={selectedUserForSessions ? 'Choose a chat session' : 'Select user first'}
                                    label="User Sessions"
                                />
                            </section>
                        </div>

                        <div className="bk-admin-sessions-actions">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleRefreshUserSessions}
                                disabled={!selectedUserForSessions || isLoadingUserSessions}
                                leftIcon={<RefreshCw size={14} />}
                            >
                                Refresh Sessions
                            </Button>
                        </div>

                        {isLoadingUserSessions && (
                            <p style={{ color: 'var(--text-muted)' }}>Loading sessions...</p>
                        )}

                        {isLoadingSessionDetail && (
                            <p style={{ color: 'var(--text-muted)' }}>Loading conversation...</p>
                        )}

                        {!isLoadingSessionDetail && selectedSession && (
                            <div className="bk-admin-session-viewer">
                                <div className="bk-admin-session-viewer__header">
                                    <div className="bk-admin-session-viewer__title">{selectedSession.title || 'Untitled Chat'}</div>
                                    <div className="bk-admin-session-viewer__meta">
                                        {selectedSession.messages?.length || 0} messages
                                    </div>
                                </div>

                                <div className="bk-admin-session-messages">
                                    {(selectedSession.messages || []).map((msg: Message) => (
                                        <div key={msg.id} className={`bk-admin-session-message bk-admin-session-message--${msg.role}`}>
                                            <div className="bk-admin-session-message__top">
                                                <span className="bk-admin-session-message__role">{msg.role}</span>
                                                <span className="bk-admin-session-message__time">
                                                    {new Date(msg.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="bk-admin-session-message__body">
                                                <MarkdownRenderer content={msg.content || ''} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

            {/* Footer */}
            <div className="bk-admin-footer">
                {isSaved && (
                    <span className="bk-admin-status">
                        <CheckCircle2 size={16} />
                        Settings saved
                    </span>
                )}
                <Button
                    variant="primary"
                    size="lg"
                    onClick={handleSave}
                    leftIcon={<Save size={18} />}
                >
                    Save Configuration
                </Button>
            </div>
            </div>

            {/* Load Model Modal */}
            <LoadModelModal
                isOpen={loadModelModalOpen}
                onClose={() => setLoadModelModalOpen(false)}
                model={selectedModelToLoad}
                onLoad={handleLoadModel}
                isLoading={isLoadingAModel}
            />
        </div>
    );
}
