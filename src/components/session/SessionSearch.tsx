import './SessionSearch.css';
import { Search, X } from 'lucide-react';
import { useSession } from '../../context/SessionContext';

export function SessionSearch() {
    const { searchQuery, setSearchQuery } = useSession();

    return (
        <div className="bk-session-search">
            <Search size={15} className="bk-session-search__icon" />
            <input
                type="text"
                className="bk-session-search__input"
                placeholder="Search chats…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search sessions"
            />
            {searchQuery && (
                <button
                    className="bk-session-search__clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                >
                    <X size={13} />
                </button>
            )}
        </div>
    );
}
