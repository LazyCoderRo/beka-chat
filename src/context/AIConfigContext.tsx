import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { AIModel, ModelRole } from '../types';
import { NotificationOverlay, type Notification } from '../components/shared/NotificationOverlay';

interface AIConfig {
    lmStudioEndpoint: string;
    perplexicaEndpoint: string;
    defaultVisionModelId: string;
    defaultChatModelId: string;
    defaultEmbeddingModelId: string;
    defaultToolCallingModelId: string;
    reasoningLevel?: 'off' | 'low' | 'medium' | 'high';
    defaultIdleTimeMinutes?: number;
}

interface LoadModelOptions {
    contextWindow?: number;
    idleTimeMinutes?: number;
    unloadOtherModels?: boolean;
    skipRefresh?: boolean;
}

interface ServerModelState {
    id: string;
    remainingSeconds: number;
    idleTimeMinutes: number;
    lastUsedAt: string;
}

interface AIConfigContextValue {
    config: AIConfig;
    updateConfig: (newConfig: Partial<AIConfig>) => void;
    availableModels: AIModel[];
    fetchModels: () => Promise<void>;
    isLoadingModels: boolean;
    loadModel: (modelId: string, options?: LoadModelOptions) => Promise<void>;
    unloadModel: (modelId: string) => Promise<void>;
    getModelTimeUntilUnload: (modelId: string) => number | null; // in seconds
    triggerHeartbeat: (modelId: string) => Promise<void>;
}

const DEFAULT_CONFIG: AIConfig = {
    lmStudioEndpoint: 'http://192.168.1.134:1234/api/v1',
    perplexicaEndpoint: '/beka-search',
    defaultVisionModelId: 'qwen3-vl-4b',
    defaultChatModelId: 'gpt-oss-20b',
    defaultEmbeddingModelId: 'nomic-embed-text-v1.5',
    defaultToolCallingModelId: 'liquid/lfm2.5-1.2b',
    defaultIdleTimeMinutes: 60,
    reasoningLevel: 'medium',
};

const AIConfigContext = createContext<AIConfigContextValue | null>(null);

export function AIConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<AIConfig>(() => {
        const saved = localStorage.getItem('bk-ai-config');
        if (!saved) return DEFAULT_CONFIG;
        try {
            return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        } catch {
            return DEFAULT_CONFIG;
        }
    });

    const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [serverModelStates, setServerModelStates] = useState<Map<string, ServerModelState>>(new Map());
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const notifiedModelsRef = useRef<Set<string>>(new Set());
    const lastActivityRef = useRef<number>(Date.now());

    useEffect(() => {
        localStorage.setItem('bk-ai-config', JSON.stringify(config));
    }, [config]);

    // Track user activity
    useEffect(() => {
        const updateActivity = () => {
            lastActivityRef.current = Date.now();
        };
        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);
        window.addEventListener('scroll', updateActivity);
        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            window.removeEventListener('scroll', updateActivity);
        };
    }, []);

    // Fetch config from DB on load
    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.ok ? res.json() : {})
            .then(dbSettings => {
                if (Object.keys(dbSettings).length > 0) {
                    setConfig(prev => ({ ...prev, ...dbSettings }));
                }
            })
            .catch(err => console.error('Failed to load settings from DB:', err));
    }, []);

    const updateConfig = async (newConfig: Partial<AIConfig>) => {
        const mergedConfig = { ...config, ...newConfig };
        setConfig(mergedConfig);

        try {
            const token = localStorage.getItem('token');
            if (token) {
                await fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(newConfig)
                });
            }
        } catch (err) {
            console.error('Failed to save settings to DB:', err);
        }
    };

    const fetchModels = useCallback(async () => {
        setIsLoadingModels(true);
        try {
            const response = await fetch(`${config.lmStudioEndpoint}/models`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json() as { models?: Array<Record<string, unknown>> };

            const models: AIModel[] = (data.models || []).map((m: Record<string, unknown>) => {
                const modelId = (m.key || m.id) as string;
                const loaded = Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0;
                const capabilities = (m.capabilities as Record<string, unknown>) || {};
                
                const roles: ModelRole[] = [];
                if (modelId === config.defaultChatModelId) roles.push('chat');
                if (modelId === config.defaultVisionModelId || capabilities.vision) roles.push('vision');
                if (modelId === config.defaultEmbeddingModelId) roles.push('embedding');
                if (config.reasoningLevel && config.reasoningLevel !== 'off' && modelId === config.defaultChatModelId) {
                    roles.push('reasoning');
                }
                
                const serverState = serverModelStates.get(modelId);
                
                return {
                    id: modelId,
                    name: ((m.display_name || m.id || m.key) as string | undefined) || modelId,
                    provider: 'LM Studio',
                    capabilities: [
                        m.type === 'llm' ? 'text' : null,
                        (m.capabilities as Record<string, unknown>)?.vision ? 'vision' : null,
                        m.type === 'embedding' ? 'embedding' : null
                    ].filter(Boolean) as ('text' | 'vision' | 'search' | 'embedding')[],
                    isLoaded: loaded,
                    maxContextLength:
                        ((m.loaded_instances as Array<Record<string, unknown>>)?.[0]?.config as Record<string, unknown>)?.context_length as number | undefined
                        || (m.max_context_length as number | undefined)
                        || undefined,
                    modelRoles: roles,
                    loadedInstance: loaded ? {
                        contextWindow: ((m.loaded_instances as Array<Record<string, unknown>>)?.[0]?.config as Record<string, unknown>)?.context_length as number | undefined,
                        idleTimeMinutes: serverState?.idleTimeMinutes,
                        lastUsedAt: serverState?.lastUsedAt
                    } : undefined
                };
            });

            setAvailableModels(models);
        } catch (error) {
            console.error('Error fetching models:', error);
        } finally {
            setIsLoadingModels(false);
        }
    }, [config, serverModelStates]);

    // Polling for server model status
    useEffect(() => {
        const pollStatus = async () => {
            try {
                const response = await fetch('/api/models/status');
                if (response.ok) {
                    const status = await response.json() as ServerModelState[];
                    const newStates = new Map<string, ServerModelState>();
                    status.forEach(s => {
                        newStates.set(s.id, s);
                        
                        // Show notification for models with < 30s remaining
                        if (s.remainingSeconds < 30 && s.remainingSeconds > 0) {
                            const model = availableModels.find(m => m.id === s.id);
                            const modelName = model?.name || s.id;
                            
                            // Add or update notification with live timer
                            addNotification({
                                id: `unload-${s.id}`,
                                title: `${modelName} Auto-Unload`,
                                message: 'Model will be unloaded due to inactivity',
                                type: 'warning',
                                dismissible: false, // Cannot dismiss until unloaded
                                remainingSeconds: s.remainingSeconds
                            });
                            notifiedModelsRef.current.add(s.id);
                        }
                        
                        // Clear notification if model is used again (timer reset)
                        if (s.remainingSeconds > 40 && notifiedModelsRef.current.has(s.id)) {
                            notifiedModelsRef.current.delete(s.id);
                            dismissNotification(`unload-${s.id}`);
                        }
                    });
                    setServerModelStates(newStates);
                    
                    // Remove notifications for models no longer in tracking (unloaded)
                    setNotifications(prev => 
                        prev.filter(notif => {
                            if (!notif.id.startsWith('unload-')) return true;
                            const modelId = notif.id.replace('unload-', '');
                            return newStates.has(modelId);
                        })
                    );
                }
            } catch (err) {
                console.error('Failed to poll model status:', err);
            }
        };

        const interval = setInterval(pollStatus, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, [availableModels]);

    const triggerHeartbeat = async (modelId: string) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            
            await fetch('/api/models/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ modelId })
            });
        } catch {
            // Ignore heartbeat errors
        }
    };

    // Periodic heartbeats for all loaded models if user is active
    useEffect(() => {
        const interval = setInterval(() => {
            // Only send periodic heartbeats if user has been active in the last 2 minutes
            const isUserActive = (Date.now() - lastActivityRef.current) < 120000;
            if (!isUserActive) return;

            const loadedModels = availableModels.filter(m => m.isLoaded);
            loadedModels.forEach(model => {
                void triggerHeartbeat(model.id);
            });
        }, 30000); // Heartbeat every 30 seconds

        return () => clearInterval(interval);
    }, [availableModels]);

    const addNotification = (notif: Notification) => {
        setNotifications(prev => {
            // Update existing notification or add new one
            const existing = prev.find(n => n.id === notif.id);
            if (existing) {
                return prev.map(n => n.id === notif.id ? notif : n);
            }
            return [...prev, notif];
        });
    };

    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const loadModel = async (modelId: string, options?: LoadModelOptions) => {
        try {
            const contextWindow = options?.contextWindow || 8192;
            const idleTimeMinutes = options?.idleTimeMinutes || config.defaultIdleTimeMinutes || 60;

            if (options?.unloadOtherModels) {
                const loadedModels = availableModels.filter(m => m.isLoaded && m.id !== modelId);
                for (const model of loadedModels) {
                    await unloadModel(model.id);
                }
            }

            // 1. Load on LM Studio
            const response = await fetch(`${config.lmStudioEndpoint}/models/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    context_length: contextWindow
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to load model: ${response.statusText}`);
            }

            // 2. Track on server
            const token = localStorage.getItem('token');
            await fetch('/api/models/load', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    modelId,
                    idleTimeMinutes
                })
            });

            notifiedModelsRef.current.delete(modelId);
            dismissNotification(`unload-${modelId}`);

            if (options?.skipRefresh !== true) {
                await fetchModels();
            }
        } catch (error) {
            console.error('Error loading model:', error);
            throw error;
        }
    };

    const unloadModel = async (modelId: string) => {
        try {
            // Unload via server (which also unloads on LM Studio)
            const token = localStorage.getItem('token');
            const response = await fetch('/api/models/unload', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ modelId })
            });

            if (!response.ok) {
                throw new Error(`Failed to unload model: ${response.statusText}`);
            }

            notifiedModelsRef.current.delete(modelId);
            dismissNotification(`unload-${modelId}`);
            await fetchModels();
        } catch (error) {
            console.error('Error unloading model:', error);
            throw error;
        }
    };

    const getModelTimeUntilUnload = (modelId: string): number | null => {
        const state = serverModelStates.get(modelId);
        return state ? state.remainingSeconds : null;
    };

    useEffect(() => {
        void fetchModels();
    }, [fetchModels]);

    return (
        <AIConfigContext.Provider value={{
            config,
            updateConfig,
            availableModels,
            fetchModels,
            isLoadingModels,
            loadModel,
            unloadModel,
            getModelTimeUntilUnload,
            triggerHeartbeat
        }}>
            {children}
            <NotificationOverlay notifications={notifications} onDismiss={dismissNotification} />
        </AIConfigContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAIConfig() {
    const ctx = useContext(AIConfigContext);
    if (!ctx) throw new Error('useAIConfig must be used inside AIConfigProvider');
    return ctx;
}
