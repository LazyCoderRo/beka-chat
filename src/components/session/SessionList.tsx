import './SessionList.css';
import { MessageSquare } from 'lucide-react';
import { SessionItem } from './SessionItem';
import { EmptyState } from '../shared/EmptyState';
import { useSession } from '../../context/SessionContext';

export function SessionList() {
    const { filteredSessions, searchQuery, activeFilter } = useSession();

    if (filteredSessions.length === 0) {
        const desc = searchQuery
            ? `No chats match "${searchQuery}"`
            : activeFilter !== 'all'
                ? 'No chats match this filter'
                : 'Start a new chat to get going';

        return (
            <div className="bk-session-list bk-session-list--empty">
                <EmptyState
                    icon={<MessageSquare />}
                    title="No chats yet"
                    description={desc}
                />
            </div>
        );
    }

    // Group by date labels (Pinned, Today, Yesterday, Older)
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(sod); yesterday.setDate(sod.getDate() - 1);

    const groups: { label: string; sessions: typeof filteredSessions }[] = [];
    const pinned = filteredSessions.filter(s => s.isPinned);
    const regular = filteredSessions.filter(s => !s.isPinned);

    if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned });

    const today = regular.filter(s => new Date(s.updatedAt) >= sod);
    const yestGroup = regular.filter(s => new Date(s.updatedAt) >= yesterday && new Date(s.updatedAt) < sod);
    const older = regular.filter(s => new Date(s.updatedAt) < yesterday);

    if (today.length) groups.push({ label: 'Today', sessions: today });
    if (yestGroup.length) groups.push({ label: 'Yesterday', sessions: yestGroup });
    if (older.length) groups.push({ label: 'Older', sessions: older });

    return (
        <div className="bk-session-list">
            {groups.map(group => (
                <div key={group.label} className="bk-session-group">
                    <span className="bk-session-group__label">{group.label}</span>
                    {group.sessions.map(s => <SessionItem key={s.id} session={s} />)}
                </div>
            ))}
        </div>
    );
}
