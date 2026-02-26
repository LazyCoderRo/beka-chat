import './WelcomeScreen.css';
import { useRef, useState } from 'react';
import { Bot, Sparkles, Globe, Zap, Paperclip } from 'lucide-react';
import { DeepResearchModal } from './DeepResearchModal';
import { parseDocument } from '../../utils/documentParser';
import { useAuth } from '../../context/AuthContext';
import type { FileAttachment, SearchMode } from '../../types';

const SUGGESTIONS = [
    { icon: <Sparkles size={15} />, text: 'Summarize this document', color: 'accent', requiresFile: 'document' as const },
    { icon: <Globe size={15} />, text: 'Search latest AI news', color: 'web', requiresFile: false as const },
    { icon: <Zap size={15} />, text: 'Deep research', color: 'deep', requiresFile: false as const, isModal: true },
    { icon: <Paperclip size={15} />, text: 'Analyze this image', color: 'vision', requiresFile: 'image' as const },
];

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

interface WelcomeScreenProps {
    onSend?: (content: string, attachments: FileAttachment[], searchMode: SearchMode) => void;
}

export function WelcomeScreen({ onSend }: WelcomeScreenProps) {
    const { user } = useAuth();
    const documentInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [isDeepResearchModalOpen, setIsDeepResearchModalOpen] = useState(false);
    const firstName = user?.name?.trim().split(/\s+/)[0] || 'friend';

    const handleSuggestionClick = async (suggestion: typeof SUGGESTIONS[number]) => {
        if (suggestion.isModal) {
            setIsDeepResearchModalOpen(true);
            return;
        }

        if (suggestion.requiresFile === 'document') {
            documentInputRef.current?.click();
        } else if (suggestion.requiresFile === 'image') {
            imageInputRef.current?.click();
        } else {
            const mode = suggestion.color === 'web' ? 'web' : suggestion.color === 'deep' ? 'deep' : 'none';
            onSend?.(suggestion.text, [], mode);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, promptText: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const attachment = await buildAttachment(file);
        onSend?.(promptText, [attachment], 'none');
        e.target.value = ''; // Reset input
    };

    const handleDeepResearchSubmit = (query: string) => {
        onSend?.(query, [], 'deep');
    };

    return (
        <div className="bk-welcome">
            <div className="bk-welcome__hero">
                <div className="bk-welcome__logo">
                    <Bot size={32} />
                </div>
                <h1 className="bk-welcome__title">
                    What are we building today, <span className="bk-welcome__title-accent">{firstName}</span>?
                </h1>
                <p className="bk-welcome__sub">
                    I am Beka: named after a cute little girl, but fully employed as your AI sidekick for questions, files, web hunts, and deep research.
                </p>
            </div>

            <div className="bk-welcome__suggestions">
                {SUGGESTIONS.map((s, i) => (
                    <button
                        key={i}
                        className={`bk-welcome__chip bk-welcome__chip--${s.color}`}
                        onClick={() => handleSuggestionClick(s)}
                    >
                        <span className="bk-welcome__chip-icon">{s.icon}</span>
                        <span>{s.text}</span>
                    </button>
                ))}
            </div>

            {/* Hidden file inputs */}
            <input
                ref={documentInputRef}
                type="file"
                accept=".txt,.pdf,.xls,.xlsx"
                onChange={(e) => handleFileSelect(e, 'Summarize this document')}
                style={{ display: 'none' }}
            />
            <input
                ref={imageInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => handleFileSelect(e, 'Analyze this image')}
                style={{ display: 'none' }}
            />

            {/* Deep Research Modal */}
            <DeepResearchModal
                isOpen={isDeepResearchModalOpen}
                onClose={() => setIsDeepResearchModalOpen(false)}
                onSubmit={handleDeepResearchSubmit}
            />

            <div className="bk-welcome__capabilities">
                <div className="bk-welcome__cap">
                    <Globe size={16} className="bk-welcome__cap-icon bk-welcome__cap-icon--web" />
                    <span>Web Search <span className="bk-welcome__cap-badge">Beka Search Engine</span></span>
                </div>
                <div className="bk-welcome__cap">
                    <Zap size={16} className="bk-welcome__cap-icon bk-welcome__cap-icon--deep" />
                    <span>Deep Research</span>
                </div>
                <div className="bk-welcome__cap">
                    <Paperclip size={16} className="bk-welcome__cap-icon" />
                    <span>Files: PDF, TXT, Images</span>
                </div>
                <div className="bk-welcome__cap">
                    <Sparkles size={16} className="bk-welcome__cap-icon bk-welcome__cap-icon--vision" />
                    <span>Vision Analysis</span>
                </div>
            </div>
        </div>
    );
}
