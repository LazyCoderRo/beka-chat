import './WelcomeScreen.css';
import { Bot, Sparkles, Globe, Zap, Paperclip } from 'lucide-react';

const SUGGESTIONS = [
    { icon: <Sparkles size={15} />, text: 'Summarize this document', color: 'accent' },
    { icon: <Globe size={15} />, text: 'Search latest AI news', color: 'web' },
    { icon: <Zap size={15} />, text: 'Deep research: EV market 2025', color: 'deep' },
    { icon: <Paperclip size={15} />, text: 'Analyze this image', color: 'vision' },
];

interface WelcomeScreenProps {
    onSend?: (content: string, attachments: any[], searchMode: any) => void;
}

export function WelcomeScreen({ onSend }: WelcomeScreenProps) {

    return (
        <div className="bk-welcome">
            <div className="bk-welcome__hero">
                <div className="bk-welcome__logo">
                    <Bot size={32} />
                </div>
                <h1 className="bk-welcome__title">
                    How can I help you today?
                </h1>
                <p className="bk-welcome__sub">
                    Ask questions, analyze files, search the web, or start a deep research session.
                </p>
            </div>

            <div className="bk-welcome__suggestions">
                {SUGGESTIONS.map((s, i) => (
                    <button
                        key={i}
                        className={`bk-welcome__chip bk-welcome__chip--${s.color}`}
                        onClick={() => {
                            const mode = s.color === 'web' ? 'web' : s.color === 'deep' ? 'deep' : 'none';
                            onSend?.(s.text, [], mode);
                        }}
                    >
                        <span className="bk-welcome__chip-icon">{s.icon}</span>
                        <span>{s.text}</span>
                    </button>
                ))}
            </div>

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
