import './LoadModelModal.css';
import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Loader } from 'lucide-react';
import type { AIModel } from '../../types';

interface LoadModelModalProps {
    isOpen: boolean;
    onClose: () => void;
    model: AIModel | null;
    onLoad: (contextWindow: number, idleTimeMinutes: number, unloadOthers: boolean) => Promise<void>;
    isLoading?: boolean;
}

export function LoadModelModal({
    isOpen,
    onClose,
    model,
    onLoad,
    isLoading = false
}: LoadModelModalProps) {
    const [contextWindow, setContextWindow] = useState<number>(model?.maxContextLength || 8192);
    const [idleTimeMinutes, setIdleTimeMinutes] = useState<number>(60);
    const [unloadOthers, setUnloadOthers] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const handleLoad = async () => {
        try {
            setError('');
            if (contextWindow < 128) {
                setError('Context window must be at least 128');
                return;
            }
            if (idleTimeMinutes < 1) {
                setError('Idle time must be at least 1 minute');
                return;
            }
            await onLoad(contextWindow, idleTimeMinutes, unloadOthers);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load model');
        }
    };

    if (!model) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Load Model: ${model.name}`}
            size="sm"
            footer={
                <div className="bk-load-modal__footer">
                    <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleLoad}
                        disabled={isLoading}
                        leftIcon={isLoading ? <Loader size={16} className="animate-spin" /> : undefined}
                    >
                        {isLoading ? 'Loading...' : 'Load Model'}
                    </Button>
                </div>
            }
        >
            <div className="bk-load-modal__content">
                <div className="bk-load-modal__form-group">
                    <label htmlFor="context-window" className="bk-load-modal__label">
                        Context Window (tokens)
                    </label>
                    <Input
                        id="context-window"
                        type="number"
                        value={contextWindow}
                        onChange={(e) => setContextWindow(parseInt(e.target.value) || 8192)}
                        min={128}
                        max={1000000}
                        disabled={isLoading}
                    />
                    <p className="bk-load-modal__help">
                        Max tokens the model can process at once. Current max: {model.maxContextLength || 'Unknown'}
                    </p>
                </div>

                <div className="bk-load-modal__form-group">
                    <label htmlFor="idle-time" className="bk-load-modal__label">
                        Idle Timeout (minutes)
                    </label>
                    <Input
                        id="idle-time"
                        type="number"
                        value={idleTimeMinutes}
                        onChange={(e) => setIdleTimeMinutes(parseInt(e.target.value) || 60)}
                        min={1}
                        max={1440}
                        disabled={isLoading}
                    />
                    <p className="bk-load-modal__help">
                        Model will auto-unload after this many minutes of inactivity
                    </p>
                </div>

                <div className="bk-load-modal__form-group">
                    <label className="bk-load-modal__checkbox-label">
                        <input
                            type="checkbox"
                            checked={unloadOthers}
                            onChange={(e) => setUnloadOthers(e.target.checked)}
                            disabled={isLoading}
                            className="bk-load-modal__checkbox"
                        />
                        <span>Unload all other models first</span>
                    </label>
                    <p className="bk-load-modal__help">
                        If checked, all currently loaded models will be unloaded before loading this one
                    </p>
                </div>

                {error && (
                    <div className="bk-load-modal__error">
                        {error}
                    </div>
                )}
            </div>
        </Modal>
    );
}
