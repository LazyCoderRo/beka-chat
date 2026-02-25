import './ModelSelector.css';
import { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check, Eye, Sparkles } from 'lucide-react';
import { useAIConfig } from '../../context/AIConfigContext';
import type { AIModel } from '../../types';

export function ModelSelector() {
    const { availableModels, config, updateConfig, getModelTimeUntilUnload } = useAIConfig();
    const [isOpen, setIsOpen] = useState(false);
    const [timeLeft, setTimeLeft] = useState<Map<string, number>>(new Map());
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Show all loaded models except embedding models
    const loadedModels = availableModels.filter(m =>
        !m.capabilities.includes('embedding') &&
        m.isLoaded
    );

    // Show all not-loaded chat/text models
    const notLoadedModels = availableModels.filter(m =>
        !m.capabilities.includes('embedding') &&
        !m.isLoaded &&
        (m.capabilities.includes('text') || m.capabilities.includes('vision'))
    );

    // Determine selected model: either from config or first available loaded model
    const selectedModel = availableModels.find(m => m.id === config.defaultChatModelId) || loadedModels[0];

    // Update idle timers
    useEffect(() => {
        const interval = setInterval(() => {
            const newTimeLeft = new Map<string, number>();
            loadedModels.forEach(model => {
                const remaining = getModelTimeUntilUnload(model.id);
                if (remaining !== null) {
                    newTimeLeft.set(model.id, remaining);
                }
            });
            setTimeLeft(newTimeLeft);
        }, 1000);

        return () => clearInterval(interval);
    }, [loadedModels, getModelTimeUntilUnload]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleDropdown = () => setIsOpen(!isOpen);

    const handleSelect = (model: AIModel) => {
        updateConfig({ defaultChatModelId: model.id });
        setIsOpen(false);
    };

    if (loadedModels.length === 0 && notLoadedModels.length === 0 && !selectedModel) {
        return (
            <div className="bk-model-selector" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                <button className="bk-model-selector__trigger">
                    <Cpu size={17} className="bk-model-selector__icon" />
                    <span className="bk-model-selector__name">No models available</span>
                </button>
            </div>
        );
    }

    const formatTimeLeft = (seconds: number): string => {
        if (seconds <= 0) return 'Unloading...';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    const renderRoleIcon = (role: string) => {
        switch (role) {
            case 'vision':
                return (
                    <span key={role} title="Vision" className="bk-model-selector__role-container">
                        <Eye size={14} className="bk-model-selector__role-icon" />
                    </span>
                );
            case 'reasoning':
                return (
                    <span key={role} title="Reasoning" className="bk-model-selector__role-container">
                        <Sparkles size={14} className="bk-model-selector__role-icon" />
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bk-model-selector" ref={dropdownRef}>
            <button
                className={`bk-model-selector__trigger ${isOpen ? 'active' : ''}`}
                onClick={toggleDropdown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <Cpu size={17} className="bk-model-selector__icon" />
                <span className="bk-model-selector__name">{selectedModel?.name || 'Select Model'}</span>
                <ChevronDown size={14} className={`bk-model-selector__chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="bk-model-selector__dropdown" role="listbox">
                    {/* Loaded Models Section */}
                    {loadedModels.length > 0 && (
                        <>
                            <div className="bk-model-selector__section-header">
                                <span>Loaded Models</span>
                                <span className="bk-model-selector__badge">{loadedModels.length}</span>
                            </div>
                            <div className="bk-model-selector__list">
                                {loadedModels.map((model) => {
                                    const timeLeftSeconds = timeLeft.get(model.id);
                                    const isSelected = selectedModel?.id === model.id;
                                    return (
                                        <button
                                            key={model.id}
                                            className={`bk-model-selector__item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => handleSelect(model)}
                                            role="option"
                                            aria-selected={isSelected}
                                        >
                                            <div className="bk-model-selector__item-info">
                                                <div className="bk-model-selector__item-name">
                                                    <div className="bk-model-selector__name-group">
                                                        <span className="bk-model-selector__model-name-text">{model.name}</span>
                                                        <div className="bk-model-selector__roles">
                                                            {model.modelRoles?.map(role => renderRoleIcon(role))}
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check size={14} className="bk-model-selector__check" />}
                                                </div>
                                                <div className="bk-model-selector__item-meta">
                                                    <span className="bk-model-selector__provider">{model.provider}</span>
                                                </div>
                                                {timeLeftSeconds !== undefined && (
                                                    <div className="bk-model-selector__idle-time">
                                                        Unloads in: {formatTimeLeft(timeLeftSeconds)}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* Available Models Section */}
                    {notLoadedModels.length > 0 && (
                        <>
                            <div className="bk-model-selector__section-header">
                                <span>Available Models</span>
                                <span className="bk-model-selector__badge">{notLoadedModels.length}</span>
                            </div>
                            <div className="bk-model-selector__list">
                                {notLoadedModels.map((model) => {
                                    const isSelected = selectedModel?.id === model.id;
                                    return (
                                        <button
                                            key={model.id}
                                            className={`bk-model-selector__item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => handleSelect(model)}
                                            role="option"
                                            aria-selected={isSelected}
                                        >
                                            <div className="bk-model-selector__item-info">
                                                <div className="bk-model-selector__item-name">
                                                    <div className="bk-model-selector__name-group">
                                                        <span className="bk-model-selector__model-name-text">{model.name}</span>
                                                        <div className="bk-model-selector__roles">
                                                            {model.modelRoles?.map(role => renderRoleIcon(role))}
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check size={14} className="bk-model-selector__check" />}
                                                </div>
                                                <div className="bk-model-selector__item-meta">
                                                    <span className="bk-model-selector__provider">{model.provider}</span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
