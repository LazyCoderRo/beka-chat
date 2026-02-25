import './ChatInput.css';
import { useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react';
import { Send, Paperclip, Globe, Zap, X, Trash2, Mic, Square } from 'lucide-react';
import { FilePreview } from './FilePreview';
import { ModelSelector } from '../layout/ModelSelector';
import { ReasoningSelector } from '../layout/ReasoningSelector';
import { useAIConfig } from '../../context/AIConfigContext';
import { getRuleForModel } from '../../data/modelRules';
import { parseDocument } from '../../utils/documentParser';
import type { FileAttachment, SearchMode, AIModel, Message, MessageActionSuggestion } from '../../types';

const ACCEPTED_TYPES = '.txt,.pdf,.xls,.xlsx,.jpg,.jpeg,.png,.webp';
const MIME_MAP: Record<string, FileAttachment['type']> = {
    'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image', 'image/webp': 'image',
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'application/vnd.ms-excel': 'text',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'text',
};

let fileIdCounter = 0;

async function buildAttachment(file: File): Promise<FileAttachment> {
    const type = MIME_MAP[file.type] ?? 'text';
    const url = URL.createObjectURL(file);
    let dataUrl: string | undefined;
    let textContent: string | undefined;

    if (type === 'image') {
        dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });
    } else if (type === 'text' || type === 'pdf') {
        // Parse document content (PDF, Excel, text files)
        try {
            textContent = await parseDocument(file);
        } catch (error) {
            console.error('Error parsing document:', error);
            textContent = `[Error parsing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}]`;
        }
    }

    return {
        id: `f-${++fileIdCounter}-${file.name}`,
        name: file.name,
        type,
        mimeType: file.type,
        size: file.size,
        url,
        preview: type === 'image' ? url : undefined,
        dataUrl,
        textContent,
    };
}

interface ChatInputProps {
    onSend: (content: string, attachments: FileAttachment[], searchMode: SearchMode) => void;
    onStop?: () => void;
    onClear?: () => void;
    isGenerating?: boolean;
    disabled?: boolean;
    messages?: Message[];
    promptSuggestions?: MessageActionSuggestion[];
    onSelectSuggestion?: (suggestion: MessageActionSuggestion) => void;
}

export function ChatInput({ onSend, onStop, onClear, isGenerating = false, disabled, messages = [], promptSuggestions = [], onSelectSuggestion }: ChatInputProps) {
    const { config, availableModels } = useAIConfig();
    const [value, setValue] = useState('');
    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    const [searchMode, setSearchMode] = useState<SearchMode>('none');
    const [isDragging, setIsDragging] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [autoSend, setAutoSend] = useState(true);

    const [historyIndex, setHistoryIndex] = useState(-1);
    const [historyValue, setHistoryValue] = useState('');
    const [historyAttachments, setHistoryAttachments] = useState<FileAttachment[]>([]);

    const adjustHeight = () => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
        adjustHeight();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isGenerating) return;
            handleSend();
        } else if (e.key === 'Escape') {
            setValue('');
            setAttachments([]);
            setHistoryIndex(-1);
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        } else if (e.key === 'ArrowUp' && (value === '' || historyIndex !== -1)) {
            const userMsgs = messages.filter(m => m.role === 'user');
            if (userMsgs.length === 0) return;

            const nextIndex = historyIndex === -1 ? userMsgs.length - 1 : historyIndex - 1;
            if (nextIndex >= 0) {
                if (historyIndex === -1) {
                    setHistoryValue(value);
                    setHistoryAttachments(attachments);
                }
                const msg = userMsgs[nextIndex];
                setHistoryIndex(nextIndex);
                setValue(msg.content);
                setAttachments(msg.attachments || []);
                e.preventDefault();
                setTimeout(adjustHeight, 0);
            }
        } else if (e.key === 'ArrowDown' && historyIndex !== -1) {
            const userMsgs = messages.filter(m => m.role === 'user');
            const nextIndex = historyIndex + 1;

            if (nextIndex < userMsgs.length) {
                const msg = userMsgs[nextIndex];
                setHistoryIndex(nextIndex);
                setValue(msg.content);
                setAttachments(msg.attachments || []);
            } else {
                setHistoryIndex(-1);
                setValue(historyValue);
                setAttachments(historyAttachments);
            }
            e.preventDefault();
            setTimeout(adjustHeight, 0);
        }
    };

    const handleSend = () => {
        if (!value.trim() && attachments.length === 0) return;
        onSend(value, attachments, searchMode);
        setValue('');
        setAttachments([]);
        setHistoryIndex(-1);
        setHistoryValue('');
        setHistoryAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const processFiles = async (files: File[]) => {
        if (files.length === 0) return;
        const newAttachments = await Promise.all(files.map(buildAttachment));
        setAttachments(prev => [...prev, ...newAttachments]);
    };

    const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        processFiles(files);
        e.target.value = '';
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = Array.from(e.clipboardData.items);
        const files = items
            .filter(item => item.kind === 'file')
            .map(item => item.getAsFile())
            .filter((file): file is File => file !== null);

        if (files.length > 0) {
            processFiles(files);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        const files = Array.from(e.dataTransfer.files);
        processFiles(files);
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const toggleSearch = (mode: SearchMode) => {
        setSearchMode(prev => prev === mode ? 'none' : mode);
    };

    const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled && !isGenerating;
    const historyMessagesCount = messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
    const selectedModelId = config.defaultChatModelId || availableModels.filter((m: AIModel) => !m.capabilities.includes('vision') && !m.capabilities.includes('embedding'))[0]?.id;
    const selectedModel = availableModels.find((m: AIModel) => m.id === selectedModelId);
    const maxContext = selectedModel?.maxContextLength || 8192;
    const totalContextChars = [
        ...messages.map(m => m.content || ''),
        value
    ].join('\n').length;
    const estimatedContextTokens = Math.max(
        1,
        Math.ceil(totalContextChars / 4) + (historyMessagesCount * 12) + (attachments.length * 30)
    );
    const contextRatio = maxContext > 0 ? estimatedContextTokens / maxContext : 0;
    const contextToneClass =
        contextRatio > 0.9 ? 'bk-chat-input__stat--danger' :
            contextRatio > 0.7 ? 'bk-chat-input__stat--warn' :
                'bk-chat-input__stat--ok';

    return (
        <div
            className={`bk-chat-input-wrap ${isDragging ? 'bk-chat-input-wrap--dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Prompt Suggestions - displayed above input */}
            {promptSuggestions.length > 0 && (
                <div className="bk-chat-input__prompt-suggestions">
                    {promptSuggestions.map(suggestion => (
                        <div key={suggestion.id} className="bk-chat-input__prompt-wrapper">
                            <button
                                className="bk-chat-input__prompt-btn"
                                onClick={() => onSelectSuggestion?.(suggestion)}
                            >
                                {suggestion.label}
                            </button>
                            <div className="bk-chat-input__prompt-tooltip">
                                {suggestion.label}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className={`bk-chat-input ${isDragging ? 'bk-chat-input--dragging' : ''}`}>
                {/* Attached files */}
                {attachments.length > 0 && (
                    <div className="bk-chat-input__files">
                        {attachments.map(f => (
                            <FilePreview key={f.id} file={f} onRemove={() => removeAttachment(f.id)} />
                        ))}
                    </div>
                )}

                {/* Textarea */}
                <div className="bk-chat-input__row">
                    <textarea
                        ref={textareaRef}
                        className="bk-chat-input__textarea"
                        placeholder="Ask anything…"
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        rows={1}
                        disabled={disabled}
                        aria-label="Message input"
                    />
                </div>

                {/* Bottom toolbar */}
                <div className="bk-chat-input__toolbar">
                    <div className="bk-chat-input__tools">
                        {/* File upload */}
                        <button
                            className="bk-chat-input__tool-btn"
                            onClick={() => fileInputRef.current?.click()}
                            title="Attach file (txt, pdf, jpg, png, webp)"
                            disabled={disabled}
                        >
                            <Paperclip size={17} />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_TYPES}
                            multiple
                            onChange={handleFiles}
                            className="bk-chat-input__file-input"
                            aria-hidden
                        />

                        <ModelSelector />

                        {(() => {
                            const rule = getRuleForModel(selectedModelId);
                            return rule?.hasReasoningLevel && <ReasoningSelector />;
                        })()}

                        <div className="bk-chat-input__divider" />

                        {/* Web search toggle */}
                        <button
                            className={`bk-chat-input__tool-btn bk-chat-input__tool-btn--web ${searchMode === 'web' ? 'active' : ''}`}
                            onClick={() => toggleSearch('web')}
                            title="Web search (Beka Search Engine)"
                            disabled={disabled}
                        >
                            <Globe size={17} />
                            <span className="bk-chat-input__tool-label">Web</span>
                        </button>

                        {/* Deep search toggle */}
                        <button
                            className={`bk-chat-input__tool-btn bk-chat-input__tool-btn--deep ${searchMode === 'deep' ? 'active' : ''}`}
                            onClick={() => toggleSearch('deep')}
                            title="Deep search"
                            disabled={disabled}
                        >
                            <Zap size={17} />
                            <span className="bk-chat-input__tool-label">Deep</span>
                        </button>

                        <div className="bk-chat-input__divider" />

                        {/* Mic button - disabled */}
                        <button
                            className="bk-chat-input__tool-btn"
                            title="Voice recording disabled"
                            disabled={true}
                        >
                            <Mic size={17} />
                            <span className="bk-chat-input__tool-label">Record</span>
                        </button>

                        <div className="bk-chat-input__divider" />

                        {/* Auto-send Checkbox */}
                        <label className="bk-chat-input__auto-send">
                            <input
                                type="checkbox"
                                className="bk-chat-input__checkbox"
                                checked={autoSend}
                                onChange={(e) => setAutoSend(e.target.checked)}
                            />
                            Auto-send
                        </label>

                        {/* Active mode indicator */}
                        {searchMode !== 'none' && (
                            <div className={`bk-chat-input__mode-badge bk-chat-input__mode-badge--${searchMode}`}>
                                {searchMode === 'web' ? <Globe size={11} /> : <Zap size={11} />}
                                <span>{searchMode === 'web' ? 'Web Search' : 'Deep Search'}</span>
                                <button onClick={() => setSearchMode('none')} aria-label="Clear search mode">
                                    <X size={11} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bk-chat-input__right">
                        <div className="bk-chat-input__stats">
                            <span className="bk-chat-input__stat">
                                {historyMessagesCount} msg
                            </span>
                            <span className={`bk-chat-input__stat ${contextToneClass}`}>
                                {estimatedContextTokens.toLocaleString()} / {maxContext.toLocaleString()}
                            </span>
                        </div>

                        {/* Send / Stop button */}
                        {isGenerating ? (
                            <button
                                className="bk-chat-input__send bk-chat-input__send--active bk-chat-input__send--stop"
                                onClick={onStop}
                                aria-label="Stop generation"
                                title="Stop generation"
                            >
                                <Square size={14} />
                            </button>
                        ) : (
                            <>
                                <button
                                    className={`bk-chat-input__send ${canSend ? 'bk-chat-input__send--active' : ''}`}
                                    onClick={handleSend}
                                    disabled={!canSend}
                                    aria-label="Send message"
                                >
                                    <Send size={16} />
                                </button>
                                <button
                                    className="bk-chat-input__send bk-chat-input__send--clear"
                                    onClick={onClear}
                                    disabled={!messages || messages.length === 0}
                                    title="Clear chat"
                                    aria-label="Clear chat"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <p className="bk-chat-input__hint">Enter to send · Shift+Enter for new line</p>
        </div>
    );
}
