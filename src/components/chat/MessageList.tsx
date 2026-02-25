import './MessageList.css';
import { useEffect, useRef } from 'react';
import type { Message, MessageActionSuggestion } from '../../types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
    messages: Message[];
    onToggleReasoning?: (msgId: string) => void;
    onImageClick?: (src: string) => void;
    onDeleteMessage?: (msgId: string) => void;
    onEditMessage?: (msgId: string, content: string) => void;
    onSelectSuggestion?: (msgId: string, suggestion: MessageActionSuggestion) => void;
}

export function MessageList({ messages, onToggleReasoning, onImageClick, onDeleteMessage, onEditMessage, onSelectSuggestion }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const list = bottomRef.current;
        if (list) {
            // Use 'auto' for instant response during streaming
            list.scrollIntoView({ behavior: 'auto' });
        }
    }, [messages]);

    return (
        <div className="bk-msg-list" role="log" aria-live="polite">
            <div className="bk-msg-list__inner">
                {messages.map(msg => (
                    <MessageBubble
                        key={msg.id}
                        message={msg}
                        onToggleReasoning={onToggleReasoning}
                        onImageClick={onImageClick}
                        onDeleteMessage={onDeleteMessage}
                        onEditMessage={onEditMessage}
                        onSelectSuggestion={onSelectSuggestion}
                    />
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
