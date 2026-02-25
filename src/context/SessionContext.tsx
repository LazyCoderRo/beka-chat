/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react';
import type { ChatSession, SessionFilter } from '../types';
import { useAuth } from './AuthContext';

interface SessionContextValue {
    sessions: ChatSession[];
    activeSessionId: string | null;
    setActiveSessionId: (id: string | null) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    activeFilter: SessionFilter;
    setActiveFilter: (f: SessionFilter) => void;
    filteredSessions: ChatSession[];
    activeSession: ChatSession | null;
    createNewSession: () => string;
    deleteSession: (id: string) => void;
    pinSession: (id: string) => void;
    renameSession: (id: string, newTitle: string) => void;
    setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function applyFilter(sessions: ChatSession[], filter: SessionFilter, query: string): ChatSession[] {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());

    let filtered = sessions;

    if (query.trim()) {
        const q = query.toLowerCase();
        filtered = filtered.filter(s =>
            s.title.toLowerCase().includes(q) ||
            s.preview.toLowerCase().includes(q) ||
            s.tags?.some(t => t.toLowerCase().includes(q))
        );
    }

    switch (filter) {
        case 'with-attachments':
            filtered = filtered.filter(s => s.hasAttachments);
            break;
        case 'web-search':
            filtered = filtered.filter(s => s.usedSearchModes?.includes('web'));
            break;
        case 'deep-search':
            filtered = filtered.filter(s => s.usedSearchModes?.includes('deep'));
            break;
        case 'today':
            filtered = filtered.filter(s => new Date(s.updatedAt) >= startOfDay);
            break;
        case 'this-week':
            filtered = filtered.filter(s => new Date(s.updatedAt) >= startOfWeek);
            break;
        default:
            break;
    }

    return [...filtered].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

function generateId() {
    return 'session-' + Date.now() + Math.random().toString(36).substr(2, 9);
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<SessionFilter>('all');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            setSessions([]);
            setIsLoaded(false);
            return;
        }
        const token = localStorage.getItem('token');
        fetch('/api/sessions', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.sessions) {
                    setSessions(data.sessions);
                }
                setIsLoaded(true);
            })
            .catch(console.error);
    }, [isAuthenticated]);

    // Very naive sync mechanism: whenever active session changes inside sessions, we push to DB.
    // In a production app, we'd debounce this!
    const activeSession = useMemo(
        () => sessions.find(s => s.id === activeSessionId) ?? null,
        [sessions, activeSessionId]
    );

    useEffect(() => {
        if (!isAuthenticated || !activeSession || !isLoaded) return;
        const token = localStorage.getItem('token');
        fetch(`/api/sessions/${activeSession.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(activeSession)
        }).catch(() => {
            // Ignore for now. If it's a new session, it might need POST.
            fetch(`/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(activeSession)
            }).catch(console.error);
        });
    }, [activeSession, isAuthenticated, isLoaded]);


    const filteredSessions = useMemo(
        () => applyFilter(sessions, activeFilter, searchQuery),
        [sessions, activeFilter, searchQuery]
    );

    const createNewSession = (): string => {
        const id = generateId();
        const now = new Date().toISOString();
        const newSession: ChatSession = {
            id,
            title: 'New Chat',
            preview: '',
            messages: [],
            createdAt: now,
            updatedAt: now,
            hasAttachments: false,
            searchMode: 'none',
            usedSearchModes: [],
        };
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(id);

        // Push newly created session explicitly
        const token = localStorage.getItem('token');
        fetch(`/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(newSession)
        }).catch(console.error);

        return id;
    };

    const deleteSession = (id: string) => {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (activeSessionId === id) setActiveSessionId(null);

        const token = localStorage.getItem('token');
        fetch(`/api/sessions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(console.error);
    };

    const pinSession = (id: string) => {
        setSessions(prev =>
            prev.map(s => (s.id === id ? { ...s, isPinned: !s.isPinned } : s))
        );
    };

    const renameSession = (id: string, newTitle: string) => {
        setSessions(prev =>
            prev.map(s => (s.id === id ? { ...s, title: newTitle } : s))
        );
    };

    return (
        <SessionContext.Provider value={{
            sessions, activeSessionId, setActiveSessionId,
            searchQuery, setSearchQuery, activeFilter, setActiveFilter,
            filteredSessions, activeSession,
            createNewSession, deleteSession, pinSession, renameSession,
            setSessions,
        }}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession(): SessionContextValue {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession must be used inside SessionProvider');
    return ctx;
}
