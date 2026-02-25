import './ModelSelector.css'; // Reuse the same styles
import { useState, useRef, useEffect } from 'react';
import { Brain, ChevronDown, Check } from 'lucide-react';
import { useAIConfig } from '../../context/AIConfigContext';

export function ReasoningSelector() {
    const { config, updateConfig } = useAIConfig();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const levels = ['off', 'low', 'medium', 'high'];
    const selectedLevel = config.reasoningLevel || 'medium';

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (level: string) => {
        updateConfig({ reasoningLevel: level as any });
        setIsOpen(false);
    };

    return (
        <div className="bk-model-selector" ref={dropdownRef}>
            <button
                className={`bk-model-selector__trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Reasoning Level"
            >
                <Brain size={17} className="bk-model-selector__icon" />
                <span className="bk-model-selector__name" style={{ textTransform: 'capitalize' }}>{selectedLevel}</span>
                <ChevronDown size={14} className={`bk-model-selector__chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="bk-model-selector__dropdown" role="listbox" style={{ width: '160px' }}>
                    <div className="bk-model-selector__header">Reasoning Level</div>
                    <div className="bk-model-selector__list">
                        {levels.map((level) => (
                            <button
                                key={level}
                                className={`bk-model-selector__item ${selectedLevel === level ? 'selected' : ''}`}
                                onClick={() => handleSelect(level)}
                                role="option"
                            >
                                <div className="bk-model-selector__item-info">
                                    <div className="bk-model-selector__item-name" style={{ textTransform: 'capitalize' }}>
                                        {level}
                                        {selectedLevel === level && <Check size={14} className="bk-model-selector__check" />}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
