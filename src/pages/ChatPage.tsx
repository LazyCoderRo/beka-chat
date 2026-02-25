import { useRef, useState } from 'react';
import './ChatPage.css';
import { useSession } from '../context/SessionContext';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { WelcomeScreen } from '../components/chat/WelcomeScreen';
import { ContextNotification } from '../components/chat/ContextNotification';
import { useAIConfig } from '../context/AIConfigContext';
import { ImageModal } from '../components/shared/ImageModal';
import { Spinner } from '../components/shared/Spinner';
import { archiveMessagesWithSummary, calculateContextTokens, getContextMessagesForAPI } from '../utils/contextManager';
import { getSmartRecommendations, recommendationsToActionSuggestions, generateNextPromptSuggestionsWithModel } from '../utils/smartRecommendations';
import type { FileAttachment, SearchMode, ChatSession, Message, ToolCall, WebSearchSource, MessageActionSuggestion } from '../types';

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

interface SearchDecision {
    mode: 'none' | 'webpage' | 'web' | 'deep';
    shouldPrompt: boolean;
    promptText?: string;
    suggestions?: MessageActionSuggestion[];
}

const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*)/gi;

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
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
    const normalized = url.trim();
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
}

function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX) ?? [];
    const normalized = matches.map(normalizeUrl);
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

    if (requestedMode !== 'none') {
        return { mode: 'none', shouldPrompt: false };
    }

    if (maybeBenefitsFromWebSearch(content)) {
        return {
            mode: 'none',
            shouldPrompt: true,
            promptText: 'I can continue directly or look this up online. Pick the next step:',
            suggestions: [
                { id: `act-web-${Date.now()}`, label: 'Search Web', description: 'Quick online lookup for current data.', query: content, searchMode: 'web' },
                { id: `act-deep-${Date.now()}`, label: 'Deep Search', description: 'Broader web research with richer context.', query: content, searchMode: 'deep' },
                { id: `act-no-web-${Date.now()}`, label: 'No Web', description: 'Continue only from model knowledge/context.', query: content, searchMode: 'none' },
            ]
        };
    }

    return { mode: 'none', shouldPrompt: false };
}

function toSourceFromPerplexica(source: PerplexicaSource): WebSearchSource | null {
    const url = source.metadata?.url;
    if (!url) return null;
    return {
        title: source.metadata?.title || url,
        url,
        content: source.content || ''
    };
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

export function ChatPage() {
    const { activeSession, setSessions, activeSessionId, createNewSession } = useSession();
    const { config, availableModels, loadModel } = useAIConfig();
    const [fullImage, setFullImage] = useState<string | null>(null);
    const [contextNotification, setContextNotification] = useState<{ message: string } | null>(null);
    const [promptSuggestions, setPromptSuggestions] = useState<MessageActionSuggestion[]>([]);
    const [isAutoLoading, setIsAutoLoading] = useState(false);
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
                        toolCalls: m.toolCalls?.map(tc =>
                            tc.status === 'running' || tc.status === 'pending'
                                ? { ...tc, status: 'error', label: 'Stopped by user' }
                                : tc
                        )
                    };
                })
            };
        }));
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

    /**
     * Create and track a context summarization tool call
     */
    const triggerContextSummarization = async (
        messages: Message[],
        sessionId: string,
        selectedModel: { maxContextLength?: number } | undefined
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
            const baseUrl = config.lmStudioEndpoint;

            const response = await fetch(`${baseUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.defaultChatModelId,
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
        selectedModel: { maxContextLength?: number } | undefined
    ) => {
        void triggerContextSummarization(messages, sessionId, selectedModel);
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
        const loadedModels = availableModels.filter(m => m.isLoaded);
        if (loadedModels.length === 0) {
            setIsAutoLoading(true);
            try {
                // Check which models need to be loaded
                const defaultChat = availableModels.find(m => m.id === config.defaultChatModelId && !m.isLoaded);
                const defaultVision = availableModels.find(m => m.id === config.defaultVisionModelId && !m.isLoaded);
                const defaultToolCall = availableModels.find(m => m.id === config.defaultToolCallingModelId && !m.isLoaded);

                // Load them in parallel with skip refresh, then refresh once at the end
                const idleMinutes = config.defaultIdleTimeMinutes || 60;
                const modelsToLoad = [];
                if (defaultChat) {
                    modelsToLoad.push(
                        loadModel(defaultChat.id, {
                            contextWindow: 64000,
                            idleTimeMinutes: idleMinutes,
                            skipRefresh: true
                        })
                    );
                }
                if (defaultVision) {
                    modelsToLoad.push(
                        loadModel(defaultVision.id, {
                            contextWindow: 8000,
                            idleTimeMinutes: idleMinutes,
                            skipRefresh: true
                        })
                    );
                }
                if (defaultToolCall) {
                    modelsToLoad.push(
                        loadModel(defaultToolCall.id, {
                            contextWindow: 3000,
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
        const strategy = decideSearchStrategy(effectiveContent, previousMessages, searchMode);
        const finalSearchMode: SearchMode = options?.forceSearchMode
            || (strategy.mode === 'web' || strategy.mode === 'deep' ? strategy.mode : 'none');

        // Create user message
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
            attachments,
            searchMode: finalSearchMode,
            createdAt: new Date().toISOString(),
        };

        // Calculate what messages will be after adding user message
        const futureMessages = includeUserMessage ? [...previousMessages, userMsg] : previousMessages;

        // Check and handle context summarization BEFORE adding AI response
        const selectedModel = availableModels.find(m => m.id === config.defaultChatModelId);
        handleContextSummarization(futureMessages, targetSid, selectedModel);

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

            setSessions((prev: ChatSession[]) => prev.map(s => {
                if (s.id !== targetSid) return s;
                const baseMessages = forcedBaseMessages ?? s.messages;
                const messages = [...baseMessages, userMsg, recommendationMsg];
                const last = messages[messages.length - 1];
                return {
                    ...s,
                    messages,
                    hasAttachments: messages.some(m => (m.attachments?.length || 0) > 0),
                    updatedAt: new Date().toISOString(),
                    preview: last?.content?.slice(0, 60) || '',
                    title: baseMessages.length === 0 ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : s.title
                };
            }));
            return;
        }

        const aiMsgId = (Date.now() + 1).toString();
        const aiMsg: Message = {
            id: aiMsgId,
            role: 'assistant',
            content: '',
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

        setSessions((prev: ChatSession[]) => prev.map(s => {
            if (s.id === targetSid) {
                const baseMessages = forcedBaseMessages ?? s.messages;
                const usedSearchModes = s.usedSearchModes ? [...s.usedSearchModes] : [];
                if (finalSearchMode !== 'none' && !usedSearchModes.includes(finalSearchMode)) {
                    usedSearchModes.push(finalSearchMode);
                }
                const appended = includeUserMessage ? [userMsg, aiMsg] : [aiMsg];
                const messages = [...baseMessages, ...appended];
                return {
                    ...s,
                    messages,
                    searchMode: finalSearchMode !== 'none' ? finalSearchMode : s.searchMode,
                    usedSearchModes,
                    hasAttachments: messages.some(m => (m.attachments?.length || 0) > 0),
                    updatedAt: new Date().toISOString(),
                    preview: content.slice(0, 60) || (attachments.length > 0 ? 'Image uploaded' : ''),
                    title: baseMessages.length === 0 ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : s.title
                };
            }
            return s;
        }));

        const baseUrl = trimTrailingSlash(config.lmStudioEndpoint);
        const chatUrl = `${baseUrl}/chat`;
        const createAbortController = () => {
            const controller = new AbortController();
            generation.controllers.add(controller);
            return controller;
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
                responseTime: totalDur,
                modelName: availableModels.find(m => m.id === config.defaultChatModelId)?.name || config.defaultChatModelId,
                actionSuggestions: actionSuggestions.length > 0 ? actionSuggestions : undefined,
                ...updates,
            });

            // Generate next prompt suggestions using tool calling model
            const fullContent = updates?.content || (latestMessages.find(m => m.id === aiMsgId)?.content || '');
            generateNextPromptSuggestionsWithModel(
                effectiveContent,
                fullContent,
                trimTrailingSlash(config.lmStudioEndpoint),
                config.defaultToolCallingModelId,
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
            generation.controllers.clear();
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

                try {
                    const page = await fetchWebpage(firstUrl, createAbortController().signal);

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
                                    updateAiMessage(targetSid, aiMsgId, { content: sanitizeAssistantContent(fullContent) });
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
                                    updateAiMessage(targetSid, aiMsgId, { content: sanitizeAssistantContent(fullContent) });
                                }
                            } catch {
                                // Ignore malformed stream line.
                            }
                        }
                    }

                    finalize();
                } catch {
                    const perplexicaBase = resolvePerplexicaBase(config.perplexicaEndpoint);
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

                    const providersRes = await fetch(`${perplexicaBase}/api/providers`, { signal: createAbortController().signal });
                    if (!providersRes.ok) throw new Error(`Beka Search Engine providers failed (HTTP ${providersRes.status})`);
                    const providersData = await providersRes.json() as { providers?: PerplexicaProvider[] };
                    const providers = providersData.providers ?? [];

                    const chatMatch = (() => {
                        for (const provider of providers) {
                            const firstModel = provider.chatModels?.[0];
                            if (firstModel) return { providerId: provider.id, key: firstModel.key };
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
                        throw new Error('Unable to fetch webpage content and no Beka Search Engine models are available.');
                    }

                    const searchResponse = await fetch(`${perplexicaBase}/api/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
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
                                    collectedSources = event.data
                                        .map(toSourceFromPerplexica)
                                        .filter((src): src is WebSearchSource => src !== null);
                                    updateAiMessage(targetSid, aiMsgId, {
                                        webSearchResult: {
                                            query: content,
                                            sources: collectedSources
                                        }
                                    });
                                } else if (event.type === 'response' && typeof event.data === 'string') {
                                    fullContent += event.data;
                                    updateAiMessage(targetSid, aiMsgId, { content: sanitizeAssistantContent(fullContent) });
                                }
                            } catch {
                                // Ignore malformed stream line.
                            }
                        }
                    }

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

                    finalize({
                        modelName: `Beka Search Engine (${chatMatch.key})`,
                        content: sanitizeAssistantContent(fullContent) || 'No response received from Beka Search Engine.',
                    });
                }
                return;
            }

            const canUsePerplexica = attachments.length === 0 && (finalSearchMode === 'web' || finalSearchMode === 'deep');
            if (canUsePerplexica) {
                const perplexicaBase = resolvePerplexicaBase(config.perplexicaEndpoint);
                const toolId = `tc-perplexica-${Date.now()}`;
                const toolType: ToolCall['type'] = finalSearchMode === 'deep' ? 'deep_search' : 'web_search';
                const toolLabel = finalSearchMode === 'deep' ? 'Beka is doing a deep search on the internet... please wait...' : 'Beka is searching the web... please wait...';
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

                const providersRes = await fetch(`${perplexicaBase}/api/providers`, { signal: createAbortController().signal });
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
                        const model = provider.chatModels?.find(m => m.key === config.defaultChatModelId);
                        if (model) return { providerId: provider.id, key: model.key };
                    }

                    for (const provider of providers) {
                        const firstModel = provider.chatModels?.[0];
                        if (firstModel) return { providerId: provider.id, key: firstModel.key };
                    }
                    return null;
                })();

                const embeddingMatch = (() => {
                    for (const provider of providers) {
                        const model = provider.embeddingModels?.find(m => m.key === config.defaultEmbeddingModelId);
                        if (model) return { providerId: provider.id, key: model.key };
                    }

                    for (const provider of providers) {
                        const firstModel = provider.embeddingModels?.[0];
                        if (firstModel) return { providerId: provider.id, key: firstModel.key };
                    }
                    return null;
                })();

                if (!chatMatch || !embeddingMatch) {
                    throw new Error('Beka Search Engine is missing chat/embedding provider models.');
                }

                const history = messageHistoryForPerplexica(previousMessages, effectiveContent);
                const sources = finalSearchMode === 'deep' ? ['web', 'academic', 'discussions'] : ['web'];
                const optimizationMode = finalSearchMode === 'deep' ? 'quality' : 'speed';

                const response = await fetch(`${perplexicaBase}/api/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: createAbortController().signal,
                    body: JSON.stringify({
                        chatModel: chatMatch,
                        embeddingModel: embeddingMatch,
                        optimizationMode,
                        sources,
                        query: effectiveContent,
                        history,
                        stream: true,
                    })
                });

                if (!response.ok) {
                    throw new Error(`Beka Search Engine search failed (HTTP ${response.status})`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No Beka Search Engine stream reader.');

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
                                    label: toolLabel,
                                    progress: 60
                                });
                                collectedSources = event.data
                                    .map(toSourceFromPerplexica)
                                    .filter((src): src is WebSearchSource => src !== null);

                                updateAiMessage(targetSid, aiMsgId, {
                                    webSearchResult: {
                                        query: content,
                                        sources: collectedSources,
                                    }
                                });
                            } else if (event.type === 'response' && typeof event.data === 'string') {
                                fullContent += event.data;
                                updateAiMessage(targetSid, aiMsgId, { content: sanitizeAssistantContent(fullContent) });
                            }
                        } catch {
                            // Ignore malformed stream line.
                        }
                    }
                }

                updateAiMessage(targetSid, aiMsgId, {
                    toolCalls: [{
                        id: toolId,
                        type: toolType,
                        status: 'done',
                        label: `${toolLabel} complete`,
                        progress: 100,
                        duration: Date.now() - toolStart,
                    }]
                });

                finalize({
                    modelName: `Beka Search Engine (${chatMatch.key})`,
                    content: sanitizeAssistantContent(fullContent) || 'No response received from Beka Search Engine.',
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

            const body: {
                model: string;
                input: string | Array<{ type: 'text' | 'image'; content?: string; data_url?: string }>;
                stream: boolean;
                system_prompt: string;
                reasoning?: 'low' | 'medium' | 'high';
                previous_response_id?: string;
            } = {
                model: config.defaultChatModelId || 'default',
                input: inputContent,
                stream: true,
                system_prompt: toolSystemInst,
                reasoning: config.reasoningLevel && config.reasoningLevel !== 'off' ? config.reasoningLevel : undefined,
            };

            if (previous_response_id) body.previous_response_id = previous_response_id;
            
            // Only send images directly if the chat model supports vision
            const chatModel = availableModels.find(m => m.id === config.defaultChatModelId);
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

                // If we get an error about unsupported reasoning, retry without it
                if (response.status === 400 && body.reasoning && (errorData?.error?.param === 'reasoning' || errorData?.error?.message?.includes('reasoning'))) {
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
                } else {
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
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'running',
                                    label: `${toolName} started`,
                                    progress: 15,
                                    startedAt: new Date().toISOString()
                                });
                            } else if (eventType === 'tool_call.arguments') {
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'running',
                                    label: `${toolName} running`,
                                    progress: 60
                                });
                            } else if (eventType === 'tool_call.success') {
                                upsertToolCall(targetSid, aiMsgId, {
                                    id: toolId,
                                    type: toolType,
                                    status: 'done',
                                    label: `${toolName} complete`,
                                    progress: 100
                                });
                            } else if (eventType === 'tool_call.failure') {
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
                                updateAiMessage(targetSid, aiMsgId, { content: cleanContent(fullContent) });

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
                                updateAiMessage(targetSid, aiMsgId, { content: cleanContent(fullContent) });
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
                    const vRes = await fetch(`${baseUrl}/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: createAbortController().signal,
                        body: JSON.stringify({
                            model: config.defaultVisionModelId,
                            input: [
                                { type: 'text', content: toolArgs.prompt || 'Describe this image' },
                                ...imgs.map(img => ({ type: 'image', data_url: img.dataUrl || img.url }))
                            ]
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
                                model: config.defaultChatModelId,
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
                                                updateAiMessage(targetSid, aiMsgId, { content: sanitizeAssistantContent(fContent) });
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

            finalize();
        } catch (error) {
            if (generation.stopped || isAbortedError(error)) {
                if (activeGenerationRef.current === generation) {
                    activeGenerationRef.current = null;
                }
                generation.controllers.clear();
                return;
            }
            updateAiMessage(targetSid, aiMsgId, {
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}.`,
                isStreaming: false,
            });
            if (activeGenerationRef.current === generation) {
                activeGenerationRef.current = null;
            }
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
            
            <ChatInput
                onSend={handleSend}
                onStop={handleStopGeneration}
                onClear={handleClearChat}
                isGenerating={isGenerating}
                messages={activeSession?.messages || []}
                promptSuggestions={promptSuggestions}
                onSelectSuggestion={(suggestion: MessageActionSuggestion) => handleSelectSuggestion('', suggestion)}
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
