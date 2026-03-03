import './SessionFilters.css';
import type { SessionFilter } from '../../types';
import { useSession } from '../../context/SessionContext';

const FILTERS: { id: SessionFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'this-week', label: 'This week' },
    { id: 'with-attachments', label: 'Files' },
    { id: 'web-search', label: 'Web' },
    { id: 'deep-search', label: 'Deep Research' },
];

export function SessionFilters() {
    const { activeFilter, setActiveFilter } = useSession();

    return (
        <div className="bk-session-filters" role="tablist" aria-label="Filter sessions">
            {FILTERS.map(f => (
                <button
                    key={f.id}
                    role="tab"
                    aria-selected={activeFilter === f.id}
                    className={`bk-session-filter ${activeFilter === f.id ? 'bk-session-filter--active' : ''}`}
                    onClick={() => setActiveFilter(f.id)}
                >
                    {f.label}
                </button>
            ))}
        </div>
    );
}
