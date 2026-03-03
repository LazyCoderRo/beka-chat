import './MessageBubble.css';
import { Copy, Check, ChevronDown, Trash2, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import type { Message, MessageActionSuggestion } from '../../types';
import { FilePreview } from './FilePreview';
import { ToolCallIndicator } from './ToolCallIndicator';
import { WebSearchResults } from './WebSearchResults';
import { DeepSearchProgress } from './DeepSearchProgress';
import { LoadingDots } from '../shared/Spinner';
import { MarkdownRenderer } from './MarkdownRenderer';
import { copyToClipboardSafe } from '../../utils/clipboard';

interface MessageBubbleProps {
    message: Message;
    onToggleReasoning?: (msgId: string) => void;
    onImageClick?: (src: string) => void;
    onDeleteMessage?: (msgId: string) => void;
    onEditMessage?: (msgId: string, content: string) => void;
    onSelectSuggestion?: (msgId: string, suggestion: MessageActionSuggestion) => void;
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, onToggleReasoning, onImageClick, onDeleteMessage, onEditMessage, onSelectSuggestion }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedValue, setEditedValue] = useState(message.content);

    const handleCopy = async () => {
        const copiedOk = await copyToClipboardSafe(message.content || '');
        if (!copiedOk) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleEditSave = () => {
        const next = editedValue.trim();
        if (!next || next === message.content) {
            setIsEditing(false);
            setEditedValue(message.content);
            return;
        }
        onEditMessage?.(message.id, next);
        setIsEditing(false);
    };

    return (
        <div className={`bk-msg ${isUser ? 'bk-msg--user' : 'bk-msg--ai'} ${message.isContextArchived ? 'bk-msg--archived' : ''}`}>
            {/* File attachments */}
            {message.attachments && message.attachments.length > 0 && (
                <div className="bk-msg__attachments">
                    {message.attachments.map(f => (
                        <FilePreview key={f.id} file={f} onClick={onImageClick} />
                    ))}
                </div>
            )}

            {/* Bubble Wrap */}
            {(message.content || message.isStreaming || message.reasoning || message.toolCalls || message.webSearchResult || message.deepSearchSteps) && (
                <div className="bk-msg__bubble-wrap">
                    <div className="bk-msg__bubble">
                        {/* Tool calls and search results */}
                        {(message.toolCalls || message.webSearchResult || message.deepSearchSteps) && (
                            <div className="bk-msg__meta-block">
                                {message.toolCalls?.map(tc => (
                                    <ToolCallIndicator key={tc.id} toolCall={tc} />
                                ))}
                                {message.webSearchResult && (
                                    <WebSearchResults result={message.webSearchResult} />
                                )}
                                {message.deepSearchSteps && (
                                    <DeepSearchProgress
                                        steps={message.deepSearchSteps}
                                        isComplete={!message.isStreaming}
                                    />
                                )}
                            </div>
                        )}

                        {/* Reasoning block */}
                        {!isUser && message.reasoning && (
                            <div className="bk-msg__reasoning-container">
                                <div
                                    className={`bk-msg__reasoning ${!message.reasoningExpanded ? 'bk-msg__reasoning--collapsed' : ''}`}
                                    onClick={() => onToggleReasoning?.(message.id)}
                                >
                                    <div className="bk-msg__reasoning-header">
                                        <span className="bk-msg__reasoning-title">Thinking Process</span>
                                        <ChevronDown size={14} className={`bk-msg__reasoning-chevron ${message.reasoningExpanded ? 'open' : ''}`} />
                                    </div>
                                    <div className="bk-msg__reasoning-content">
                                        {message.reasoning}
                                    </div>
                                </div>
                                {message.reasoningTime && (
                                    <div className="bk-msg__reasoning-tooltip">
                                        Thought for {(message.reasoningTime / 1000).toFixed(1)}s
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="bk-msg__content-wrap">
                            {isUser && isEditing ? (
                                <div className="bk-msg__editor">
                                    <textarea
                                        value={editedValue}
                                        onChange={(e) => setEditedValue(e.target.value)}
                                        className="bk-msg__editor-input"
                                        rows={3}
                                        autoFocus
                                    />
                                    <div className="bk-msg__editor-actions">
                                        <button onClick={() => { setIsEditing(false); setEditedValue(message.content); }} aria-label="Cancel edit">
                                            <X size={12} />
                                        </button>
                                        <button onClick={handleEditSave} aria-label="Save edit">
                                            <Check size={12} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                message.isStreaming && !message.content && !message.reasoning
                                    ? (
                                        <div className="bk-msg__status">
                                            <span className="bk-msg__status-text">{message.statusText || 'Working...'}</span>
                                            <LoadingDots />
                                        </div>
                                    )
                                    : <MarkdownRenderer content={message.content} />
                            )}
                        </div>

                        {!isUser && !!message.actionSuggestions?.length && (
                            <div className="bk-msg__suggestions">
                                {message.actionSuggestions
                                    .filter(s => s.type !== 'prompt') // Only show tool suggestions in bubble
                                    .slice(0, 3)
                                    .map(suggestion => (
                                    <button
                                        key={suggestion.id}
                                        className="bk-msg__suggestion-btn"
                                        onClick={() => onSelectSuggestion?.(message.id, suggestion)}
                                        disabled={message.isStreaming}
                                        title={suggestion.description || suggestion.label}
                                    >
                                        {suggestion.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {!message.isStreaming && (
                        <div className="bk-msg__actions">
                            <button className="bk-msg__action-btn" onClick={handleCopy} aria-label="Copy message">
                                {copied ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                            {isUser && (
                                <button className="bk-msg__action-btn" onClick={() => setIsEditing(v => !v)} aria-label="Edit message">
                                    <Pencil size={13} />
                                </button>
                            )}
                            <button className="bk-msg__action-btn bk-msg__action-btn--danger" onClick={() => onDeleteMessage?.(message.id)} aria-label="Delete message">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="bk-msg__footer">
                <span className="bk-msg__time">{formatTime(message.createdAt)}</span>
                {!isUser && message.responseTime && (
                    <>
                        <span className="bk-msg__dot">•</span>
                        <span className="bk-msg__meta-item">{message.modelName || 'AI'}</span>
                        <span className="bk-msg__dot">•</span>
                        <span className="bk-msg__meta-item">{Math.round(message.tokensPerSecond || 0)} t/s</span>
                        <span className="bk-msg__dot">•</span>
                        <span className="bk-msg__meta-item">{(message.responseTime / 1000).toFixed(1)}s</span>
                    </>
                )}
            </div>
        </div>
    );
}
