import './ThinkingIndicator.css';
import { Lightbulb } from 'lucide-react';

interface ThinkingIndicatorProps {
    isThinking: boolean;
    label?: string;
}

export function ThinkingIndicator({ isThinking, label = 'Model is thinking' }: ThinkingIndicatorProps) {
    if (!isThinking) {
        return null;
    }

    return (
        <div className="bk-thinking-indicator">
            <Lightbulb size={16} className="bk-thinking-indicator__icon" />
            <span className="bk-thinking-indicator__text">{label}</span>
            <div className="bk-thinking-indicator__dots">
                <span className="bk-thinking-indicator__dot" />
                <span className="bk-thinking-indicator__dot" />
                <span className="bk-thinking-indicator__dot" />
            </div>
        </div>
    );
}
