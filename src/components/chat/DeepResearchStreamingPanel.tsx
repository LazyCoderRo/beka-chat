import './DeepResearchStreamingPanel.css';
import { ChevronDown, ChevronRight, Zap, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingIndicator } from './ThinkingIndicator';

interface StreamingStep {
    id: string;
    label: string;
    thinking?: string;
    response?: string;
    isStreaming: boolean;
}

interface DeepResearchStreamingPanelProps {
    currentStep: StreamingStep | null;
    isVisible: boolean;
}

export function DeepResearchStreamingPanel({ currentStep, isVisible }: DeepResearchStreamingPanelProps) {
    const [expandThinking, setExpandThinking] = useState(true);
    const [expandResponse, setExpandResponse] = useState(true);

    useEffect(() => {
        // Auto-scroll thinking and response as they stream
        const timer = setTimeout(() => {
            const thinkingContent = document.querySelector('.bk-deep-research-streaming__thinking-content');
            const responseContent = document.querySelector('.bk-deep-research-streaming__response-content');
            
            if (thinkingContent) {
                thinkingContent.scrollTop = thinkingContent.scrollHeight;
            }
            if (responseContent) {
                responseContent.scrollTop = responseContent.scrollHeight;
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [currentStep?.thinking, currentStep?.response]);

    if (!isVisible || !currentStep) {
        return null;
    }

    return (
        <div className="bk-deep-research-streaming">
            <div className="bk-deep-research-streaming__header">
                <div className="bk-deep-research-streaming__title-section">
                    <Zap size={16} className="bk-deep-research-streaming__icon" />
                    <h3 className="bk-deep-research-streaming__title">Current Step</h3>
                </div>
            </div>

            <div className="bk-deep-research-streaming__step-label">
                {currentStep.label}
                {currentStep.isStreaming && <ThinkingIndicator isThinking={true} label="Streaming..." />}
            </div>

            <div className="bk-deep-research-streaming__content">
                {/* Thinking Section */}
                {currentStep.thinking && (
                    <div className="bk-deep-research-streaming__section">
                        <button
                            className="bk-deep-research-streaming__section-header"
                            onClick={() => setExpandThinking(!expandThinking)}
                            aria-expanded={expandThinking}
                        >
                            <span className="bk-deep-research-streaming__section-toggle">
                                {expandThinking ? (
                                    <ChevronDown size={16} />
                                ) : (
                                    <ChevronRight size={16} />
                                )}
                            </span>
                            <Zap size={14} className="bk-deep-research-streaming__section-icon" />
                            <span className="bk-deep-research-streaming__section-title">Thinking</span>
                            {currentStep.isStreaming && currentStep.thinking && !currentStep.response && (
                                <div className="bk-deep-research-streaming__streaming-indicator">
                                    <div className="bk-deep-research-streaming__pulse">●</div>
                                </div>
                            )}
                        </button>

                        {expandThinking && (
                            <div className="bk-deep-research-streaming__thinking-content">
                                <div className="bk-deep-research-streaming__text">
                                    {currentStep.thinking}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Response Section */}
                {currentStep.response && (
                    <div className="bk-deep-research-streaming__section">
                        <button
                            className="bk-deep-research-streaming__section-header"
                            onClick={() => setExpandResponse(!expandResponse)}
                            aria-expanded={expandResponse}
                        >
                            <span className="bk-deep-research-streaming__section-toggle">
                                {expandResponse ? (
                                    <ChevronDown size={16} />
                                ) : (
                                    <ChevronRight size={16} />
                                )}
                            </span>
                            <MessageSquare size={14} className="bk-deep-research-streaming__section-icon" />
                            <span className="bk-deep-research-streaming__section-title">Response</span>
                            {currentStep.isStreaming && currentStep.response && (
                                <div className="bk-deep-research-streaming__streaming-indicator">
                                    <div className="bk-deep-research-streaming__pulse">●</div>
                                </div>
                            )}
                        </button>

                        {expandResponse && (
                            <div className="bk-deep-research-streaming__response-content">
                                <MarkdownRenderer content={currentStep.response} />
                            </div>
                        )}
                    </div>
                )}

                {!currentStep.thinking && !currentStep.response && (
                    <div className="bk-deep-research-streaming__empty">
                        <ThinkingIndicator isThinking={true} label="Waiting for response..." />
                    </div>
                )}
            </div>
        </div>
    );
}
