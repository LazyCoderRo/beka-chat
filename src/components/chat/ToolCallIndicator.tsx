import './ToolCallIndicator.css';
import { Eye, Globe, Zap, CheckCircle2, AlertCircle, FileSearch, Database, FileText } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ToolCall } from '../../types';

const ICONS = {
    vision_analysis: Eye,
    document_analysis: FileText,
    web_search: Globe,
    deep_search: Zap,
    webpage_fetch: FileSearch,
    context_summarization: Database,
};

const LABELS = {
    vision_analysis: 'Analyzing image',
    document_analysis: 'Analyzing document',
    web_search: 'Searching web',
    deep_search: 'Deep research',
    webpage_fetch: 'Fetching webpage',
    context_summarization: 'Optimizing context',
};

interface ToolCallIndicatorProps {
    toolCall: ToolCall;
}

export function ToolCallIndicator({ toolCall }: ToolCallIndicatorProps) {
    const Icon = ICONS[toolCall.type];
    const isRunning = toolCall.status === 'running' || toolCall.status === 'pending';
    const isDone = toolCall.status === 'done';
    const isError = toolCall.status === 'error';
    const progress = Math.max(0, Math.min(100, toolCall.progress ?? (isDone ? 100 : isRunning ? 35 : 0)));
    const progressStyle = { '--tc-progress': `${progress}%` } as CSSProperties;

    return (
        <div
            className={`bk-tool-call bk-tool-call--${toolCall.type} ${isRunning ? 'bk-tool-call--running' : ''}`}
            style={progressStyle}
        >
            <span className="bk-tool-call__icon-wrap">
                {isDone
                    ? <CheckCircle2 size={14} className="bk-tool-call__done" />
                    : isError
                        ? <AlertCircle size={14} className="bk-tool-call__error" />
                        : <Icon size={14} />
                }
            </span>
            <span className="bk-tool-call__label">
                {toolCall.label || LABELS[toolCall.type]}
                {isDone && toolCall.duration !== undefined && (
                    <span className="bk-tool-call__duration">
                        {(toolCall.duration / 1000).toFixed(1)}s
                    </span>
                )}
                {isRunning && (
                    <span className="bk-tool-call__pct">
                        {Math.round(progress)}%
                    </span>
                )}
            </span>
            {isRunning && <span className="bk-tool-call__pulse" />}
            {isRunning && <span className="bk-tool-call__progress" />}
        </div>
    );
}
