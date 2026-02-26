import './AdminPage.css';
import { useState, useEffect } from 'react';
import { useAIConfig } from '../context/AIConfigContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/shared/Button';
import { LoadModelModal } from '../components/shared/LoadModelModal';
import { Cpu, Image, Database, Save, CheckCircle2, Zap, Layers, Eye, Download, Trash2, Clock, Sparkles, Settings, AlertCircle } from 'lucide-react';
import { CustomDropdown } from '../components/shared/CustomDropdown';
import type { AIModel } from '../types';

type AdminSection = 'models' | 'defaults' | 'general';

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

    // Auto-refresh models when admin modal opens
    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

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
