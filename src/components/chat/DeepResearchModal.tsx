import './DeepResearchModal.css';
import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { Zap } from 'lucide-react';

interface DeepResearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (query: string) => void;
}

export function DeepResearchModal({ isOpen, onClose, onSubmit }: DeepResearchModalProps) {
    const [query, setQuery] = useState('');

    const handleSubmit = () => {
        if (query.trim()) {
            onSubmit(query.trim());
            setQuery('');
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Deep Research"
            size="md"
            footer={
                <div className="bk-deep-research-modal__footer">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!query.trim()}
                        leftIcon={<Zap size={16} />}
                    >
                        Start Research
                    </Button>
                </div>
            }
        >
            <div className="bk-deep-research-modal__content">
                <p className="bk-deep-research-modal__description">
                    Enter a topic or question for in-depth research. The AI will analyze multiple sources
                    and provide comprehensive insights.
                </p>
                <Input
                    label="Research Topic"
                    placeholder="e.g., EV market trends 2025, quantum computing applications, etc."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
            </div>
        </Modal>
    );
}
