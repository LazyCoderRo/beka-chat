import { useRef, useState } from 'react';
import './ChatPage.css';
import { useSession } from '../context/SessionContext';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { WelcomeScreen } from '../components/chat/WelcomeScreen';
import { TaskDrawer } from '../components/chat/TaskDrawer';
import { ContextNotification } from '../components/chat/ContextNotification';
import { DeepResearchQuestionsModal } from '../components/chat/DeepResearchQuestionsModal';
import { ResearchFindingsPanel } from '../components/chat/ResearchFindingsPanel';
import { ModelThinkingPanel } from '../components/chat/ModelThinkingPanel';
import { ThinkingIndicator } from '../components/chat/ThinkingIndicator';
import { DeepResearchStreamingPanel } from '../components/chat/DeepResearchStreamingPanel';
import { useAIConfig } from '../context/AIConfigContext';
import { useAuth } from '../context/AuthContext';
import { ImageModal } from '../components/shared/ImageModal';
import { Spinner } from '../components/shared/Spinner';
import { archiveMessagesWithSummary, calculateContextTokens, getContextMessagesForAPI } from '../utils/contextManager';
import { getSmartRecommendations, recommendationsToActionSuggestions, generateNextPromptSuggestionsWithModel } from '../utils/smartRecommendations';
import { generateResearchQuestions } from '../utils/generateResearchQuestions';
import { downloadResearchTrace, captureResearchTrace } from '../utils/exportResearchTrace';
import { copyToClipboardSafe } from '../utils/clipboard';
import type { AIModel, FileAttachment, SearchMode, ChatSession, Message, ToolCall, WebSearchSource, MessageActionSuggestion, ResearchQuestion } from '../types';
import type { ResearchFinding } from '../components/chat/ResearchFindingsPanel';

interface PerplexicaModel {
    key: string;
    name?: string;
}

interface PerplexicaProvider {
    id: string;
    name: string;
    chatModels?: PerplexicaModel[];
    embeddingModels?: PerplexicaModel[];
}

interface PerplexicaSource {
    content?: string;
    metadata?: {
        title?: string;
        url?: string;
    };
}

interface WebpageExtraction {
    url: string;
    title: string;
    content: string;
}

interface ActiveGeneration {
    sessionId: string;
    msgId: string;
    controllers: Set<AbortController>;
    stopped: boolean;
}

interface DeepResearchDrawerState {
    isVisible: boolean;
    currentStep: string;
    tasks: ToolCall[];
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const TOOL_REQUEST_TIMEOUT_MS = 60000;
const DEEP_RESEARCH_TIMEOUT_MS = 600000; // 10 minutes for deep research to allow long model thinking

interface SearchDecision {
    mode: 'none' | 'webpage' | 'web' | 'deep';
    shouldPrompt: boolean;
    promptText?: string;
    suggestions?: MessageActionSuggestion[];
    inferred?: boolean;
    inferredReason?: string;
}

type ModelToolDecision = 'none' | 'web_search' | 'deep_search' | 'webpage_fetch' | 'analyze_image';

const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*)/gi;

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

const LM_STUDIO_PROXY_BASE = '/api/lmstudio';

function resolveModel(
    models: AIModel[],
    preferredId: string | undefined,
    capability?: 'text' | 'vision' | 'embedding' | 'search'
): AIModel | undefined {
    const pool = capability ? models.filter(m => m.capabilities.includes(capability)) : models;
    if (pool.length === 0) return undefined;

    if (preferredId) {
        const preferred = preferredId.trim().toLowerCase();
        const exact = pool.find(m => m.id.toLowerCase() === preferred);
        if (exact) return exact;

        const suffix = pool.find(m => {
            const id = m.id.toLowerCase();
            return id.endsWith(`/${preferred}`) || preferred.endsWith(`/${id}`);
        });
        if (suffix) return suffix;

        const partial = pool.find(m => m.id.toLowerCase().includes(preferred));
        if (partial) return partial;
    }

    return pool.find(m => m.isLoaded) || pool[0];
}

function resolvePerplexicaBase(endpoint: string): string {
    const normalized = trimTrailingSlash(endpoint || '');

    if (
        normalized &&
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        /^https?:\/\/(localhost|127\.0\.0\.1):3000$/i.test(normalized)
    ) {
        return '/beka-search';
    }

    return normalized;
}

function normalizeUrl(url: string): string {
    let normalized = url.trim();
    normalized = normalized
        .replace(/^[<[(\s"'`]+/, '')
        .replace(/[>\])\s"',.;:!?`]+$/, '');

    if (!normalized) return normalized;
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }
    return normalized;
}

/**
 * Check if a model ID is a Qwen model
 */
function isQwenModel(modelId: string): boolean {
    return /qwen|qwq/i.test(modelId);
}

/**
 * Get Qwen sampling parameters based on mode
 * Only returns parameters supported by LM Studio API
 * For tool calling/instruction mode: temperature=1.0, top_p=1.0, top_k=40, min_p=0.0, repeat_penalty=1.0
 * For thinking mode (general chat): temperature=1.0, top_p=0.95, top_k=20, min_p=0.0, repeat_penalty=1.0
 */
function getQwenSamplingParams(isToolMode: boolean): {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    min_p?: number;
    repeat_penalty?: number;
} {
    if (isToolMode) {
        // Instruct (non-thinking) mode for tool calls
        return {
            temperature: 1.0,
            top_p: 1.0,
            top_k: 40,
            min_p: 0.0,
            repeat_penalty: 1.0
        };
    } else {
        // Thinking mode for general chat
        return {
            temperature: 1.0,
            top_p: 0.95,
            top_k: 20,
            min_p: 0.0,
            repeat_penalty: 1.0
        };
    }
}

function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX) ?? [];
    const normalized = matches
        .map(normalizeUrl)
        .filter(Boolean)
        .filter(candidate => {
            try {
                const parsed = new URL(candidate);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        });
    return [...new Set(normalized)];
}

function hasLinkReferenceIntent(text: string): boolean {
    const lowered = text.toLowerCase();
    return [
        'that link',
        'this link',
        'the link',
        'that page',
        'this page',
        'that url',
        'this url',
        'previous link',
        'earlier link',
    ].some(token => lowered.includes(token));
}

function collectRecentUrls(previousMessages: Message[]): string[] {
    const collected: string[] = [];
    for (let i = previousMessages.length - 1; i >= 0; i--) {
        const msg = previousMessages[i];
        collected.push(...extractUrls(msg.content || ''));
        if (msg.webSearchResult?.sources?.length) {
            collected.push(...msg.webSearchResult.sources.map(src => src.url).filter(Boolean));
        }
    }
    return [...new Set(collected)];
}

function withReferencedLinkContext(content: string, previousMessages: Message[]): string {
    const currentUrls = extractUrls(content);
    if (currentUrls.length > 0) return content;
    if (!hasLinkReferenceIntent(content)) return content;

    const recentUrls = collectRecentUrls(previousMessages);
    if (recentUrls.length === 0) return content;

    const topUrls = recentUrls.slice(0, 3);
    return `${content}\n\n[Referenced URLs from prior context: ${topUrls.join(', ')}]`;
}

function hasWebpageIntent(text: string): boolean {
    const lowered = text.toLowerCase();
    return /(website|webpage|page|url|link|site)/.test(lowered);
}

function likelyNeedsFreshWebSearch(text: string): boolean {
    const lowered = text.toLowerCase();
    return /(latest|today|current|recent|this week|this month|news|price|stock|release notes|changelog|events|happening now)/.test(lowered);
}

function maybeBenefitsFromWebSearch(text: string): boolean {
    const lowered = text.toLowerCase();
    return /(events?|updates?|changelog|release notes|news|compare)/.test(lowered);
}

function explicitlyRequestsWebLookup(text: string): boolean {
    const lowered = text.toLowerCase();
    return /(search (the )?(web|internet)|look (it|this|that)? ?up online|check (the )?(web|internet)|find online|browse online)/.test(lowered);
}

function isFollowUpRecheckRequest(text: string): boolean {
    const lowered = text.toLowerCase();
    return /(check again|recheck|double[- ]check|verify again|are you sure|still true|check it again|confirm again)/.test(lowered);
}

function isRetryRequest(text: string): boolean {
    const lowered = text.toLowerCase();
    return /(try again|retry|once more|again please|can you try again|please try again)/.test(lowered);
}

function lastAssistantMessageUsedSearch(previousMessages: Message[]): boolean {
    for (let i = previousMessages.length - 1; i >= 0; i--) {
        const msg = previousMessages[i];
        if (msg.role !== 'assistant') continue;
        return Boolean(msg.webSearchResult || msg.searchMode === 'web' || msg.searchMode === 'deep');
    }
    return false;
}

function lastAssistantSaidNoWebTools(previousMessages: Message[]): boolean {
    for (let i = previousMessages.length - 1; i >= 0; i--) {
        const msg = previousMessages[i];
        if (msg.role !== 'assistant') continue;
        const text = (msg.content || '').toLowerCase();
        return /don't have access|cannot check live|can't check live|only available tool.*image|don't have access to a tool/.test(text);
    }
    return false;
}

function decideSearchStrategy(
    content: string,
    previousMessages: Message[],
    requestedMode: SearchMode,
): SearchDecision {
    const urls = extractUrls(content);
    if (urls.length > 0 || (hasWebpageIntent(content) && hasLinkReferenceIntent(content) && collectRecentUrls(previousMessages).length > 0)) {
        return { mode: 'webpage', shouldPrompt: false };
    }

    const needsFresh = likelyNeedsFreshWebSearch(content);
    if (needsFresh) {
        if (requestedMode === 'deep') return { mode: 'deep', shouldPrompt: false };
        return { mode: 'web', shouldPrompt: false };
    }

    // If user clearly asks to search online, auto-trigger web/deep search.
    if (explicitlyRequestsWebLookup(content)) {
        if (requestedMode === 'deep') return { mode: 'deep', shouldPrompt: false };
        return { mode: 'web', shouldPrompt: false, inferred: true, inferredReason: 'explicit web lookup request' };
    }

    // Follow-up "check again" after a search should keep using web tools.
    if (isFollowUpRecheckRequest(content) && lastAssistantMessageUsedSearch(previousMessages)) {
        if (requestedMode === 'deep') return { mode: 'deep', shouldPrompt: false };
        return { mode: 'web', shouldPrompt: false, inferred: true, inferredReason: 'follow-up recheck after web search' };
    }

    // If assistant previously refused due "no internet/tools" and user asks retry, force search.
    if (isRetryRequest(content) && lastAssistantSaidNoWebTools(previousMessages)) {
        if (requestedMode === 'deep') return { mode: 'deep', shouldPrompt: false };
        return { mode: 'web', shouldPrompt: false, inferred: true, inferredReason: 'retry after tool-access failure' };
    }

    if (requestedMode !== 'none') {
        return { mode: requestedMode, shouldPrompt: false };
    }

    if (maybeBenefitsFromWebSearch(content)) {
        return {
            mode: 'none',
            shouldPrompt: true,
            promptText: 'I can continue directly or look this up online. Pick the next step:',
            suggestions: [
                { id: `act-web-${Date.now()}`, label: 'Search Web', description: 'Quick online lookup for current data.', query: content, searchMode: 'web' },
                { id: `act-deep-${Date.now()}`, label: 'Deep Research', description: 'Multi-step research with verification and synthesis.', query: content, searchMode: 'deep' },
                { id: `act-no-web-${Date.now()}`, label: 'No Web', description: 'Continue only from model knowledge/context.', query: content, searchMode: 'none' },
            ]
        };
    }

    return { mode: 'none', shouldPrompt: false };
}

function toSourceFromPerplexica(source: PerplexicaSource): WebSearchSource | null {
    const url = source.metadata?.url;
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    } catch {
        return null;
    }

    return {
        title: source.metadata?.title || url,
        url,
        content: source.content || ''
    };
}

const SOURCE_ERROR_PATTERN = /(error fetching|failed to fetch|fetch failed|invalid url|timed out|timeout|blocked|forbidden|dns|not found)/i;

function sanitizeWebSources(sources: WebSearchSource[]): WebSearchSource[] {
    const unique = new Map<string, WebSearchSource>();

    for (const source of sources) {
        const url = (source.url || '').trim();
        if (!url) continue;
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
        } catch {
            continue;
        }

        const title = (source.title || url).trim();
        const content = (source.content || '').trim();
        if (SOURCE_ERROR_PATTERN.test(`${title} ${content}`)) continue;

        if (!unique.has(url)) {
            unique.set(url, { title, url, content });
        }
    }

    return Array.from(unique.values());
}

function messageHistoryForPerplexica(previousMessages: Message[], userContent: string): Array<[string, string]> {
    const pairs = getContextMessagesForAPI(previousMessages)
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .slice(-12)
        .map((msg): [string, string] => [msg.role === 'user' ? 'human' : 'assistant', msg.content || '']);

    pairs.push(['human', userContent]);
    return pairs;
}

async function fetchWebpage(url: string, signal?: AbortSignal): Promise<WebpageExtraction> {
    // Use a text mirror endpoint to avoid browser CORS failures on arbitrary sites.
    const proxyUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, '')}`;
    const response = await fetch(proxyUrl, {
        method: 'GET',
        signal,
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (HTTP ${response.status})`);
    }

    const raw = await response.text();
    const firstLine = raw.split('\n').find(line => line.trim().length > 0)?.trim() || '';
    const title = firstLine.replace(/^#+\s*/, '') || new URL(url).hostname;

    return {
        url,
        title,
        content: raw.replace(/\s+/g, ' ').trim().slice(0, 12000)
    };
}

function extractToolCallFromContent(content: string): { prompt: string } | null {
    const pattern = /TOOL_CALL:\s*analyze_image\("([\s\S]*?)"\)/;
    const match = content.match(pattern);
    if (!match) return null;
    return { prompt: match[1] };
}

function sanitizeAssistantContent(text: string): string {
    return text
        .replace(/TOOL_CALL:\s*analyze_image\(".*?"\)/g, '')
        .replace(/<\|channel\|>commentary to=[^\n]*<\|message\|>\{[\s\S]*?\}(?=\n|$)/g, '')
        .replace(/<\|channel\|>[^\n]*/g, '')
        .replace(/<\|constrain\|>[^\n]*/g, '')
        .trim();
}

function createThrottledTextUpdater(
    onUpdate: (value: string) => void,
    intervalMs = 50
) {
    let lastUpdateAt = 0;
    let pending: string | null = null;
    let timer: number | null = null;

    const flush = () => {
        if (pending === null) return;
        onUpdate(pending);
        pending = null;
        lastUpdateAt = Date.now();
        if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
        }
    };

    const schedule = (value: string, force = false) => {
        pending = value;
        const now = Date.now();

        if (force || now - lastUpdateAt >= intervalMs) {
            flush();
            return;
        }

        if (timer === null) {
            const wait = Math.max(0, intervalMs - (now - lastUpdateAt));
            timer = window.setTimeout(() => {
                timer = null;
                flush();
            }, wait);
        }
    };

    const cancel = () => {
        if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
        }
        pending = null;
    };

    return { schedule, flush, cancel };
}

function buildConversationContextForMainModel(previousMessages: Message[], maxTurns = 10): string {
    const recent = previousMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-maxTurns);

    if (recent.length === 0) return '';

    const lines = recent.map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const content = (m.content || '').trim() || '[no text content]';
        return `${role}: ${content}`;
    });

    return `Conversation history:\n${lines.join('\n\n')}\n\nCurrent user message:`;
}

async function inferToolDecisionFromMainModel(
    modelId: string,
    userContent: string,
    previousMessages: Message[]
): Promise<ModelToolDecision | null> {
    const recent = previousMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

    const systemPrompt = `You are a routing controller.
Choose whether the assistant should use a tool.
Available tools:
- web_search
- deep_search
- webpage_fetch
- analyze_image
- none

Rules:
- For real-time facts (time/weather/prices/news/current events), choose web_search or deep_search.
- For requests asking for source links/citations/URLs, choose web_search.
- For explicit URL/page analysis, choose webpage_fetch.
- For image analysis requests with image context, choose analyze_image.
- Otherwise choose none.

Do not overthink. Make the decision quickly based on the clearest match.

Return ONLY strict JSON object:
{"tool":"web_search"}
or {"tool":"none"}`;

    const input = `Conversation context:\n${recent || '[none]'}\n\nCurrent user message:\n${userContent}\n\nReturn JSON now.`;

    const requestBody: Record<string, any> = {
        model: modelId,
        input,
        stream: false,
        system_prompt: systemPrompt
    };

    // Add Qwen sampling parameters for tool calling mode
    if (isQwenModel(modelId)) {
        const qwenParams = getQwenSamplingParams(true); // true = tool mode (instruct)
        Object.assign(requestBody, qwenParams);
    }

    const response = await fetch(`${LM_STUDIO_PROXY_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) return null;
    const data = await response.json() as { output?: Array<{ content?: string }>; content?: string };
    const raw = (data.output?.[0]?.content || data.content || '').trim();
    if (!raw) return null;

    const objectMatch = raw.match(/\{[\s\S]*\}/);
    const candidate = (objectMatch ? objectMatch[0] : raw).trim();
    try {
        const parsed = JSON.parse(candidate) as { tool?: string };
        const tool = (parsed.tool || '').toLowerCase();
        if (tool === 'web_search' || tool === 'deep_search' || tool === 'webpage_fetch' || tool === 'analyze_image' || tool === 'none') {
            return tool as ModelToolDecision;
        }
    } catch {
        // Fallback to null
    }
    return null;
}

export function ChatPage() {
    const { activeSession, setSessions, activeSessionId, createNewSession } = useSession();
    const { user } = useAuth();
    const { config, availableModels, loadModel } = useAIConfig();
    const [fullImage, setFullImage] = useState<string | null>(null);
    const [contextNotification, setContextNotification] = useState<{ message: string } | null>(null);
    const [promptSuggestions, setPromptSuggestions] = useState<MessageActionSuggestion[]>([]);
    const [isSessionCopied, setIsSessionCopied] = useState(false);
    const [autoSearchHint, setAutoSearchHint] = useState<{ mode: SearchMode; reason: string } | null>(null);
    const [isAutoLoading, setIsAutoLoading] = useState(false);
    const [deepResearchDrawer, setDeepResearchDrawer] = useState<DeepResearchDrawerState>({
        isVisible: false,
        currentStep: '',
        tasks: []
    });
    const [deepResearchQuestions, setDeepResearchQuestions] = useState<ResearchQuestion[]>([]);
    const [deepResearchQuestionsOpen, setDeepResearchQuestionsOpen] = useState(false);
    const [pendingDeepResearchTopic, setPendingDeepResearchTopic] = useState<string>('');
    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
    const [researchFindings, setResearchFindings] = useState<ResearchFinding[]>([]);
    const [isThinkingVisible, setIsThinkingVisible] = useState(false);
    const [modelThinkingSteps, setModelThinkingSteps] = useState<Array<{ stepId: string; content: string; isStreaming: boolean }>>([]);
    const [currentDeepResearchTopic, setCurrentDeepResearchTopic] = useState<string>('');
    const [currentDeepResearchSources, setCurrentDeepResearchSources] = useState<WebSearchSource[]>([]);
    const [deepResearchStreamingStep, setDeepResearchStreamingStep] = useState<{
        id: string;
        label: string;
        thinking?: string;
        response?: string;
        isStreaming: boolean;
    } | null>(null);
    const activeGenerationRef = useRef<ActiveGeneration | null>(null);

    const updateAiMessage = (sessionId: string, msgId: string, updates: Partial<Message>) => {
        setSessions((prev: ChatSession[]) => prev.map(s => {
            if (s.id === sessionId) {
                return {
                    ...s,
                    messages: s.messages.map(m => m.id === msgId ? { ...m, ...updates } : m)
                };
            }
            return s;
        }));
    };

    const upsertToolCall = (sessionId: string, msgId: string, toolCall: ToolCall) => {
        setSessions((prev: ChatSession[]) => prev.map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => {
                    if (m.id !== msgId) return m;
                    const existing = m.toolCalls || [];
                    const idx = existing.findIndex(tc => tc.id === toolCall.id);
                    if (idx === -1) {
                        return { ...m, toolCalls: [...existing, toolCall] };
                    }
                    const next = [...existing];
                    next[idx] = { ...next[idx], ...toolCall };
                    return { ...m, toolCalls: next };
                })
            };
        }));
    };

    const resetDeepResearchDrawer = () => {
        setDeepResearchDrawer({ isVisible: false, currentStep: '', tasks: [] });
        setDeepResearchStreamingStep(null);
    };

    const upsertDeepResearchTask = (task: ToolCall) => {
        setDeepResearchDrawer(prev => {
            const existing = prev.tasks;
            const idx = existing.findIndex(t => t.id === task.id);
            const tasks = idx === -1
                ? [...existing, task]
                : existing.map((t, i) => i === idx ? { ...t, ...task } : t);

            return {
                ...prev,
                isVisible: true,
                tasks
            };
        });
    };

    const setDeepResearchStep = (currentStep: string) => {
        setDeepResearchDrawer(prev => ({ ...prev, isVisible: true, currentStep }));
    };

    const initiateDeepResearchWithQuestions = async (topic: string) => {
        setPendingDeepResearchTopic(topic);
        setIsGeneratingQuestions(true);

        try {
            const controller = new AbortController();
            // Short timeout (10s) for questions generation - fail gracefully
            const timeoutId = window.setTimeout(() => {
                controller.abort();
            }, 10000);

            let questions: ResearchQuestion[] = [];

            try {
                // Try to generate questions using tool model
                const toolModel = availableModels.find(m => m.id === config.defaultToolCallingModelId);
                if (toolModel) {
                    questions = await generateResearchQuestions({
                        topic,
                        modelId: toolModel.id,
                        signal: controller.signal,
                        proxyBase: '/api/lmstudio'
                    });
                }
            } catch (err) {
                // Silently fail - will use defaults below
                console.debug('Questions generation failed, using defaults:', err);
            } finally {
                window.clearTimeout(timeoutId);
            }

            // Use generated questions if available, otherwise use defaults
            const finalQuestions = questions.length > 0 ? questions : getDefaultQuestions(topic);
            setDeepResearchQuestions(finalQuestions);
            setDeepResearchQuestionsOpen(true);
        } catch (error) {
            console.error('Error initiating deep research:', error);
            setDeepResearchQuestions(getDefaultQuestions(topic));
            setDeepResearchQuestionsOpen(true);
        } finally {
            setIsGeneratingQuestions(false);
        }
    };

    const handleDeepResearchQuestionsSubmit = (answers: Record<string, string | boolean>) => {
        setDeepResearchQuestionsOpen(false);

        // Build enhanced query with answers
        let enhancedQuery = pendingDeepResearchTopic;
        const answerTexts: string[] = [];

        for (const [_, value] of Object.entries(answers)) {
            if (value === true) {
                answerTexts.push('Include this consideration');
            } else if (value === false) {
                // Skip false answers
            } else if (typeof value === 'string' && value.trim()) {
                answerTexts.push(value.trim());
            }
        }

        if (answerTexts.length > 0) {
            enhancedQuery = `${pendingDeepResearchTopic}\n\nResearch context/preferences:\n${answerTexts.join('\n')}`;
        }

        // Proceed with deep research using the enhanced query
        handleSend(enhancedQuery, [], 'deep', undefined, undefined, {
            forceSearchMode: 'deep',
            bypassPrompt: true
        });

        setPendingDeepResearchTopic('');
    };

    const getDefaultQuestions = (topic: string): ResearchQuestion[] => {
        return [
            {
                id: 'q1',
                question: `Are you looking for recent/current information about "${topic}"?`,
                type: 'yesno',
                required: true
            },
            {
                id: 'q2',
                question: 'Should I include academic/technical sources?',
                type: 'yesno',
                required: false
            },
            {
                id: 'q3',
                question: 'Any specific focus area or industry?',
                type: 'text',
                placeholder: 'e.g., healthcare, business development, research...',
                required: false
            }
        ];
    };

    const handleExportResearchTrace = (format: 'json' | 'markdown') => {
        if (!activeSession) return;

        // Find the assistant message with the final answer
        const lastAssistantMsg = [...activeSession.messages]
            .reverse()
            .find(m => m.role === 'assistant' && m.content);

        if (!lastAssistantMsg) return;

        // Create research trace
        const trace = captureResearchTrace(
            currentDeepResearchTopic || 'Research',
            deepResearchDrawer.tasks,
            currentDeepResearchSources,
            lastAssistantMsg.content || ''
        );

        downloadResearchTrace(trace, format);
    };

    const handleStopGeneration = () => {
        const active = activeGenerationRef.current;
        if (!active) return;

        active.stopped = true;
        active.controllers.forEach(controller => controller.abort());
        active.controllers.clear();
        activeGenerationRef.current = null;

        setSessions((prev: ChatSession[]) => prev.map(s => {
            if (s.id !== active.sessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => {
                    if (m.id !== active.msgId) return m;
                    return {
                        ...m,
                        isStreaming: false,
                        statusText: undefined,
                        toolCalls: m.toolCalls?.map(tc =>
                            tc.status === 'running' || tc.status === 'pending'
                                ? { ...tc, status: 'error', label: 'Stopped by user' }
                                : tc
                        )
                    };
                })
            };
        }));

        setDeepResearchDrawer(prev => {
            const hasActive = prev.tasks.some(t => t.status === 'running' || t.status === 'pending');
            if (!hasActive) return prev;
            return {
                ...prev,
                currentStep: 'Stopped by user',
                tasks: prev.tasks.map(t =>
                    (t.status === 'running' || t.status === 'pending')
                        ? { ...t, status: 'error', label: `${t.label} (stopped)` }
                        : t
                )
            };
        });
    };

    const handleClearChat = () => {
        if (!activeSessionId) return;
        setPromptSuggestions([]);
        setSessions((prev: ChatSession[]) => prev.map(s => {
            if (s.id !== activeSessionId) return s;
            return {
                ...s,
                messages: [],
                preview: '',
                hasAttachments: false,
                updatedAt: new Date().toISOString()
            };
        }));
    };

    const handleCopySessionMarkdown = async () => {
        if (!activeSession || activeSession.messages.length === 0) return;

        const displayName = user?.name?.trim() || 'User';
        const lines: string[] = [];
        lines.push(`# ${activeSession.title || 'Chat Session'}`);
        lines.push('');
        lines.push(`- Session ID: \`${activeSession.id}\``);
        lines.push(`- Exported: ${new Date().toISOString()}`);
        lines.push('');

        activeSession.messages.forEach((msg) => {
            const roleLabel =
                msg.role === 'user' ? `User (${displayName})` :
                    msg.role === 'assistant' ? 'Assistant' :
                        'System';

            lines.push(`## ${roleLabel} · ${new Date(msg.createdAt).toISOString()}`);
            lines.push('');
            lines.push(msg.content?.trim().length ? msg.content : '_[no text content]_');

            if (msg.attachments && msg.attachments.length > 0) {
                lines.push('');
                lines.push('Attachments:');
                msg.attachments.forEach((att) => {
                    lines.push(`- ${att.name} (${att.type}, ${att.mimeType}, ${att.size} bytes)`);
                });
            }

            lines.push('');
        });

        const markdown = lines.join('\n');

        try {
            const copied = await copyToClipboardSafe(markdown);
            if (!copied) throw new Error('Clipboard copy is not supported in this context.');
            setIsSessionCopied(true);
            setTimeout(() => setIsSessionCopied(false), 1500);
        } catch (error) {
            console.error('Failed to copy session markdown:', error);
        }
    };

    /**
     * Create and track a context summarization tool call
     */
    const triggerContextSummarization = async (
        messages: Message[],
        sessionId: string,
        selectedModel: { maxContextLength?: number } | undefined,
        chatModelId: string
    ) => {
        const maxContext = selectedModel?.maxContextLength || 8192;
        const { percentage } = calculateContextTokens(messages, maxContext);

        if (percentage < 0.65 || messages.some(m => m.isContextArchived)) {
            return; // Not at threshold or already summarized
        }

        // Create a tool message to track the summarization
        const toolCallId = `context-sum-${Date.now()}`;
        const summaryMsg: Message = {
            id: toolCallId,
            role: 'assistant',
            content: 'Summarizing conversation to optimize context usage...',
            toolCalls: [{
                id: toolCallId,
                type: 'context_summarization',
                status: 'running',
                label: `Context optimization (${Math.round(percentage * 100)}% → ~40%)`,
                progress: 0,
                startedAt: new Date().toISOString()
            }],
            createdAt: new Date().toISOString(),
            isStreaming: true
        };

        // Add the tool message to the session
        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                messages: [...s.messages, summaryMsg],
                updatedAt: new Date().toISOString()
            };
        }));

        try {
            // Create summarization prompt
            const activeMessages = messages.filter(m => m.role !== 'system' && !m.isContextArchived);
            const conversationText = activeMessages
                .slice(0, -1)
                .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n\n');

            if (!conversationText) {
                // Not enough content to summarize
                setSessions(prev => prev.map(s => {
                    if (s.id !== sessionId) return s;
                    return {
                        ...s,
                        messages: s.messages.filter(m => m.id !== toolCallId),
                        updatedAt: new Date().toISOString()
                    };
                }));
                return;
            }

            const summaryPrompt = `Summarize this conversation in 2-3 sentences:\n\n${conversationText}`;
            const response = await fetch(`${LM_STUDIO_PROXY_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: chatModelId,
                    input: summaryPrompt,
                    stream: false
                })
            });

            if (!response.ok) throw new Error('Summarization failed');

            const data = await response.json() as { output?: Array<{ content?: string }> };
            const summaryContent = data.output?.[0]?.content || '';

            if (!summaryContent) throw new Error('Empty summary');

            // Archive messages and add summary
            const { messages: updatedMessages } = archiveMessagesWithSummary(
                messages,
                summaryContent,
                5
            );

            // Update session with archived messages
            setSessions(prev => prev.map(s => {
                if (s.id !== sessionId) return s;
                // Remove the working tool message and add updated messages
                const withoutTool = s.messages.filter(m => m.id !== toolCallId);
                const newMessages = [...withoutTool, ...updatedMessages.slice(messages.length)];

                return {
                    ...s,
                    messages: newMessages,
                    updatedAt: new Date().toISOString()
                };
            }));

            // Show notification
            const { used, max } = calculateContextTokens(updatedMessages, maxContext);
            setContextNotification({
                message: `Optimized context: ${Math.round((used / max) * 100)}%  of token space (freed ${Math.round(percentage * 100) - Math.round((used / max) * 100)}%)`
            });
        } catch (error) {
            console.error('Context summarization error:', error);
            // Remove failed tool message
            setSessions(prev => prev.map(s => {
                if (s.id !== sessionId) return s;
                return {
                    ...s,
                    messages: s.messages.filter(m => m.id !== toolCallId),
                    updatedAt: new Date().toISOString()
                };
            }));
        }
    };

    /**
     * Check if context summarization is needed and trigger it
     */
    const handleContextSummarization = (
        messages: Message[],
        sessionId: string,
        selectedModel: { maxContextLength?: number } | undefined,
        chatModelId: string
    ) => {
        void triggerContextSummarization(messages, sessionId, selectedModel, chatModelId);
    };

    const handleSend = async (
        content: string,
        attachments: FileAttachment[],
        searchMode: SearchMode,
        forcedSessionId?: string,
        forcedBaseMessages?: Message[],
        options?: {
            skipUserMessage?: boolean;
            forceSearchMode?: SearchMode;
            bypassPrompt?: boolean;
        }
    ) => {
        // Clear previous suggestions before sending new message
        setPromptSuggestions([]);

        // Auto-load models if none are loaded
        const resolvedChatModel = resolveModel(availableModels, config.defaultChatModelId, 'text');
        const resolvedVisionModel = resolveModel(availableModels, config.defaultVisionModelId, 'vision');
        const resolvedToolModel = resolveModel(availableModels, config.defaultToolCallingModelId, 'text');
        const resolvedEmbeddingModel = resolveModel(availableModels, config.defaultEmbeddingModelId, 'embedding');

        const resolvedChatModelId = resolvedChatModel?.id || config.defaultChatModelId;
        const resolvedVisionModelId = resolvedVisionModel?.id || config.defaultVisionModelId;
        const resolvedToolModelId = resolvedToolModel?.id || config.defaultToolCallingModelId;
        const resolvedEmbeddingModelId = resolvedEmbeddingModel?.id || config.defaultEmbeddingModelId;

        const loadedModels = availableModels.filter(m => m.isLoaded);
        if (loadedModels.length === 0) {
            setIsAutoLoading(true);
            try {
                // Check which models need to be loaded
                const defaultChat = availableModels.find(m => m.id === resolvedChatModelId && !m.isLoaded);
                const defaultVision = availableModels.find(m => m.id === resolvedVisionModelId && !m.isLoaded);
                const defaultToolCall = availableModels.find(m => m.id === resolvedToolModelId && !m.isLoaded);

                // Load them in parallel with skip refresh, then refresh once at the end
                const idleMinutes = config.defaultIdleTimeMinutes || 60;
                const modelsToLoad = [];
                if (defaultChat) {
                    modelsToLoad.push(
                        loadModel(defaultChat.id, {
                            contextWindow: 128000,
                            idleTimeMinutes: idleMinutes,
                            skipRefresh: true
                        })
                    );
                }
                if (defaultVision) {
                    modelsToLoad.push(
                        loadModel(defaultVision.id, {
                            contextWindow: 16000,
                            idleTimeMinutes: idleMinutes,
                            skipRefresh: true
                        })
                    );
                }
                if (defaultToolCall) {
                    modelsToLoad.push(
                        loadModel(defaultToolCall.id, {
                            contextWindow: 8000,
                            idleTimeMinutes: idleMinutes,
                            skipRefresh: true
                        })
                    );
                }

                // Wait for all models to load in parallel, then refresh once
                if (modelsToLoad.length > 0) {
                    await Promise.all(modelsToLoad);
                    // Refresh models once after all are loaded
                    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay to ensure LM Studio has processed all loads
                }
            } catch (error) {
                console.error('Error auto-loading models:', error);
                // Continue with the message anyway
            } finally {
                setIsAutoLoading(false);
            }
        }

        let sid = forcedSessionId ?? activeSessionId;
        if (!sid) {
            sid = createNewSession();
        }

        const targetSid = sid;
        const previousMessages = forcedBaseMessages ?? activeSession?.messages ?? [];
        const includeUserMessage = !options?.skipUserMessage;
        const effectiveContent = withReferencedLinkContext(content, previousMessages);
        let strategy = decideSearchStrategy(effectiveContent, previousMessages, searchMode);
        const provisionalSearchMode: SearchMode = options?.forceSearchMode
            || (strategy.mode === 'web' || strategy.mode === 'deep' ? strategy.mode : 'none');

        const userMsgId = Date.now().toString();
        const userMsg: Message = {
            id: userMsgId,
            role: 'user',
            content,
            attachments,
            searchMode: provisionalSearchMode,
            createdAt: new Date().toISOString(),
        };

        // Optimistically show user input immediately so UI doesn't wait on async routing/model prep.
        if (includeUserMessage) {
            setSessions((prev: ChatSession[]) => {
                const existing = prev.find(s => s.id === targetSid);
                const fallbackBaseMessages = forcedBaseMessages ?? [];
                const baseSession: ChatSession = existing ?? {
                    id: targetSid,
                    title: 'New Chat',
                    preview: '',
                    messages: fallbackBaseMessages,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    hasAttachments: false,
                    searchMode: 'none',
                    usedSearchModes: [],
                };

                const baseMessages = forcedBaseMessages ?? baseSession.messages;
                const withoutUserMsg = baseMessages.filter(m => m.id !== userMsgId);
                const usedSearchModes = baseSession.usedSearchModes ? [...baseSession.usedSearchModes] : [];
                if (provisionalSearchMode !== 'none' && !usedSearchModes.includes(provisionalSearchMode)) {
                    usedSearchModes.push(provisionalSearchMode);
                }
                const messages = [...withoutUserMsg, userMsg];
                const nextSession: ChatSession = {
                    ...baseSession,
                    messages,
                    searchMode: provisionalSearchMode !== 'none' ? provisionalSearchMode : baseSession.searchMode,
                    usedSearchModes,
                    hasAttachments: messages.some(m => (m.attachments?.length || 0) > 0),
                    updatedAt: new Date().toISOString(),
                    preview: content.slice(0, 60) || (attachments.length > 0 ? 'Image uploaded' : ''),
                    title: withoutUserMsg.length === 0 ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : baseSession.title
                };

                if (existing) {
                    return prev.map(s => s.id === targetSid ? nextSession : s);
                }
                return [nextSession, ...prev];
            });
        }

        // Model-driven routing first, heuristic strategy as fallback.
        // This keeps tool usage aligned with the main chat model's intent understanding.
        if (!options?.forceSearchMode && searchMode === 'none') {
            try {
                const toolDecision = await inferToolDecisionFromMainModel(
                    resolvedChatModelId || 'default',
                    effectiveContent,
                    previousMessages
                );
                if (toolDecision === 'web_search') {
                    strategy = { mode: 'web', shouldPrompt: false, inferred: true, inferredReason: 'main model tool routing' };
                } else if (toolDecision === 'deep_search') {
                    strategy = { mode: 'deep', shouldPrompt: false, inferred: true, inferredReason: 'main model tool routing' };
                } else if (toolDecision === 'webpage_fetch') {
                    strategy = { mode: 'webpage', shouldPrompt: false, inferred: true, inferredReason: 'main model tool routing' };
                }
            } catch {
                // Keep heuristic strategy when tool routing model call fails.
            }
        }

        const finalSearchMode: SearchMode = options?.forceSearchMode
            || (strategy.mode === 'web' || strategy.mode === 'deep' ? strategy.mode : 'none');

        // If deep research is initiated and questions haven't been forcefully bypassed, show questions first
        if (finalSearchMode === 'deep' && !options?.forceSearchMode && !deepResearchQuestionsOpen && !deepResearchQuestions.length) {
            // Don't proceed yet - instead show the questions modal
            initiateDeepResearchWithQuestions(effectiveContent);
            return;
        }

        if (finalSearchMode !== 'deep') {
            resetDeepResearchDrawer();
            setResearchFindings([]);
            setModelThinkingSteps([]);
        } else {
            // Reset old findings and set current topic for export  
            setCurrentDeepResearchTopic(effectiveContent);
            setCurrentDeepResearchSources([]);
            setResearchFindings([]);
            setModelThinkingSteps([]);
            setIsThinkingVisible(true);
            setDeepResearchDrawer(prev => ({
                isVisible: true,
                currentStep: prev.currentStep || 'Initializing deep research...',
                tasks: prev.tasks
            }));
        }

        if (includeUserMessage && finalSearchMode !== provisionalSearchMode) {
            setSessions((prev: ChatSession[]) => prev.map(s => {
                if (s.id !== targetSid) return s;
                const usedSearchModes = s.usedSearchModes ? [...s.usedSearchModes] : [];
                if (finalSearchMode !== 'none' && !usedSearchModes.includes(finalSearchMode)) {
                    usedSearchModes.push(finalSearchMode);
                }
                return {
                    ...s,
                    searchMode: finalSearchMode !== 'none' ? finalSearchMode : s.searchMode,
                    usedSearchModes,
                    messages: s.messages.map(m => m.id === userMsgId ? { ...m, searchMode: finalSearchMode } : m),
                    updatedAt: new Date().toISOString(),
                };
            }));
        }

        if (
            !options?.forceSearchMode &&
            searchMode === 'none' &&
            finalSearchMode !== 'none' &&
            strategy.inferred
        ) {
            setAutoSearchHint({
                mode: finalSearchMode,
                reason: strategy.inferredReason || 'intent detected'
            });
            setTimeout(() => setAutoSearchHint(null), 3500);
        }

        // Calculate what messages will be after adding user message
        const futureMessages = includeUserMessage ? [...previousMessages, userMsg] : previousMessages;

        // Check and handle context summarization BEFORE adding AI response
        const selectedModel = availableModels.find(m => m.id === resolvedChatModelId);
        handleContextSummarization(futureMessages, targetSid, selectedModel, resolvedChatModelId || 'default');

        const startTime = Date.now();

        if (strategy.shouldPrompt && !options?.bypassPrompt && includeUserMessage) {
            const recommendationMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: strategy.promptText || 'I can search online for this if you want.',
                actionSuggestions: strategy.suggestions?.slice(0, 3),
                toolCalls: [{
                    id: `tc-web-recommend-${Date.now()}`,
                    type: 'web_search',
                    status: 'pending',
                    label: 'Web search recommended. Choose next step.'
                }],
                createdAt: new Date().toISOString(),
            };

            setSessions((prev: ChatSession[]) => {
                const existing = prev.find(s => s.id === targetSid);
                const fallbackBaseMessages = forcedBaseMessages ?? [];
                const baseSession: ChatSession = existing ?? {
                    id: targetSid,
                    title: 'New Chat',
                    preview: '',
                    messages: fallbackBaseMessages,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    hasAttachments: false,
                    searchMode: 'none',
                    usedSearchModes: [],
                };

                const baseMessages = forcedBaseMessages ?? baseSession.messages;
                const withoutUserMsg = baseMessages.filter(m => m.id !== userMsgId);
                const messages = [...withoutUserMsg, userMsg, recommendationMsg];
                const last = messages[messages.length - 1];
                const nextSession: ChatSession = {
                    ...baseSession,
                    messages,
                    hasAttachments: messages.some(m => (m.attachments?.length || 0) > 0),
                    updatedAt: new Date().toISOString(),
                    preview: last?.content?.slice(0, 60) || '',
                    title: withoutUserMsg.length === 0 ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : baseSession.title
                };

                if (existing) {
                    return prev.map(s => s.id === targetSid ? nextSession : s);
                }
                return [nextSession, ...prev];
            });
            return;
        }

        const aiMsgId = (Date.now() + 1).toString();
        const aiMsg: Message = {
            id: aiMsgId,
            role: 'assistant',
            content: '',
            statusText: 'Processing user prompt...',
            isStreaming: true,
            createdAt: new Date().toISOString(),
        };

        const generation: ActiveGeneration = {
            sessionId: targetSid,
            msgId: aiMsgId,
            controllers: new Set(),
            stopped: false
        };
        activeGenerationRef.current = generation;

        setSessions((prev: ChatSession[]) => {
            const existing = prev.find(s => s.id === targetSid);
            const fallbackBaseMessages = forcedBaseMessages ?? [];
            const baseSession: ChatSession = existing ?? {
                id: targetSid,
                title: 'New Chat',
                preview: '',
                messages: fallbackBaseMessages,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                hasAttachments: false,
                searchMode: 'none',
                usedSearchModes: [],
            };

            const baseMessages = forcedBaseMessages ?? baseSession.messages;
            const withoutUserMsg = baseMessages.filter(m => m.id !== userMsgId);
            const usedSearchModes = baseSession.usedSearchModes ? [...baseSession.usedSearchModes] : [];
            if (finalSearchMode !== 'none' && !usedSearchModes.includes(finalSearchMode)) {
                usedSearchModes.push(finalSearchMode);
            }
            const appended = includeUserMessage ? [userMsg, aiMsg] : [aiMsg];
            const messages = [...withoutUserMsg, ...appended];
            const nextSession: ChatSession = {
                ...baseSession,
                messages,
                searchMode: finalSearchMode !== 'none' ? finalSearchMode : baseSession.searchMode,
                usedSearchModes,
                hasAttachments: messages.some(m => (m.attachments?.length || 0) > 0),
                updatedAt: new Date().toISOString(),
                preview: content.slice(0, 60) || (attachments.length > 0 ? 'Image uploaded' : ''),
                title: withoutUserMsg.length === 0 ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : baseSession.title
            };

            if (existing) {
                return prev.map(s => s.id === targetSid ? nextSession : s);
            }
            return [nextSession, ...prev];
        });

        const chatUrl = `${LM_STUDIO_PROXY_BASE}/chat`;
        let timeoutTriggered = false;
        const abortTimeoutIds = new Map<AbortController, number>();
        const createAbortController = () => {
            const controller = new AbortController();
            generation.controllers.add(controller);
            // Use longer timeout for deep research to allow model thinking time
            const timeoutDuration = finalSearchMode === 'deep' ? DEEP_RESEARCH_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS;
            const timeoutId = window.setTimeout(() => {
                if (controller.signal.aborted) return;
                timeoutTriggered = true;
                controller.abort();
            }, timeoutDuration);
            abortTimeoutIds.set(controller, timeoutId);
            return controller;
        };
        const createToolAbortController = () => {
            const controller = new AbortController();
            generation.controllers.add(controller);
            // Use longer timeout for deep research to allow model thinking time
            const timeoutDuration = finalSearchMode === 'deep' ? DEEP_RESEARCH_TIMEOUT_MS : TOOL_REQUEST_TIMEOUT_MS;
            const timeoutId = window.setTimeout(() => {
                if (controller.signal.aborted) return;
                timeoutTriggered = true;
                controller.abort();
            }, timeoutDuration);
            abortTimeoutIds.set(controller, timeoutId);
            return controller;
        };
        const clearAbortTimeouts = () => {
            abortTimeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId));
            abortTimeoutIds.clear();
        };
        const throttledContentUpdate = createThrottledTextUpdater((nextContent: string) => {
            updateAiMessage(targetSid, aiMsgId, { content: nextContent, statusText: undefined });
        }, 50);
        const setStreamingStatus = (statusText: string) => {
            updateAiMessage(targetSid, aiMsgId, { statusText });
        };
        const isAbortedError = (error: unknown) =>
            (error instanceof DOMException && error.name === 'AbortError') ||
            (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError');

        const finalize = (updates?: Partial<Message>) => {
            const totalDur = Date.now() - startTime;
            let latestMessages: Message[] = [];
            setSessions(prev => {
                const s = prev.find(sess => sess.id === targetSid);
                if (s) latestMessages = s.messages;
                return prev;
            });
            if (latestMessages.length === 0) {
                latestMessages = activeSession?.messages || previousMessages;
            }

            const selectedModel = availableModels.find(m => m.id === config.defaultChatModelId);
            const maxContext = selectedModel?.maxContextLength || 8192;
            const { percentage } = calculateContextTokens(latestMessages, maxContext);

            // Generate smart recommendations based on context
            const recommendations = getSmartRecommendations({
                content: effectiveContent,
                attachments,
                previousMessages: latestMessages,
                contextUsagePercentage: percentage,
                maxContext
            });

            const actionSuggestions = recommendationsToActionSuggestions(recommendations);

            // Extract prompt suggestions (for display above input) and tool suggestions (for bubble)
            const promptSuggestionsFiltered = actionSuggestions.filter(s => s.type === 'prompt');
            setPromptSuggestions(promptSuggestionsFiltered);

            updateAiMessage(targetSid, aiMsgId, {
                isStreaming: false,
                statusText: undefined,
                responseTime: totalDur,
                modelName: availableModels.find(m => m.id === resolvedChatModelId)?.name || resolvedChatModelId,
                actionSuggestions: actionSuggestions.length > 0 ? actionSuggestions : undefined,
                ...updates,
            });

            // Generate next prompt suggestions using tool calling model
            const fullContent = updates?.content || (latestMessages.find(m => m.id === aiMsgId)?.content || '');
            generateNextPromptSuggestionsWithModel(
                effectiveContent,
                fullContent,
                LM_STUDIO_PROXY_BASE,
                resolvedToolModelId,
                generation.controllers.values().next().value?.signal
            ).then(toolCallSuggestions => {
                // Update with tool calling suggestions if we got better ones
                if (toolCallSuggestions.length > 0) {
                    updateAiMessage(targetSid, aiMsgId, {
                        actionSuggestions: toolCallSuggestions
                    });
                    // Update prompt suggestions from tool call response
                    const promptSuggestionsFromToolCall = toolCallSuggestions.filter(s => s.type === 'prompt');
                    setPromptSuggestions(promptSuggestionsFromToolCall);
                }
            }).catch(err => {
                console.warn('Tool calling suggestion generation failed, using heuristic suggestions:', err);
            });

            if (activeGenerationRef.current === generation) {
                activeGenerationRef.current = null;
            }
            clearAbortTimeouts();
            generation.controllers.clear();
        };

        const synthesizeFromToolResult = async (
            toolSummary: string,
            toolSources: WebSearchSource[],
            toolModelName: string
        ): Promise<string> => {
            const sourcesText = toolSources.length > 0
                ? toolSources
                    .slice(0, 8)
                    .map((src, i) => `${i + 1}. ${src.title}\nURL: ${src.url}\nSnippet: ${src.content || '[no snippet]'}`)
                    .join('\n\n')
                : 'No valid sources were returned.';

            const synthesisPrompt = [
                `User request: ${effectiveContent}`,
                '',
                'Tool output summary:',
                toolSummary || '[empty]',
                '',
                'Tool sources:',
                sourcesText,
                '',
                'Instructions:',
                '- Use the tool output and sources to answer the user.',
                '- Do not invent links or facts not present in the sources above.',
                '- If sources are insufficient, say what is missing and ask a concise clarification.',
                '- Keep answer concise and practical.',
            ].join('\n');

            const synthesisBody: {
                model: string;
                input: string;
                stream: boolean;
                system_prompt: string;
                reasoning?: 'low' | 'medium' | 'high';
                temperature?: number;
                top_p?: number;
                top_k?: number;
                min_p?: number;
                repeat_penalty?: number;
            } = {
                model: resolvedChatModelId || 'default',
                input: synthesisPrompt,
                stream: false,
                system_prompt: `You are a precise assistant. External tool (${toolModelName}) provided evidence. Produce the final user-facing answer grounded only in that evidence. Do not overthink—answer directly based on the evidence provided without speculation or excessive caveats.`,
                reasoning: config.reasoningLevel && config.reasoningLevel !== 'off' ? config.reasoningLevel : undefined,
            };

            // Add Qwen sampling parameters for tool mode (synthesis)
            if (isQwenModel(synthesisBody.model)) {
                const qwenParams = getQwenSamplingParams(true); // true = tool mode (instruct)
                Object.assign(synthesisBody, qwenParams);
            }

            if (synthesisBody.reasoning && localStorage.getItem(`no-reasoning-${synthesisBody.model}`)) {
                delete synthesisBody.reasoning;
            }

            let synthesisRes = await fetch(chatUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: createAbortController().signal,
                body: JSON.stringify(synthesisBody)
            });

            if (!synthesisRes.ok) {
                let errData: { error?: { param?: string; message?: string } } | null = null;
                try { errData = await synthesisRes.json(); } catch { /* ignore */ }
                if (synthesisRes.status === 400 && synthesisBody.reasoning && (errData?.error?.param === 'reasoning' || errData?.error?.message?.includes('reasoning'))) {
                    localStorage.setItem(`no-reasoning-${synthesisBody.model}`, 'true');
                    delete synthesisBody.reasoning;
                    synthesisRes = await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
                        body: JSON.stringify(synthesisBody)
                    });
                }
            }

            if (!synthesisRes.ok) {
                let errText = '';
                try { errText = JSON.stringify(await synthesisRes.json()); } catch { /* ignore */ }
                throw new Error(`Final synthesis failed (HTTP ${synthesisRes.status})${errText ? `: ${errText}` : ''}`);
            }

            const payload = await synthesisRes.json() as {
                output?: Array<{ content?: string }>;
                content?: string;
                choices?: Array<{ message?: { content?: string } }>;
            };

            return sanitizeAssistantContent(
                payload.output?.[0]?.content ||
                payload.content ||
                payload.choices?.[0]?.message?.content ||
                ''
            ).trim();
        };

        try {
            const urls = extractUrls(effectiveContent);
            const shouldFetchWebpage = strategy.mode === 'webpage' && urls.length > 0;

            if (shouldFetchWebpage) {
                const toolId = `tc-webpage-${Date.now()}`;
                const toolStart = Date.now();
                const firstUrl = urls[0]!;
                const firstHost = new URL(firstUrl).hostname;

                updateAiMessage(targetSid, aiMsgId, {
                    toolCalls: [{
                        id: toolId,
                        type: 'webpage_fetch',
                        status: 'running',
                        label: `Fetching ${firstHost}`,
                        progress: 20,
                        startedAt: new Date().toISOString()
                    }]
                });
                setStreamingStatus('Calling tool: fetching webpage...');

                try {
                    const page = await fetchWebpage(firstUrl, createToolAbortController().signal);

                    updateAiMessage(targetSid, aiMsgId, {
                        toolCalls: [{
                            id: toolId,
                            type: 'webpage_fetch',
                            status: 'done',
                            label: `Fetched ${firstHost}`,
                            progress: 100,
                            duration: Date.now() - toolStart
                        }],
                        webSearchResult: {
                            query: content,
                            sources: [{ title: page.title, url: page.url, content: page.content.slice(0, 280) }]
                        }
                    });
                    setStreamingStatus('Generating final response...');

                    const prompt = [
                        `User request: ${effectiveContent}`,
                        '',
                        'Use the webpage context below to answer. If details are missing, say so clearly.',
                        `URL: ${page.url}`,
                        `Title: ${page.title}`,
                        `Content: ${page.content}`,
                    ].join('\n');

                    const reqBody = {
                        model: config.defaultChatModelId || 'default',
                        input: prompt,
                        stream: true,
                        reasoning: config.reasoningLevel && config.reasoningLevel !== 'off' ? config.reasoningLevel : undefined,
                    };

                    if (reqBody.reasoning && localStorage.getItem(`no-reasoning-${reqBody.model}`)) {
                        delete reqBody.reasoning;
                    }

                    let response = await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
                        body: JSON.stringify(reqBody)
                    });

                    if (!response.ok) {
                        let errorData: { error?: { param?: string; message?: string } } | null = null;
                        try { errorData = await response.json(); } catch { /* ignore */ }

                        // If we get an error about unsupported reasoning, retry without it
                        if (response.status === 400 && reqBody.reasoning && (errorData?.error?.param === 'reasoning' || errorData?.error?.message?.includes('reasoning'))) {
                            localStorage.setItem(`no-reasoning-${reqBody.model}`, 'true');
                            delete reqBody.reasoning;
                            response = await fetch(chatUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                signal: createAbortController().signal,
                                body: JSON.stringify(reqBody)
                            });

                            if (!response.ok) {
                                try { errorData = await response.json(); } catch { errorData = null; }
                                throw new Error(`HTTP ${response.status}: ${errorData ? JSON.stringify(errorData) : 'Bad Request'}`);
                            }
                        } else {
                            throw new Error(`HTTP ${response.status}: ${errorData ? JSON.stringify(errorData) : 'Bad Request'}`);
                        }
                    }
                    const reader = response.body?.getReader();
                    if (!reader) throw new Error('No reader');

                    const decoder = new TextDecoder();
                    let buffer = '';
                    let fullContent = '';
                    let currentEvent = '';
                    let reasoning = '';
                    let reasoningStartTime = 0;

                    updateAiMessage(targetSid, aiMsgId, { reasoningExpanded: true });

                    while (true) {
                        // Check if user stopped generation
                        if (generation.stopped) {
                            throw new Error('Generation stopped by user');
                        }

                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;

                            if (trimmed.startsWith('event: ')) {
                                currentEvent = trimmed.slice(7).trim();
                                continue;
                            }

                            if (!trimmed.startsWith('data: ')) continue;
                            const dataStr = trimmed.slice(6).trim();
                            if (dataStr === '[DONE]') continue;

                            try {
                                const data = JSON.parse(dataStr) as {
                                    type?: string;
                                    content?: string;
                                    choices?: Array<{ delta?: { content?: string } }>;
                                    result?: {
                                        stats?: {
                                            tokens_per_second?: number;
                                            time_to_first_token_seconds?: number;
                                        };
                                    };
                                };
                                const eventType = currentEvent || data.type || '';

                                if (eventType === 'message.delta' && data.content) {
                                    fullContent += data.content;
                                    throttledContentUpdate.schedule(sanitizeAssistantContent(fullContent));
                                } else if (eventType === 'reasoning.delta' && data.content) {
                                    if (!reasoningStartTime) reasoningStartTime = Date.now();
                                    reasoning += data.content;
                                    updateAiMessage(targetSid, aiMsgId, { reasoning });
                                } else if (eventType === 'reasoning.end') {
                                    updateAiMessage(targetSid, aiMsgId, { reasoningTime: Date.now() - reasoningStartTime });
                                    setTimeout(() => updateAiMessage(targetSid, aiMsgId, { reasoningExpanded: false }), 2000);
                                } else if (eventType === 'chat.end') {
                                    const stats = data.result?.stats;
                                    if (stats) {
                                        updateAiMessage(targetSid, aiMsgId, {
                                            tokensPerSecond: stats.tokens_per_second,
                                            responseTime: (stats.time_to_first_token_seconds || 0) * 1000
                                        });
                                    }
                                }

                                const fallback = data.choices?.[0]?.delta?.content;
                                if (!eventType && fallback) {
                                    fullContent += fallback;
                                    throttledContentUpdate.schedule(sanitizeAssistantContent(fullContent));
                                }
                            } catch {
                                // Ignore malformed stream line.
                            }
                        }
                    }

                    throttledContentUpdate.flush();
                    finalize();
                } catch {
                    const perplexicaBase = resolvePerplexicaBase(config.perplexicaEndpoint);
                    setStreamingStatus('Direct fetch blocked. Switching to Beka Search...');
                    updateAiMessage(targetSid, aiMsgId, {
                        toolCalls: [{
                            id: toolId,
                            type: 'webpage_fetch',
                            status: 'running',
                            label: `Direct fetch blocked, trying Beka Search Engine for ${firstHost}`,
                            progress: 50,
                            startedAt: new Date().toISOString()
                        }]
                    });

                    const providersRes = await fetch(`${perplexicaBase}/api/providers`, { signal: createToolAbortController().signal });
                    if (!providersRes.ok) throw new Error(`Beka Search Engine providers failed (HTTP ${providersRes.status})`);
                    const providersData = await providersRes.json() as { providers?: PerplexicaProvider[] };
                    const providers = providersData.providers ?? [];

                    const chatMatch = (() => {
                        for (const provider of providers) {
                            const model = provider.chatModels?.find(m => m.key === resolvedToolModelId);
                            if (model) return { providerId: provider.id, key: model.key };
                        }
                        return null;
                    })();

                    const embeddingMatch = (() => {
                        for (const provider of providers) {
                            const firstModel = provider.embeddingModels?.[0];
                            if (firstModel) return { providerId: provider.id, key: firstModel.key };
                        }
                        return null;
                    })();

                    if (!chatMatch || !embeddingMatch) {
                        if (!chatMatch) {
                            throw new Error(`Beka Search Engine is missing configured tool model: ${resolvedToolModelId}`);
                        }
                        throw new Error('Beka Search Engine is missing embedding provider models.');
                    }

                    const searchResponse = await fetch(`${perplexicaBase}/api/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createToolAbortController().signal,
                        body: JSON.stringify({
                            chatModel: chatMatch,
                            embeddingModel: embeddingMatch,
                            optimizationMode: 'quality',
                            sources: ['web'],
                            query: `Use the exact webpage ${firstUrl} and answer this user request: ${effectiveContent}`,
                            history: messageHistoryForPerplexica(previousMessages, effectiveContent),
                            stream: true
                        })
                    });

                    if (!searchResponse.ok) throw new Error(`Beka Search Engine search failed (HTTP ${searchResponse.status})`);
                    const searchReader = searchResponse.body?.getReader();
                    if (!searchReader) throw new Error('No Beka Search Engine stream reader.');

                    const decoder = new TextDecoder();
                    let buffer = '';
                    let fullContent = '';
                    let collectedSources: WebSearchSource[] = [];

                    while (true) {
                        // Check if user stopped generation
                        if (generation.stopped) {
                            throw new Error('Generation stopped by user');
                        }

                        const { done, value } = await searchReader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;
                            const normalized = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
                            if (!normalized || normalized === '[DONE]') continue;
                            try {
                                const event = JSON.parse(normalized) as {
                                    type?: 'init' | 'sources' | 'response' | 'done';
                                    data?: string | PerplexicaSource[];
                                };

                                if (event.type === 'sources' && Array.isArray(event.data)) {
                                    collectedSources = sanitizeWebSources(
                                        event.data
                                            .map(toSourceFromPerplexica)
                                            .filter((src): src is WebSearchSource => src !== null)
                                    );
                                    if (collectedSources.length > 0) {
                                        updateAiMessage(targetSid, aiMsgId, {
                                            webSearchResult: {
                                                query: content,
                                                sources: collectedSources
                                            }
                                        });
                                    }
                                } else if (event.type === 'response' && typeof event.data === 'string') {
                                    fullContent += event.data;
                                }
                            } catch {
                                // Ignore malformed stream line.
                            }
                        }
                    }

                    const cleanedContent = sanitizeAssistantContent(fullContent);
                    if (!cleanedContent || collectedSources.length === 0 || SOURCE_ERROR_PATTERN.test(cleanedContent)) {
                        throw new Error('Beka Search Engine webpage fallback returned invalid sources/response.');
                    }

                    setStreamingStatus('Using tool call response to generate final answer...');

                    updateAiMessage(targetSid, aiMsgId, {
                        toolCalls: [{
                            id: toolId,
                            type: 'webpage_fetch',
                            status: 'done',
                            label: `Fetched ${firstHost} via Beka Search Engine`,
                            progress: 100,
                            duration: Date.now() - toolStart
                        }]
                    });

                    const synthesized = await synthesizeFromToolResult(cleanedContent, collectedSources, chatMatch.key);
                    const finalAnswer = synthesized || cleanedContent;
                    throttledContentUpdate.schedule(finalAnswer, true);
                    throttledContentUpdate.flush();
                    finalize({
                        modelName: availableModels.find(m => m.id === resolvedChatModelId)?.name || resolvedChatModelId,
                        content: finalAnswer,
                    });
                }
                return;
            }

            const canUsePerplexica = attachments.length === 0 && (finalSearchMode === 'web' || finalSearchMode === 'deep');
            if (canUsePerplexica) {
                const perplexicaBase = resolvePerplexicaBase(config.perplexicaEndpoint);
                const toolId = `tc-perplexica-${Date.now()}`;
                const toolType: ToolCall['type'] = finalSearchMode === 'deep' ? 'deep_search' : 'web_search';
                const toolLabel = finalSearchMode === 'deep' ? 'Beka is performing deep research on the internet... please wait...' : 'Beka is searching the web... please wait...';
                const toolStart = Date.now();

                updateAiMessage(targetSid, aiMsgId, {
                    toolCalls: [{
                        id: toolId,
                        type: toolType,
                        status: 'running',
                        label: toolLabel,
                        progress: 10,
                        startedAt: new Date().toISOString(),
                    }]
                });
                setStreamingStatus('Calling tool: Beka Search...');

                const providersRes = await fetch(`${perplexicaBase}/api/providers`, { signal: createToolAbortController().signal });
                if (!providersRes.ok) {
                    throw new Error(`Beka Search Engine providers failed (HTTP ${providersRes.status})`);
                }

                const providersData = await providersRes.json() as { providers?: PerplexicaProvider[] };
                const providers = providersData.providers ?? [];
                if (providers.length === 0) {
                    throw new Error('No Beka Search Engine providers available.');
                }

                const chatMatch = (() => {
                    for (const provider of providers) {
                        const model = provider.chatModels?.find(m => m.key === resolvedToolModelId);
                        if (model) return { providerId: provider.id, key: model.key };
                    }
                    return null;
                })();

                const embeddingMatch = (() => {
                    for (const provider of providers) {
                        const model = provider.embeddingModels?.find(m => m.key === resolvedEmbeddingModelId);
                        if (model) return { providerId: provider.id, key: model.key };
                    }

                    for (const provider of providers) {
                        const firstModel = provider.embeddingModels?.[0];
                        if (firstModel) return { providerId: provider.id, key: firstModel.key };
                    }
                    return null;
                })();

                if (!chatMatch || !embeddingMatch) {
                    if (!chatMatch) {
                        throw new Error(`Beka Search Engine is missing configured tool model: ${resolvedToolModelId}`);
                    }
                    throw new Error('Beka Search Engine is missing embedding provider models.');
                }

                const history = messageHistoryForPerplexica(previousMessages, effectiveContent);
                if (finalSearchMode === 'deep') {
                    const planTaskId = `dr-plan-${Date.now()}`;
                    const round1TaskId = `dr-round1-${Date.now()}`;
                    const round2TaskId = `dr-round2-${Date.now()}`;
                    const synthTaskId = `dr-synth-${Date.now()}`;

                    setDeepResearchDrawer({
                        isVisible: true,
                        currentStep: 'Planning deep research...',
                        tasks: [
                            { id: planTaskId, type: 'deep_search', status: 'running', label: 'Plan research strategy', progress: 10, startedAt: new Date().toISOString() },
                            { id: round1TaskId, type: 'deep_search', status: 'pending', label: 'Research round 1: landscape scan', progress: 0 },
                            { id: round2TaskId, type: 'deep_search', status: 'pending', label: 'Research round 2: verification pass', progress: 0 },
                            { id: synthTaskId, type: 'deep_search', status: 'pending', label: 'Synthesize final answer', progress: 0 },
                        ]
                    });

                    const runDeepSearchRound = async (query: string, taskId: string, roundLabel: string): Promise<{ content: string; sources: WebSearchSource[] }> => {
                        upsertDeepResearchTask({
                            id: taskId,
                            type: 'deep_search',
                            status: 'running',
                            label: roundLabel,
                            progress: 20,
                            startedAt: new Date().toISOString()
                        });
                        setDeepResearchStep(roundLabel);
                        setStreamingStatus(`Waiting for tool call response (${roundLabel})...`);

                        // Initialize streaming step
                        setDeepResearchStreamingStep({
                            id: taskId,
                            label: roundLabel,
                            thinking: undefined,
                            response: '',
                            isStreaming: true
                        });

                        const response = await fetch(`${perplexicaBase}/api/search`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signal: createToolAbortController().signal,
                            body: JSON.stringify({
                                chatModel: chatMatch,
                                embeddingModel: embeddingMatch,
                                optimizationMode: 'quality',
                                sources: ['web', 'academic', 'discussions'],
                                query,
                                history,
                                stream: true,
                            })
                        });

                        if (!response.ok) {
                            throw new Error(`Beka Search Engine deep search failed (HTTP ${response.status})`);
                        }

                        const reader = response.body?.getReader();
                        if (!reader) throw new Error('No Beka Search Engine stream reader.');

                        const decoder = new TextDecoder();
                        let buffer = '';
                        let fullContent = '';
                        let collectedSources: WebSearchSource[] = [];

                        while (true) {
                            // Check if user stopped generation
                            if (generation.stopped) {
                                throw new Error('Generation stopped by user');
                            }

                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed) continue;
                                const normalized = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
                                if (!normalized || normalized === '[DONE]') continue;

                                try {
                                    const event = JSON.parse(normalized) as {
                                        type?: 'init' | 'sources' | 'response' | 'done';
                                        data?: string | PerplexicaSource[];
                                    };

                                    if (event.type === 'sources' && Array.isArray(event.data)) {
                                        collectedSources = sanitizeWebSources(
                                            event.data
                                                .map(toSourceFromPerplexica)
                                                .filter((src): src is WebSearchSource => src !== null)
                                        );
                                        if (collectedSources.length > 0) {
                                            updateAiMessage(targetSid, aiMsgId, {
                                                webSearchResult: {
                                                    query: content,
                                                    sources: collectedSources,
                                                }
                                            });
                                        }
                                        upsertDeepResearchTask({
                                            id: taskId,
                                            type: 'deep_search',
                                            status: 'running',
                                            label: roundLabel,
                                            progress: 65
                                        });
                                    } else if (event.type === 'response' && typeof event.data === 'string') {
                                        fullContent += event.data;
                                        // Update streaming step with accumulated response
                                        setDeepResearchStreamingStep(prev => prev && {
                                            ...prev,
                                            response: fullContent,
                                            isStreaming: true
                                        });
                                    }
                                } catch {
                                    // Ignore malformed stream line.
                                }
                            }
                        }

                        const cleanedContent = sanitizeAssistantContent(fullContent);
                        if (!cleanedContent || collectedSources.length === 0 || SOURCE_ERROR_PATTERN.test(cleanedContent)) {
                            throw new Error(`${roundLabel} returned invalid/insufficient evidence.`);
                        }

                        upsertDeepResearchTask({
                            id: taskId,
                            type: 'deep_search',
                            status: 'done',
                            label: roundLabel,
                            progress: 100,
                            completedAt: new Date().toISOString()
                        });

                        // Mark streaming step as finished
                        setDeepResearchStreamingStep(prev => prev && {
                            ...prev,
                            response: cleanedContent,
                            isStreaming: false
                        });

                        return { content: cleanedContent, sources: collectedSources };
                    };

                    try {
                        setStreamingStatus('Planning multi-step deep research...');
                        
                        // Show planning phase in streaming panel
                        setDeepResearchStreamingStep({
                            id: planTaskId,
                            label: 'Planning deep research strategy...',
                            thinking: undefined,
                            response: 'Analyzing topic and generating search queries...',
                            isStreaming: true
                        });

                        const planningPrompt = `You are planning a deep research workflow.\nUser topic: ${effectiveContent}\nGenerate strict JSON with two complementary search queries:\n{"queries":["...","..."]}\nRules:\n- Query 1 broad landscape.\n- Query 2 verification/fact-check angle.\n- Keep each query concise and source-oriented.`;
                        let plannedQueries = [effectiveContent, `${effectiveContent} verify with official sources`];

                        const planningRes = await fetch(chatUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signal: createAbortController().signal,
                            body: JSON.stringify({
                                model: resolvedChatModelId || 'default',
                                input: planningPrompt,
                                stream: false
                            })
                        });

                        if (planningRes.ok) {
                            const planningData = await planningRes.json() as { output?: Array<{ content?: string }>; content?: string };
                            const raw = (planningData.output?.[0]?.content || planningData.content || '').trim();
                            const objMatch = raw.match(/\{[\s\S]*\}/);
                            const parsedRaw = objMatch ? objMatch[0] : raw;
                            try {
                                const parsed = JSON.parse(parsedRaw) as { queries?: string[] };
                                if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
                                    plannedQueries = parsed.queries.slice(0, 2).map(q => q.trim()).filter(Boolean);
                                    if (plannedQueries.length === 1) {
                                        plannedQueries.push(`${plannedQueries[0]} verify with official sources`);
                                    }
                                }
                            } catch {
                                // Keep fallback queries.
                            }
                        }

                        upsertDeepResearchTask({
                            id: planTaskId,
                            type: 'deep_search',
                            status: 'done',
                            label: 'Plan research strategy',
                            progress: 100,
                            completedAt: new Date().toISOString()
                        });

                        // Mark planning phase as done
                        setDeepResearchStreamingStep(prev => prev && prev.id === planTaskId ? {
                            ...prev,
                            response: `Queries planned:\n1. ${plannedQueries[0]}\n2. ${plannedQueries[1]}`,
                            isStreaming: false
                        } : prev);

                        const round1 = await runDeepSearchRound(plannedQueries[0] || effectiveContent, round1TaskId, 'Research round 1: landscape scan');
                        const round2 = await runDeepSearchRound(plannedQueries[1] || `${effectiveContent} verification`, round2TaskId, 'Research round 2: verification pass');

                        const mergedSourceMap = new Map<string, WebSearchSource>();
                        [...round1.sources, ...round2.sources].forEach(src => {
                            if (!mergedSourceMap.has(src.url)) mergedSourceMap.set(src.url, src);
                        });
                        const mergedSources = Array.from(mergedSourceMap.values());
                        const mergedContent = `${round1.content}\n\n${round2.content}`;

                        // Capture sources for export
                        setCurrentDeepResearchSources(mergedSources);

                        // Add findings to display
                        const newFindings: ResearchFinding[] = [
                            {
                                id: '1',
                                phase: 'Round 1',
                                title: 'Landscape Scan',
                                content: round1.content.slice(0, 150) + '...',
                                sourceCount: round1.sources.length,
                                confidence: 'high',
                                timestamp: Date.now()
                            },
                            {
                                id: '2',
                                phase: 'Round 2',
                                title: 'Verification Pass',
                                content: round2.content.slice(0, 150) + '...',
                                sourceCount: round2.sources.length,
                                confidence: 'high',
                                timestamp: Date.now() + 1000
                            }
                        ];
                        setResearchFindings(newFindings);

                        upsertDeepResearchTask({
                            id: synthTaskId,
                            type: 'deep_search',
                            status: 'running',
                            label: 'Synthesize final answer',
                            progress: 60,
                            startedAt: new Date().toISOString()
                        });
                        setDeepResearchStep('Using collected evidence to generate final answer...');
                        setStreamingStatus('Using tool call response to generate final answer...');

                        // Show synthesis phase in streaming panel
                        setDeepResearchStreamingStep({
                            id: synthTaskId,
                            label: 'Synthesizing final answer...',
                            thinking: 'Analyzing evidence from both rounds',
                            response: 'Generating comprehensive answer...',
                            isStreaming: true
                        });

                        const synthesized = await synthesizeFromToolResult(mergedContent, mergedSources, chatMatch.key);
                        const finalAnswer = synthesized || mergedContent;

                        // Mark synthesis as complete
                        setDeepResearchStreamingStep(prev => prev && prev.id === synthTaskId ? {
                            ...prev,
                            response: finalAnswer,
                            isStreaming: false
                        } : prev);

                        upsertDeepResearchTask({
                            id: synthTaskId,
                            type: 'deep_search',
                            status: 'done',
                            label: 'Synthesize final answer',
                            progress: 100,
                            completedAt: new Date().toISOString()
                        });
                        setDeepResearchStep('Deep research complete');

                        updateAiMessage(targetSid, aiMsgId, {
                            webSearchResult: {
                                query: content,
                                sources: mergedSources,
                            },
                            toolCalls: [{
                                id: toolId,
                                type: toolType,
                                status: 'done',
                                label: 'Deep research complete',
                                progress: 100,
                                duration: Date.now() - toolStart,
                            }]
                        });

                        throttledContentUpdate.schedule(finalAnswer, true);
                        throttledContentUpdate.flush();
                        finalize({
                            modelName: availableModels.find(m => m.id === resolvedChatModelId)?.name || resolvedChatModelId,
                            content: finalAnswer,
                        });
                        return;
                    } catch (deepResearchError) {
                        upsertDeepResearchTask({
                            id: synthTaskId,
                            type: 'deep_search',
                            status: 'error',
                            label: `Deep research failed: ${deepResearchError instanceof Error ? deepResearchError.message : 'Unknown error'}`,
                            progress: 100,
                            completedAt: new Date().toISOString()
                        });
                        setDeepResearchStep('Deep research failed');
                        // Update streaming step to show error
                        setDeepResearchStreamingStep(prev => prev ? {
                            ...prev,
                            response: `Error: ${deepResearchError instanceof Error ? deepResearchError.message : 'Unknown error'}`,
                            isStreaming: false
                        } : null);
                        throw deepResearchError;
                    }
                }

                const attemptPlans: Array<{ mode: SearchMode; query: string; label: string }> = (() => {
                    const constrainedQuery = `${effectiveContent}\n\nReturn only verified, directly usable source URLs. Exclude any URL/source that failed to fetch.`;
                    return [
                        { mode: 'web', query: effectiveContent, label: 'web' },
                        { mode: 'deep', query: effectiveContent, label: 'deep fallback' },
                        { mode: 'deep', query: constrainedQuery, label: 'deep constrained retry' },
                    ];
                })();

                let finalContent = '';
                let finalSources: WebSearchSource[] = [];
                let lastFailureReason = 'No valid response received from Beka Search Engine.';

                for (let attemptIndex = 0; attemptIndex < attemptPlans.length; attemptIndex++) {
                    const attempt = attemptPlans[attemptIndex]!;
                    const attemptNo = attemptIndex + 1;
                    const isDeepAttempt = attempt.mode === 'deep';
                    const attemptSources = isDeepAttempt ? ['web', 'academic', 'discussions'] : ['web'];
                    const attemptOptimizationMode = isDeepAttempt ? 'quality' : 'speed';

                    upsertToolCall(targetSid, aiMsgId, {
                        id: toolId,
                        type: toolType,
                        status: 'running',
                        label: `${toolLabel} (attempt ${attemptNo}/${attemptPlans.length}: ${attempt.label})`,
                        progress: Math.min(20 + attemptIndex * 20, 75)
                    });
                    setStreamingStatus(`Waiting for tool call response (attempt ${attemptNo}/${attemptPlans.length})...`);

                    const response = await fetch(`${perplexicaBase}/api/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createToolAbortController().signal,
                        body: JSON.stringify({
                            chatModel: chatMatch,
                            embeddingModel: embeddingMatch,
                            optimizationMode: attemptOptimizationMode,
                            sources: attemptSources,
                            query: attempt.query,
                            history,
                            stream: true,
                        })
                    });

                    if (!response.ok) {
                        lastFailureReason = `Beka Search Engine search failed (HTTP ${response.status})`;
                        continue;
                    }

                    const reader = response.body?.getReader();
                    if (!reader) {
                        lastFailureReason = 'No Beka Search Engine stream reader.';
                        continue;
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';
                    let fullContent = '';
                    let collectedSources: WebSearchSource[] = [];

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;

                            const normalized = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
                            if (!normalized || normalized === '[DONE]') continue;

                            try {
                                const event = JSON.parse(normalized) as {
                                    type?: 'init' | 'sources' | 'response' | 'done';
                                    data?: string | PerplexicaSource[];
                                };

                                if (event.type === 'sources' && Array.isArray(event.data)) {
                                    upsertToolCall(targetSid, aiMsgId, {
                                        id: toolId,
                                        type: toolType,
                                        status: 'running',
                                        label: `${toolLabel} (attempt ${attemptNo}/${attemptPlans.length})`,
                                        progress: 60
                                    });
                                    collectedSources = sanitizeWebSources(
                                        event.data
                                            .map(toSourceFromPerplexica)
                                            .filter((src): src is WebSearchSource => src !== null)
                                    );

                                    if (collectedSources.length > 0) {
                                        updateAiMessage(targetSid, aiMsgId, {
                                            webSearchResult: {
                                                query: content,
                                                sources: collectedSources,
                                            }
                                        });
                                    }
                            } else if (event.type === 'response' && typeof event.data === 'string') {
                                fullContent += event.data;
                            }
                        } catch {
                            // Ignore malformed stream line.
                            }
                        }
                    }

                    const cleanedContent = sanitizeAssistantContent(fullContent);
                    const contentLooksInvalid = !cleanedContent || SOURCE_ERROR_PATTERN.test(cleanedContent);
                    const hasValidSources = collectedSources.length > 0;
                    const isValidAttempt = !contentLooksInvalid && hasValidSources;

                    if (isValidAttempt) {
                        finalContent = cleanedContent;
                        finalSources = collectedSources;
                        break;
                    }

                    lastFailureReason = contentLooksInvalid
                        ? 'Search response was invalid or contained fetch errors.'
                        : 'Search response had no valid sources.';
                }

                if (!finalContent || finalSources.length === 0) {
                    throw new Error(`Beka Search Engine retries exhausted: ${lastFailureReason}`);
                }

                setStreamingStatus('Using tool call response to generate final answer...');

                updateAiMessage(targetSid, aiMsgId, {
                    webSearchResult: {
                        query: content,
                        sources: finalSources,
                    },
                    toolCalls: [{
                        id: toolId,
                        type: toolType,
                        status: 'done',
                        label: `${toolLabel} complete`,
                        progress: 100,
                        duration: Date.now() - toolStart,
                    }]
                });

                const synthesized = await synthesizeFromToolResult(finalContent, finalSources, chatMatch.key);
                const finalAnswer = synthesized || finalContent;
                throttledContentUpdate.schedule(finalAnswer, true);
                throttledContentUpdate.flush();
                finalize({
                    modelName: availableModels.find(m => m.id === resolvedChatModelId)?.name || resolvedChatModelId,
                    content: finalAnswer,
                });
                return;
            }

            const lastAiMsg = previousMessages.filter(m => m.role === 'assistant').pop();
            const previous_response_id = (lastAiMsg as Message & { lmResponseId?: string })?.lmResponseId;

            const hasImages = attachments.some(a => a.type === 'image');
            const imageCount = attachments.filter(a => a.type === 'image').length;
            const hasTextDocs = attachments.some(a => a.type === 'text' || a.type === 'pdf');
            const textDocCount = attachments.filter(a => a.type === 'text' || a.type === 'pdf').length;
            const textDocNames = attachments.filter(a => a.type === 'text' || a.type === 'pdf').map(a => a.name).join(', ');
            
            const toolSystemInst = `
You must preserve conversational context across turns.
If the user says "that link", "that page", "this URL", or similar, resolve it from recent chat context before asking again.
If one clear recent URL exists, use it directly and mention which URL you assumed.
If multiple plausible URLs exist, ask a short clarification listing candidates.
Never ask the user to resend a link when a usable one already exists in recent context.
${hasImages ? `IMPORTANT: The user has uploaded ${imageCount} image${imageCount > 1 ? 's' : ''}. You must use the vision analysis tool to examine ${imageCount > 1 ? 'them' : 'it'}.` : ''}
${hasTextDocs ? `IMPORTANT: The user has uploaded ${textDocCount} text document${textDocCount > 1 ? 's' : ''} (${textDocNames}). The document content is already available to you - analyze it directly based on the user's request.` : ''}
You have access to a tool 'analyze_image(prompt)'. 
If you need to analyze an image, respond with ONLY: TOOL_CALL: analyze_image("your prompt here")

IMPORTANT: Do not overthink. Provide direct, concise answers. Avoid excessive elaboration or circular reasoning. When you have enough information, respond immediately without dwelling on edge cases or uncertainties.
`.trim();

            // Prepare input with text documents content if present
            let inputContent = effectiveContent;
            if (hasTextDocs) {
                const textDocs = attachments.filter(a => (a.type === 'text' || a.type === 'pdf') && a.textContent);
                if (textDocs.length > 0) {
                    // Show document analysis tool call
                    const docToolId = `tc-doc-${Date.now()}`;
                    updateAiMessage(targetSid, aiMsgId, {
                        toolCalls: [{
                            id: docToolId,
                            type: 'document_analysis',
                            status: 'running',
                            label: `Analyzing ${textDocs.length} document${textDocs.length > 1 ? 's' : ''}`,
                            progress: 50,
                            startedAt: new Date().toISOString()
                        }]
                    });
                    
                    const docsContext = textDocs.map(doc => 
                        `--- Document: ${doc.name} ---\n${doc.textContent}\n--- End of ${doc.name} ---`
                    ).join('\n\n');
                    inputContent = `${effectiveContent}\n\n${docsContext}`;
                    
                    // Mark as done after brief delay
                    setTimeout(() => {
                        updateAiMessage(targetSid, aiMsgId, {
                            toolCalls: [{
                                id: docToolId,
                                type: 'document_analysis',
                                status: 'done',
                                label: `Document${textDocs.length > 1 ? 's' : ''} processed`,
                                progress: 100,
                                duration: 300
                            }]
                        });
                    }, 300);
                }
            }

            // If LM response chaining is unavailable (e.g., previous turn came from external tool),
            // prepend recent conversation so the main model still has context continuity.
            if (!previous_response_id) {
                const contextPrefix = buildConversationContextForMainModel(previousMessages);
                if (contextPrefix) {
                    inputContent = `${contextPrefix}\n${inputContent}`;
                }
            }

            const body: {
                model: string;
                input: string | Array<{ type: 'text' | 'image'; content?: string; data_url?: string }>;
                stream: boolean;
                system_prompt: string;
                reasoning?: 'low' | 'medium' | 'high';
                previous_response_id?: string;
                temperature?: number;
                top_p?: number;
                top_k?: number;
                min_p?: number;
                repeat_penalty?: number;
            } = {
                model: resolvedChatModelId || 'default',
                input: inputContent,
                stream: true,
                system_prompt: toolSystemInst,
                reasoning: config.reasoningLevel && config.reasoningLevel !== 'off' ? config.reasoningLevel : undefined,
            };

            // Add Qwen sampling parameters for thinking mode (normal chat)
            if (isQwenModel(resolvedChatModelId)) {
                const qwenParams = getQwenSamplingParams(false); // false = thinking mode
                Object.assign(body, qwenParams);
            }

            setStreamingStatus('Generating response...');

            if (previous_response_id) body.previous_response_id = previous_response_id;
            
            // Only send images directly if the chat model supports vision
            const chatModel = availableModels.find(m => m.id === resolvedChatModelId);
            const chatModelSupportsVision = chatModel?.capabilities.includes('vision');
            
            if (attachments.some(a => a.type === 'image') && chatModelSupportsVision) {
                const inputArray: Array<{ type: 'text' | 'image'; content?: string; data_url?: string }> = [
                    { type: 'text', content: inputContent }
                ];
                attachments.forEach(a => {
                    if (a.type === 'image' && a.dataUrl) {
                        inputArray.push({ type: 'image', data_url: a.dataUrl });
                    }
                });
                body.input = inputArray;
            }

            if (body.reasoning && localStorage.getItem(`no-reasoning-${body.model}`)) {
                delete body.reasoning;
            }

            let response = await fetch(chatUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: createAbortController().signal,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                let errorData: { error?: { param?: string; message?: string } } | null = null;
                try {
                    errorData = await response.json();
                } catch {
                    // ignore
                }

                const shouldRetryWithoutPreviousResponse =
                    response.status === 400 &&
                    Boolean(body.previous_response_id) &&
                    (
                        errorData?.error?.param === 'previous_response_id' ||
                        errorData?.error?.message?.includes('previous_response_id') ||
                        errorData?.error?.message?.includes('previous response')
                    );

                if (shouldRetryWithoutPreviousResponse) {
                    delete body.previous_response_id;
                    response = await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
                        body: JSON.stringify(body)
                    });

                    if (!response.ok) {
                        try { errorData = await response.json(); } catch { errorData = null; }
                        throw new Error(`HTTP ${response.status}: ${errorData ? JSON.stringify(errorData) : 'Bad Request'}`);
                    }
                }

                // If we get an error about unsupported reasoning, retry without it
                if (!response.ok && response.status === 400 && body.reasoning && (errorData?.error?.param === 'reasoning' || errorData?.error?.message?.includes('reasoning'))) {
                    localStorage.setItem(`no-reasoning-${body.model}`, 'true');
                    delete body.reasoning;
                    response = await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
                        body: JSON.stringify(body)
                    });

                    if (!response.ok) {
                        try { errorData = await response.json(); } catch { errorData = null; }
                        throw new Error(`HTTP ${response.status}: ${errorData ? JSON.stringify(errorData) : 'Bad Request'}`);
                    }
                } else if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${errorData ? JSON.stringify(errorData) : 'Bad Request'}`);
                }
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No reader');

            let fullContent = '';
            let reasoning = '';
            let toolCall: { id: string; name: string; arguments: string; startedAt?: string } | null = null;
            let currentEvent = '';
            let lastLmResponseId = '';
            const decoder = new TextDecoder();
            let buffer = '';
            let reasoningStartTime = 0;

            const cleanContent = (text: string) => sanitizeAssistantContent(text);

            updateAiMessage(targetSid, aiMsgId, { reasoningExpanded: true });

            while (true) {
                // Check if user stopped generation
                if (generation.stopped) {
                    throw new Error('Generation stopped by user');
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    if (trimmed.startsWith('event: ')) {
                        currentEvent = trimmed.slice(7).trim();
                    } else if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.slice(6).trim();
                        if (dataStr === '[DONE]') continue;
                        try {
                            const data = JSON.parse(dataStr) as {
                                type?: string;
                                content?: string;
                                tool?: string;
                                arguments?: unknown;
                                reason?: string;
                                result?: {
                                    response_id?: string;
                                    stats?: {
                                        tokens_per_second?: number;
                                        time_to_first_token_seconds?: number;
                                    };
                                };
                                choices?: Array<{ delta?: { content?: string } }>;
                            };
                            const eventType = currentEvent || data.type || '';
                            const toolName = data.tool || 'tool';
                            const toolId = `tc-lm-${toolName}`;
                            const toolType: ToolCall['type'] = toolName === 'analyze_image' ? 'vision_analysis' : 'web_search';

                            if (eventType === 'tool_call.start') {
                                setStreamingStatus('Calling tool...');
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'running',
                                    label: `${toolName} started`,
                                    progress: 15,
                                    startedAt: new Date().toISOString()
                                });
                            } else if (eventType === 'tool_call.arguments') {
                                setStreamingStatus('Waiting for tool call response...');
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'running',
                                    label: `${toolName} running`,
                                    progress: 60
                                });
                            } else if (eventType === 'tool_call.success') {
                                setStreamingStatus('Using tool call response to generate final answer...');
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'done',
                                    label: `${toolName} complete`,
                                    progress: 100
                                });
                            } else if (eventType === 'tool_call.failure') {
                                setStreamingStatus('Tool call failed. Preparing error response...');
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'error',
                                    label: `${toolName} failed${data.reason ? `: ${data.reason}` : ''}`,
                                    progress: 100
                                });
                            }

                            if (eventType === 'message.delta') {
                                fullContent += data.content || '';
                                throttledContentUpdate.schedule(cleanContent(fullContent));

                                if (!toolCall && (fullContent.includes('TOOL_CALL: analyze_image') || fullContent.includes('analyze_image'))) {
                                    const tc: ToolCall = {
                                        id: `tc-manual-${Date.now()}`,
                                        type: 'vision_analysis',
                                        status: 'running',
                                        label: 'Vision analysis initiated...',
                                        progress: 20,
                                        startedAt: new Date().toISOString()
                                    };
                                    updateAiMessage(targetSid, aiMsgId, { toolCalls: [tc] });
                                    toolCall = { ...tc, name: 'analyze_image', arguments: '' };
                                }
                            } else if (eventType === 'reasoning.delta') {
                                if (!reasoningStartTime) reasoningStartTime = Date.now();
                                reasoning += data.content || '';
                                updateAiMessage(targetSid, aiMsgId, { reasoning });
                            } else if (eventType === 'reasoning.end') {
                                const rt = Date.now() - reasoningStartTime;
                                updateAiMessage(targetSid, aiMsgId, { reasoningTime: rt });
                                setTimeout(() => updateAiMessage(targetSid, aiMsgId, { reasoningExpanded: false }), 2000);
                            } else if (eventType === 'tool_call.arguments') {
                                if (!toolCall) toolCall = { id: `tc-${Date.now()}`, name: data.tool || 'analyze_image', arguments: '' };
                                if (data.arguments) {
                                    const part = typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments);
                                    toolCall.arguments += part;
                                }
                                const tc: ToolCall = {
                                    id: toolCall.id,
                                    type: 'vision_analysis',
                                    status: 'running',
                                    label: 'Vision analysis initiated...',
                                    progress: 60,
                                    startedAt: new Date().toISOString()
                                };
                                updateAiMessage(targetSid, aiMsgId, { toolCalls: [tc] });
                            } else if (eventType === 'chat.end') {
                                lastLmResponseId = data.result?.response_id || '';
                                const stats = data.result?.stats;
                                if (stats) {
                                    updateAiMessage(targetSid, aiMsgId, {
                                        tokensPerSecond: stats.tokens_per_second,
                                        responseTime: (stats.time_to_first_token_seconds || 0) * 1000
                                    });
                                }
                            }

                            if (!eventType && data.choices?.[0]?.delta?.content) {
                                fullContent += data.choices[0].delta.content;
                                throttledContentUpdate.schedule(cleanContent(fullContent));
                            }
                        } catch {
                            // Ignore malformed stream line.
                        }
                    }
                }
            }

            if (lastLmResponseId) updateAiMessage(targetSid, aiMsgId, { lmResponseId: lastLmResponseId });

            if (!toolCall) {
                const extracted = extractToolCallFromContent(fullContent);
                if (extracted) {
                    toolCall = {
                        id: `tc-manual-${Date.now()}`,
                        name: 'analyze_image',
                        arguments: JSON.stringify({ prompt: extracted.prompt }),
                        startedAt: new Date().toISOString()
                    };
                }
            }

            if (toolCall && toolCall.name === 'analyze_image') {
                let toolArgs: { prompt: string } = { prompt: '' };
                try {
                    toolArgs = JSON.parse(toolCall.arguments) as { prompt: string };
                } catch {
                    // Keep default tool args.
                }

                const imgs = attachments.filter(a => a.type === 'image');
                if (imgs.length > 0) {
                    const vRes = await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
                        body: JSON.stringify({
                            model: resolvedVisionModelId,
                            input: [
                                { type: 'text', content: toolArgs.prompt || 'Describe this image' },
                                ...imgs.map(img => ({ type: 'image', data_url: img.dataUrl || img.url }))
                            ],
                            stream: false
                        })
                    });

                    if (vRes.ok) {
                        const vData = await vRes.json() as { output?: Array<{ content?: string }> };
                        const vText = vData.output?.[0]?.content || 'Vision analysis completed.';
                        const fRes = await fetch(chatUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signal: createAbortController().signal,
                            body: JSON.stringify({
                                model: resolvedChatModelId,
                                input: `Vision tool result: ${vText}\n\nPlease summarize this for the user.`,
                                previous_response_id: lastLmResponseId || undefined,
                                stream: true
                            })
                        });

                        const fReader = fRes.body?.getReader();
                        if (fReader) {
                            let fContent = cleanContent(fullContent) + '\n\n';
                            const dur = toolCall.startedAt ? (Date.now() - new Date(toolCall.startedAt).getTime()) : undefined;
                            updateAiMessage(targetSid, aiMsgId, {
                                toolCalls: [{
                                    id: toolCall.id,
                                    type: 'vision_analysis',
                                    status: 'done',
                                    label: 'Vision analysis complete',
                                    progress: 100,
                                    duration: dur
                                }]
                            });

                            let fEvent = '';
                            let fBuffer = '';
                            while (true) {
                                // Check if user stopped generation
                                if (generation.stopped) {
                                    throw new Error('Generation stopped by user');
                                }

                                const { done, value } = await fReader.read();
                                if (done) break;
                                fBuffer += decoder.decode(value, { stream: true });
                                const fLines = fBuffer.split('\n');
                                fBuffer = fLines.pop() || '';
                                for (const fl of fLines) {
                                    const ft = fl.trim();
                                    if (ft.startsWith('event: ')) fEvent = ft.slice(7).trim();
                                    else if (ft.startsWith('data: ')) {
                                        const ds = ft.slice(6);
                                        if (ds === '[DONE]') continue;
                                        try {
                                            const d = JSON.parse(ds) as { content?: string; choices?: Array<{ delta?: { content?: string } }> };
                                            const cont = fEvent === 'message.delta' ? d.content : d.choices?.[0]?.delta?.content;
                                            if (cont) {
                                                fContent += cont;
                                                throttledContentUpdate.schedule(sanitizeAssistantContent(fContent));
                                            }
                                        } catch {
                                            // Ignore malformed stream line.
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            throttledContentUpdate.flush();
            finalize();
        } catch (error) {
            throttledContentUpdate.cancel();
            if (generation.stopped) {
                if (activeGenerationRef.current === generation) {
                    activeGenerationRef.current = null;
                }
                clearAbortTimeouts();
                generation.controllers.clear();
                return;
            }
            const isAbort = isAbortedError(error);
            const errorMessage = isAbort
                ? (timeoutTriggered ? 'Operation timed out and was canceled' : 'Operation was canceled')
                : (error instanceof Error ? error.message : 'Unknown error');

            setSessions((prev: ChatSession[]) => prev.map(s => {
                if (s.id !== targetSid) return s;
                return {
                    ...s,
                    messages: s.messages.map(m => {
                        if (m.id !== aiMsgId) return m;

                        const nextToolCalls = m.toolCalls?.map(tc => (
                            tc.status === 'running' || tc.status === 'pending'
                                ? {
                                    ...tc,
                                    status: 'error' as const,
                                    progress: 100,
                                    label: tc.label.includes('failed') ? tc.label : `${tc.label} failed`,
                                    completedAt: new Date().toISOString(),
                                    duration: tc.startedAt
                                        ? Math.max(0, Date.now() - new Date(tc.startedAt).getTime())
                                        : tc.duration
                                }
                                : tc
                        ));

                        return {
                            ...m,
                            content: `Error: ${errorMessage}.`,
                            isStreaming: false,
                            statusText: undefined,
                            toolCalls: nextToolCalls
                        };
                    })
                };
            }));

            setDeepResearchDrawer(prev => {
                const hasActive = prev.tasks.some(t => t.status === 'running' || t.status === 'pending');
                if (!hasActive) return prev;
                return {
                    ...prev,
                    currentStep: `Failed: ${errorMessage}`,
                    tasks: prev.tasks.map(t =>
                        (t.status === 'running' || t.status === 'pending')
                            ? {
                                ...t,
                                status: 'error',
                                progress: 100,
                                label: t.label.includes('failed') ? t.label : `${t.label} failed`,
                                completedAt: new Date().toISOString()
                            }
                            : t
                    )
                };
            });

            if (activeGenerationRef.current === generation) {
                activeGenerationRef.current = null;
            }
            clearAbortTimeouts();
            generation.controllers.clear();
        }
    };

    const handleToggleReasoning = (msgId: string) => {
        const m = activeSession?.messages.find(msg => msg.id === msgId);
        if (m && activeSessionId) updateAiMessage(activeSessionId, msgId, { reasoningExpanded: !m.reasoningExpanded });
    };

    const handleDeleteMessage = (msgId: string) => {
        if (!activeSession || !activeSessionId) return;
        handleStopGeneration();

        const idx = activeSession.messages.findIndex(m => m.id === msgId);
        if (idx === -1) return;
        const keptMessages = activeSession.messages.slice(0, idx);

        setSessions((prev: ChatSession[]) => prev.map(s => {
            if (s.id !== activeSessionId) return s;
            const last = keptMessages[keptMessages.length - 1];
            return {
                ...s,
                messages: keptMessages,
                hasAttachments: keptMessages.some(m => (m.attachments?.length || 0) > 0),
                updatedAt: new Date().toISOString(),
                preview: last?.content?.slice(0, 60) || '',
            };
        }));
    };

    const handleEditMessage = (msgId: string, newContent: string) => {
        if (!activeSession || !activeSessionId) return;
        handleStopGeneration();

        const idx = activeSession.messages.findIndex(m => m.id === msgId && m.role === 'user');
        if (idx === -1) return;
        const original = activeSession.messages[idx];
        const baseMessages = activeSession.messages.slice(0, idx);
        const searchMode: SearchMode = original.searchMode || activeSession.searchMode || 'none';
        handleSend(newContent, original.attachments || [], searchMode, activeSessionId, baseMessages);
    };

    const handleSelectSuggestion = (msgId: string, suggestion: MessageActionSuggestion) => {
        if (!activeSession || !activeSessionId) return;
        handleStopGeneration();

        let baseMessages = activeSession.messages;
        const isPrompt = suggestion.type === 'prompt';

        if (msgId) {
            const idx = activeSession.messages.findIndex(m => m.id === msgId);
            if (idx !== -1) {
                if (!isPrompt) {
                    baseMessages = activeSession.messages.slice(0, idx);
                } else {
                    baseMessages = activeSession.messages.slice(0, idx + 1);
                }
            }
        }

        handleSend(
            suggestion.query,
            [],
            suggestion.searchMode,
            activeSessionId,
            baseMessages,
            {
                skipUserMessage: !isPrompt,
                forceSearchMode: suggestion.searchMode,
                bypassPrompt: true
            }
        );
    };

    const isGenerating = !!activeSession?.messages.some(msg => msg.role === 'assistant' && msg.isStreaming);

    return (
        <main className="bk-chat-page">
            {activeSession && activeSession.messages.length > 0 ? (
                <MessageList
                    messages={activeSession.messages}
                    onToggleReasoning={handleToggleReasoning}
                    onImageClick={(src) => setFullImage(src)}
                    onDeleteMessage={handleDeleteMessage}
                    onEditMessage={handleEditMessage}
                    onSelectSuggestion={handleSelectSuggestion}
                />
            ) : (
                <WelcomeScreen onSend={handleSend} />
            )}

            <ThinkingIndicator 
                isThinking={isThinkingVisible && deepResearchDrawer.isVisible && deepResearchDrawer.tasks.some(t => t.status === 'running')}
                label="Model is analyzing research findings..."
            />

            <ResearchFindingsPanel 
                findings={researchFindings}
                isVisible={researchFindings.length > 0}
            />

            <ModelThinkingPanel 
                thinkingContent={modelThinkingSteps}
                isVisible={isThinkingVisible && modelThinkingSteps.length > 0}
                currentStepId={deepResearchDrawer.currentStep}
            />
            
            <ChatInput
                onSend={handleSend}
                onStop={handleStopGeneration}
                onClear={handleClearChat}
                onCopySessionMarkdown={handleCopySessionMarkdown}
                isGenerating={isGenerating}
                messages={activeSession?.messages || []}
                promptSuggestions={promptSuggestions}
                autoSearchHint={autoSearchHint}
                isSessionCopied={isSessionCopied}
                onSelectSuggestion={(suggestion: MessageActionSuggestion) => handleSelectSuggestion('', suggestion)}
            />

            <TaskDrawer
                tasks={deepResearchDrawer.tasks}
                isVisible={deepResearchDrawer.isVisible}
                title="Deep Research"
                currentStep={deepResearchDrawer.currentStep}
                onClose={resetDeepResearchDrawer}
                onExport={handleExportResearchTrace}
            />

            <DeepResearchStreamingPanel
                currentStep={deepResearchStreamingStep}
                isVisible={deepResearchDrawer.isVisible && !!deepResearchStreamingStep}
            />

            <DeepResearchQuestionsModal
                isOpen={deepResearchQuestionsOpen}
                onClose={() => {
                    setDeepResearchQuestionsOpen(false);
                    setPendingDeepResearchTopic('');
                }}
                onSubmit={handleDeepResearchQuestionsSubmit}
                questions={deepResearchQuestions}
                isLoading={isGeneratingQuestions}
            />

            {isAutoLoading && (
                <div className="bk-chat-page__loading-overlay">
                    <div className="bk-chat-page__loading-content">
                        <Spinner size="lg" />
                        <div className="bk-chat-page__loading-text">
                            <h3>Initializing AI Models</h3>
                            <p>Waking up the local models, please wait...</p>
                        </div>
                    </div>
                </div>
            )}

            {fullImage && (
                <ImageModal
                    src={fullImage}
                    onClose={() => setFullImage(null)}
                />
            )}

            {contextNotification && (
                <ContextNotification
                    message={contextNotification.message}
                    onDismiss={() => setContextNotification(null)}
                />
            )}
        </main>
    );
}
