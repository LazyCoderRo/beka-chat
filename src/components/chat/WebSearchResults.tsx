import './WebSearchResults.css';
import { Globe, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { WebSearchResult } from '../../types';

interface WebSearchResultsProps {
    result: WebSearchResult;
}

function safeHttpUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
        return null;
    } catch {
        return null;
    }
}

export function WebSearchResults({ result }: WebSearchResultsProps) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? result.sources : result.sources.slice(0, 3);

    return (
        <div className="bk-web-results">
            <div className="bk-web-results__header">
                <Globe size={14} className="bk-web-results__icon" />
                <span className="bk-web-results__title">Sources</span>
                <span className="bk-web-results__count">{result.sources.length}</span>
            </div>
            <div className="bk-web-results__sources">
                {visible.map((src, i) => (
                    (() => {
                        const safeUrl = safeHttpUrl(src.url);
                        if (!safeUrl) return null;

                        return (
                            <a
                                key={i}
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bk-web-results__source"
                            >
                                <div className="bk-web-results__source-header">
                                    <Globe size={14} className="bk-web-results__favicon" />
                                    <span className="bk-web-results__source-title">{src.title}</span>
                                    <ExternalLink size={11} className="bk-web-results__link-icon" />
                                </div>
                                <span className="bk-web-results__source-snippet">{src.content}</span>
                            </a>
                        );
                    })()
                ))}
            </div>
            {result.sources.length > 3 && (
                <button className="bk-web-results__toggle" onClick={() => setExpanded(e => !e)}>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {expanded ? 'Show less' : `Show ${result.sources.length - 3} more`}
                </button>
            )}
        </div>
    );
}
