import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState, useContext, useEffect } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
import yaml from 'js-yaml';
import { copyToClipboardSafe } from '../../utils/clipboard';
import './MarkdownRenderer.css';

interface CodeBlockProps {
    language?: string;
    value: string;
}

function CodeBlock({ language, value }: CodeBlockProps) {
    const ctx = useContext(ThemeContext);
    const theme = ctx?.theme || 'dark';
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const copiedOk = await copyToClipboardSafe(value);
        if (!copiedOk) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bk-code-block">
            <div className="bk-code-block__header">
                <span className="bk-code-block__lang">{language || 'code'}</span>
                <button
                    className={`bk-code-block__copy ${copied ? 'copied' : ''}`}
                    onClick={handleCopy}
                    aria-label="Copy code"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>
            <SyntaxHighlighter
                language={language || 'text'}
                style={theme === 'dark' ? vscDarkPlus : oneLight}
                wrapLongLines={true}
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--bg-active)',
                }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
}

interface VariantSnippet {
    language: string;
    code: string;
}

interface LMSCodeSnippet {
    variants: Record<string, VariantSnippet>;
}

function VariantCodeBlock({ value }: { value: string }) {
    const [activeTab, setActiveTab] = useState<string>('');
    const [data, setData] = useState<LMSCodeSnippet | null>(null);

    useEffect(() => {
        try {
            const parsed = yaml.load(value) as LMSCodeSnippet;
            if (parsed && parsed.variants) {
                setData(parsed);
                setActiveTab(Object.keys(parsed.variants)[0]);
            }
        } catch (e) {
            console.error('Failed to parse LMS_CODE_SNIPPET', e);
        }
    }, [value]);

    if (!data) return <CodeBlock language="yaml" value={value} />;

    const currentVariant = data.variants[activeTab];

    return (
        <div className="bk-code-tabs">
            <div className="bk-code-tabs__header">
                {Object.keys(data.variants).map((name) => (
                    <button
                        key={name}
                        className={`bk-code-tabs__tab ${activeTab === name ? 'active' : ''}`}
                        onClick={() => setActiveTab(name)}
                    >
                        {name}
                    </button>
                ))}
            </div>
            <div className="bk-code-tabs__content">
                <CodeBlock
                    language={currentVariant?.language || 'text'}
                    value={currentVariant?.code || ''}
                />
            </div>
        </div>
    );
}

export function MarkdownRenderer({ content }: { content: string }) {
    return (
        <div className="bk-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                    code({ node, inline, className, children, ...props }: any) {
                        const match = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
                        const lang = match ? match[1].toLowerCase() : '';

                        const isLMS = !inline && (
                            lang === 'lms_code_snippet' ||
                            lang === 'lms-code-snippet' ||
                            lang === 'lms' ||
                            lang === 'lms-snippet'
                        );

                        if (isLMS) {
                            return <VariantCodeBlock value={String(children).replace(/\n$/, '')} />;
                        }

                        return !inline && match ? (
                            <CodeBlock
                                language={match[1]}
                                value={String(children).replace(/\n$/, '')}
                                {...props}
                            />
                        ) : (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        );
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
