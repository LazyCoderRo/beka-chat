import './ModelThinkingPanel.css';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';

interface ModelThinking {
    stepId: string;
    content: string;
    isStreaming: boolean;
}

interface ModelThinkingPanelProps {
    thinkingContent: ModelThinking[];
    isVisible: boolean;
    currentStepId?: string;
}

export function ModelThinkingPanel({ thinkingContent, isVisible, currentStepId }: ModelThinkingPanelProps) {
    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set([currentStepId].filter(Boolean) as string[]));

    useEffect(() => {
        // Auto-expand the currently active step
        if (currentStepId) {
            setExpandedSteps(prev => new Set([...prev, currentStepId]));
        }
    }, [currentStepId]);

    const toggleStep = (stepId: string) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) {
                next.delete(stepId);
            } else {
                next.add(stepId);
            }
            return next;
        });
    };

    if (!isVisible || thinkingContent.length === 0) {
        return null;
    }

    return (
        <div className="bk-thinking-panel">
            <div className="bk-thinking-panel__header">
                <Zap size={16} className="bk-thinking-panel__icon" />
                <h3 className="bk-thinking-panel__title">Model Thinking Process</h3>
            </div>

            <div className="bk-thinking-panel__content">
                {thinkingContent.map((thought) => (
                    <div key={thought.stepId} className="bk-thinking-item">
                        <button
                            className="bk-thinking-item__toggle"
                            onClick={() => toggleStep(thought.stepId)}
                            aria-expanded={expandedSteps.has(thought.stepId)}
                        >
                            {expandedSteps.has(thought.stepId) ? (
                                <ChevronDown size={16} />
                            ) : (
                                <ChevronRight size={16} />
                            )}
                        </button>

                        <span className={`bk-thinking-item__indicator ${thought.isStreaming ? 'bk-thinking-item__indicator--streaming' : ''}`} />

                        <div className="bk-thinking-item__text">
                            {thought.content.slice(0, 100)}
                            {thought.content.length > 100 ? '...' : ''}
                            {thought.isStreaming && <span className="bk-thinking-item__streaming-badge">streaming</span>}
                        </div>

                        {expandedSteps.has(thought.stepId) && (
                            <div className="bk-thinking-item__expanded">
                                <div className="bk-thinking-item__full-content">
                                    {thought.content}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
