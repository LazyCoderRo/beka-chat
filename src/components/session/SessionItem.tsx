import './SessionItem.css';
import { Pin, PinOff, Trash2, Globe, Zap, Paperclip, Edit2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { ChatSession } from '../../types';
import { useSession } from '../../context/SessionContext';

interface SessionItemProps {
    session: ChatSession;
}

function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 7 * 86_400_000) return d.toLocaleDateString('en', { weekday: 'short' });
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function SessionItem({ session }: SessionItemProps) {
    const { activeSessionId, setActiveSessionId, deleteSession, pinSession, renameSession } = useSession();
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(session.title);
    const inputRef = useRef<HTMLInputElement>(null);
    const isActive = activeSessionId === session.id;

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const handleRename = () => {
        if (editValue.trim() && editValue !== session.title) {
            renameSession(session.id, editValue);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRename();
        if (e.key === 'Escape') {
            setEditValue(session.title);
            setIsEditing(false);
        }
    };

    return (
        <div
            className={`bk-session-item ${isActive ? 'bk-session-item--active' : ''}`}
            onClick={() => setActiveSessionId(session.id)}
        >
            <div className="bk-session-item__body">
                <div className="bk-session-item__top">
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            className="bk-session-item__title-input"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={handleKeyDown}
                            onClick={e => e.stopPropagation()}
                        />
                    ) : (
                        <span className="bk-session-item__title">{session.title}</span>
                    )}
                    <div className="bk-session-item__meta">
                        {session.isPinned && <Pin size={11} className="bk-session-item__pin" />}
                        <span className="bk-session-item__date">{formatDate(session.updatedAt)}</span>
                    </div>
                </div>
                <div className="bk-session-item__bottom">
                    <span className="bk-session-item__preview">{session.preview}</span>
                    <div className="bk-session-item__badges">
                        {session.hasAttachments && <Paperclip size={11} className="bk-session-item__badge" />}

                        {(session.usedSearchModes || (session.searchMode !== 'none' ? [session.searchMode] : [])).map(mode => (
                            <div key={mode} style={{ display: 'contents' }}>
                                {mode === 'web' && (
                                    <div className="bk-session-item__tag bk-session-item__tag--web">
                                        <Globe size={11} />
                                        <span>Web</span>
                                    </div>
                                )}
                                {mode === 'deep' && (
                                    <div className="bk-session-item__tag bk-session-item__tag--deep">
                                        <Zap size={11} />
                                        <span>Deep</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bk-session-item__actions" onClick={e => e.stopPropagation()}>
                <button
                    className="bk-session-item__action"
                    onClick={() => { setEditValue(session.title); setIsEditing(true); }}
                    title="Rename"
                >
                    <Edit2 size={14} />
                </button>
                <button
                    className="bk-session-item__action"
                    onClick={() => pinSession(session.id)}
                    title={session.isPinned ? 'Unpin' : 'Pin'}
                >
                    {session.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button
                    className="bk-session-item__action bk-session-item__action--danger"
                    onClick={() => deleteSession(session.id)}
                    title="Delete"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}
