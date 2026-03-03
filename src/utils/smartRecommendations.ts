import type { FileAttachment, Message, MessageActionSuggestion } from '../types';

/**
 * Check if a model ID is a Qwen model
 */
function isQwenModel(modelId: string): boolean {
    return /qwen|qwq/i.test(modelId);
}

export interface ToolRecommendation {
    id: string;
    toolName: 'vision_analysis' | 'webpage_fetch' | 'web_search' | 'deep_search' | 'context_summarization' | 'next_prompt';
    label: string;
    description: string;
    confidence: number; // 0-100
    reason: string;
}

interface RecommendationContext {
    content: string;
    aiResponse?: string; // Latest AI response
    userPrompt?: string; // Latest user prompt
    attachments: FileAttachment[];
    previousMessages: Message[];
    contextUsagePercentage: number;
    maxContext: number;
}

/**
 * Analyze content to detect vision analysis needs
 */
function checkVisionAnalysis(attachments: FileAttachment[]): ToolRecommendation | null {
    const hasImages = attachments.some(a => a.type === 'image');
    if (!hasImages) return null;

    return {
        id: `rec-vision-${Date.now()}`,
        toolName: 'vision_analysis',
        label: 'Analyze Images',
        description: 'I can analyze the uploaded images if you\'d like me to.',
        confidence: 85,
        reason: 'Image attachments detected'
    };
}

/**
 * Analyze content to detect webpage fetch needs
 */
function checkWebpageFetch(content: string, previousMessages: Message[]): ToolRecommendation | null {
    const urlRegex = /\b((?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*)/gi;
    const urlsInContent = content.match(urlRegex);

    if (urlsInContent && urlsInContent.length > 0) {
        const urlText = urlsInContent.slice(0, 2).join(', ');
        return {
            id: `rec-webpage-${Date.now()}`,
            toolName: 'webpage_fetch',
            label: 'Fetch & Analyze',
            description: `Fetch and analyze: ${urlText}`,

            confidence: 90,
            reason: 'URL detected in message'
        };
    }

    // Check if user references recent links
    const recentUrls = previousMessages
        .slice(-10)
        .filter(m => m.role === 'assistant')
        .map(m => m.webSearchResult?.sources.map(s => s.url) || [])
        .flat();

    if ((content.includes('that') || content.includes('this')) &&
        (content.includes('page') || content.includes('link') || content.includes('article')) &&
        recentUrls.length > 0) {
        return {
            id: `rec-webpage-ref-${Date.now()}`,
            toolName: 'webpage_fetch',
            label: 'Fetch Recent Link',
            description: 'Fetch the content from a recently searched link.',
            confidence: 70,
            reason: 'Reference to recent search results detected'
        };
    }

    return null;
}

/**
 * Analyze content to detect web search needs
 */
function checkWebSearch(content: string): ToolRecommendation | null {
    const freshInfoKeywords = [
        'latest', 'recent', 'today', 'current', 'now', 'real-time',
        'news', 'update', 'happening', 'what\'s new', 'breaking',
        'today\'s', 'this week', 'this month', 'latest news'
    ];

    const contentLower = content.toLowerCase();
    const hasFreshKeywords = freshInfoKeywords.some(kw => contentLower.includes(kw));

    if (hasFreshKeywords || content.includes('?')) {
        return {
            id: `rec-web-${Date.now()}`,
            toolName: 'web_search',
            label: 'Web Search',
            description: 'Search the internet for current information.',
            confidence: 75,
            reason: 'Request appears to need current/fresh information'
        };
    }

    return null;
}

/**
 * Analyze content to detect deep search needs
 */
function checkDeepSearch(content: string): ToolRecommendation | null {
    const complexKeywords = [
        'research', 'comprehensive', 'in-depth', 'thorough', 'detailed analysis',
        'compare', 'contrast', 'pros and cons', 'advantages disadvantages',
        'investigate', 'explore', 'understand deeply'
    ];

    const contentLower = content.toLowerCase();
    const hasComplexKeywords = complexKeywords.some(kw => contentLower.includes(kw));

    if (hasComplexKeywords && content.length > 50) {
        return {
            id: `rec-deep-${Date.now()}`,
            toolName: 'deep_search',
            label: 'Deep Research',
            description: 'Conduct a comprehensive research with multiple sources.',
            confidence: 70,
            reason: 'Complex research query detected'
        };
    }

    return null;
}

/**
 * Check if context summarization is needed
 */
function checkContextSummarization(contextUsagePercentage: number): ToolRecommendation | null {
    if (contextUsagePercentage >= 0.65) {
        return {
            id: `rec-context-sum-${Date.now()}`,
            toolName: 'context_summarization',
            label: 'Save Context',
            description: `Context is at ${Math.round(contextUsagePercentage * 100)}%. Summarize to free up token space.`,
            confidence: 100,
            reason: 'High context usage detected'
        };
    }

    return null;
}

/**
 * Extract meaningful topics/keywords from text
 */
function extractKeyTopics(text: string): string[] {
    if (!text || text.length < 20) return [];

    // Remove common words and extract meaningful phrases
    const stopwords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
        'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'this', 'that',
        'it', 'can', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'have', 'has', 'had'
    ]);

    // Extract capitalized proper nouns
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

    // Extract technical terms and programming keywords
    const techTerms = text.match(/\b(?:API|HTTP|REST|SQL|CSS|HTML|JavaScript|Python|React|Vue|Angular|Docker|Kubernetes|AWS|AI|ML|NLP|GPT|LLM|framework|library|database|algorithm|pattern|architecture|design|optimization|security|performance)\b/gi) || [];

    // Extract main nouns (words before colons or that are common in tech context)
    const emphasized = text.match(/([A-Za-z]+):\s+/g)?.map(s => s.replace(/:\s+/, '')) || [];

    // Combine and deduplicate
    const allTopics = [
        ...properNouns,
        ...techTerms,
        ...emphasized
    ];

    return [...new Set(
        allTopics
            .filter(t => t && t.length > 2 && !stopwords.has(t.toLowerCase()))
            .map(t => t.trim())
    )].slice(0, 5);
}

/**
 * Analyze response content for specific patterns
 */
function analyzeResponseContent(text: string): {
    hasCode: boolean;
    hasExamples: boolean;
    isExplanatory: boolean;
    isComparative: boolean;
    isTutorial: boolean;
    isProblem: boolean;
} {
    const lowerText = text.toLowerCase();

    return {
        hasCode: /```|code|function|class|def|const|let|var|import|export/i.test(text),
        hasExamples: /example|for instance|such as|like|e\.g\.|i\.e\.|here's|here is/i.test(lowerText),
        isExplanatory: /explain|describe|define|concept|theory|what is|how does|how to|basic|fundamental|introduction/i.test(lowerText),
        isComparative: /compare|versus|vs|better than|worse than|difference|unlike|similar|same as|instead of/i.test(lowerText),
        isTutorial: /step|tutorial|guide|process|procedure|follow|first|then|next|finally|approach|method/i.test(lowerText),
        isProblem: /problem|error|bug|issue|fail|issue|trouble|broken|doesn't work|can't|unable/i.test(lowerText)
    };
}

/**
 * Generate smarter next prompt recommendations
 */
function generateNextPromptRecommendations(aiResponse: string): ToolRecommendation[] {
    const recommendations: ToolRecommendation[] = [];

    if (!aiResponse || aiResponse.length < 50) return recommendations;

    const topics = extractKeyTopics(aiResponse);
    const patterns = analyzeResponseContent(aiResponse);

    // 1. If response was theoretical, suggest practical application
    if (patterns.isExplanatory && !patterns.hasExamples) {
        recommendations.push({
            id: `rec-practical-${Date.now()}`,
            toolName: 'next_prompt',
            label: 'Show me practical examples',
            description: 'Get concrete, real-world examples of this concept',
            confidence: 85,
            reason: 'Theoretical content without examples'
        });
    }

    // 2. If code was provided, suggest explanation
    if (patterns.hasCode && !patterns.isExplanatory) {
        recommendations.push({
            id: `rec-explain-code-${Date.now()}`,
            toolName: 'next_prompt',
            label: 'Explain the code step by step',
            description: 'Get a detailed walkthrough of how this works',
            confidence: 80,
            reason: 'Code provided without explanation'
        });
    }

    // 3. If problem was mentioned, suggest solutions
    if (patterns.isProblem) {
        recommendations.push({
            id: `rec-solution-${Date.now()}`,
            toolName: 'next_prompt',
            label: 'What are the best solutions?',
            description: 'Explore different solutions and their trade-offs',
            confidence: 82,
            reason: 'Problem identified, solutions needed'
        });
    }

    // 4. If comparative content, suggest implementation
    if (patterns.isComparative) {
        recommendations.push({
            id: `rec-implement-${Date.now()}`,
            toolName: 'next_prompt',
            label: 'How do I implement the best option?',
            description: 'Step-by-step implementation guide',
            confidence: 78,
            reason: 'Comparison finished, implementation needed'
        });
    }

    // 5. If tutorial/guide, suggest advanced topics
    if (patterns.isTutorial) {
        const mainTopic = topics[0];
        if (mainTopic) {
            recommendations.push({
                id: `rec-advanced-${Date.now()}`,
                toolName: 'next_prompt',
                label: `Advanced ${mainTopic} techniques`,
                description: 'Learn advanced patterns and best practices',
                confidence: 72,
                reason: 'Basics covered, ready for advanced concepts'
            });
        }
    }

    // 6. Deep dive into main topic
    if (topics.length > 0) {
        const topTopic = topics[0];
        recommendations.push({
            id: `rec-deepdive-${Date.now()}`,
            toolName: 'next_prompt',
            label: `How do I master ${topTopic}?`,
            description: `Comprehensive guide to becoming proficient with ${topTopic}`,
            confidence: 70,
            reason: 'Key topic identified for deeper learning'
        });
    }

    // 7. Common follow-up question if response looks complete
    if (aiResponse.length > 200 && !patterns.hasExamples && !patterns.isComparative) {
        recommendations.push({
            id: `rec-related-${Date.now()}`,
            toolName: 'next_prompt',
            label: 'What related topics should I learn?',
            description: 'Discover related concepts and best practices',
            confidence: 65,
            reason: 'Response complete, related topics may be relevant'
        });
    }

    // Sort by confidence and return top 3
    return recommendations
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
}

/**
 * Get smart tool recommendations based on context
 */
export function getSmartRecommendations(
    context: RecommendationContext
): ToolRecommendation[] {
    const recommendations: ToolRecommendation[] = [];

    // Check each tool scenario
    const visionRec = checkVisionAnalysis(context.attachments);
    if (visionRec) recommendations.push(visionRec);

    const webpageRec = checkWebpageFetch(context.content, context.previousMessages);
    if (webpageRec) recommendations.push(webpageRec);

    const webSearchRec = checkWebSearch(context.content);
    if (webSearchRec) recommendations.push(webSearchRec);

    const deepSearchRec = checkDeepSearch(context.content);
    if (deepSearchRec) recommendations.push(deepSearchRec);

    const contextRec = checkContextSummarization(context.contextUsagePercentage);
    if (contextRec) recommendations.push(contextRec);

    // Generate next prompt recommendations using full context if available
    const nextPromptRecs = generateNextPromptRecommendations(
        context.aiResponse || ''
    );
    recommendations.push(...nextPromptRecs);

    // Sort by confidence and return top 3
    return recommendations
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
}

/**
 * Generate next prompt suggestions using the tool calling model
 */
export async function generateNextPromptSuggestionsWithModel(
    userPrompt: string,
    aiResponse: string,
    lmStudioEndpoint: string,
    toolCallingModelId: string,
    signal?: AbortSignal
): Promise<MessageActionSuggestion[]> {
    const parseSuggestions = (rawContent: string): Array<{ label: string; description?: string }> => {
        const cleaned = rawContent
            .replace(/```json/gi, '```')
            .replace(/```/g, '')
            .trim();

        const candidates: string[] = [];
        if (cleaned) candidates.push(cleaned);

        const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) candidates.push(jsonMatch[0]);

        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
        }

        const normalizeLooseJson = (value: string): string => {
            return value
                .replace(/[“”]/g, '"')
                .replace(/[‘’]/g, '\'')
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
                .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
        };

        for (const candidate of candidates) {
            for (const attempt of [candidate, normalizeLooseJson(candidate)]) {
                try {
                    const parsed = JSON.parse(attempt) as unknown;
                    if (!Array.isArray(parsed)) continue;

                    return parsed
                        .map((item): { label: string; description?: string } | null => {
                            if (!item || typeof item !== 'object') return null;
                            const maybeLabel = (item as { label?: unknown }).label;
                            const maybeDescription = (item as { description?: unknown }).description;
                            if (typeof maybeLabel !== 'string' || maybeLabel.trim().length === 0) return null;
                            return {
                                label: maybeLabel.trim(),
                                description: typeof maybeDescription === 'string' && maybeDescription.trim().length > 0
                                    ? maybeDescription.trim()
                                    : undefined
                            };
                        })
                        .filter((item): item is { label: string; description?: string } => item !== null);
                } catch {
                    // Try next parse strategy.
                }
            }
        }

        // Fallback: parse plain-text bullets/lines when model ignored JSON format.
        const lines = cleaned
            .split('\n')
            .map(line => line.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
            .filter(line => line.length >= 6 && line.length <= 160)
            .filter(line => !/^(return|json|format|example)/i.test(line));

        const unique = [...new Set(lines)];
        return unique.slice(0, 3).map(label => ({ label }));
    };

    const toActionSuggestions = (suggestions: Array<{ label: string; description?: string }>) => {
        return suggestions.slice(0, 3).map((s, i) => ({
            id: `rec-toolcall-${Date.now()}-${i}`,
            label: s.label,
            description: s.description || s.label,
            query: s.label,
            searchMode: 'none' as const,
            type: 'prompt' as const
        }));
    };

    try {
        const systemPrompt = `You are a helpful assistant that suggests follow-up questions for conversations. 
Generate exactly 3 diverse and helpful follow-up prompts that build on the conversation.
Each suggestion should:
1. Be a complete, natural question or statement (5-20 words)
2. Explore different angles (deeper analysis, practical application, related topics, examples, etc.)
3. Be actionable and specific

Do not overthink. Generate suggestions quickly based on natural next steps in the conversation.

Return ONLY a JSON array with this format (no markdown, no code blocks):
[
  {"label": "Question or suggestion here", "description": "Brief explanation why this is relevant"},
  {"label": "Another question", "description": "Why this matters"},
  {"label": "Third suggestion", "description": "Context for this follow-up"}
]`;

        const userInput = `User asked: "${userPrompt}"

Assistant responded: "${aiResponse.slice(0, 500)}${aiResponse.length > 500 ? '...' : ''}"

Generate 3 follow-up prompts as JSON array:`;

        const chatUrl = `${lmStudioEndpoint}/chat`;
        const requestBody: Record<string, any> = {
            model: toolCallingModelId,
            input: userInput,
            stream: false,
            system_prompt: systemPrompt,
        };

        // Add Qwen sampling parameters for tool mode (suggestion generation)
        if (isQwenModel(toolCallingModelId)) {
            // Tool calling/instruct mode parameters - only supported LM Studio params
            requestBody.temperature = 1.0;
            requestBody.top_p = 1.0;
            requestBody.top_k = 40;
            requestBody.min_p = 0.0;
            requestBody.repeat_penalty = 1.0;
        }

        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            console.warn('Failed to generate suggestions with tool calling model');
            return [];
        }

        const data = await response.json() as any;
        const content = data.output?.[0]?.content || data.choices?.[0]?.message?.content || data.content || data.result?.content || '';

        const suggestions = parseSuggestions(content);
        if (suggestions.length === 0) {
            return [];
        }

        return toActionSuggestions(suggestions);
    } catch (error) {
        console.warn('Error generating suggestions with tool calling model:', error);
        return [];
    }
}

/**
 * Convert recommendations to message action suggestions for UI
 */
export function recommendationsToActionSuggestions(
    recommendations: ToolRecommendation[]
): MessageActionSuggestion[] {
    return recommendations.map(rec => ({
        id: rec.id,
        label: rec.label,
        description: rec.description,
        // For next_prompt, use the label as the query; otherwise use reason as hint
        query: rec.toolName === 'next_prompt' ? rec.label : rec.reason,
        searchMode: rec.toolName === 'deep_search' ? 'deep' :
            rec.toolName === 'web_search' ? 'web' :
                rec.toolName === 'webpage_fetch' ? 'none' : 'none',
        type: rec.toolName === 'next_prompt' ? 'prompt' : 'tool'
    }));
}
