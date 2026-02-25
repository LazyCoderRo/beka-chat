import type { Message } from '../types';

/**
 * Calculate estimated context tokens used by messages
 */
export function calculateContextTokens(
    messages: Message[],
    maxContextLength: number = 8192
): { used: number; max: number; percentage: number; activeMessages: Message[] } {
    // Filter out archived messages for active context calculation
    const activeMessages = messages.filter(m => !m.isContextArchived);

    // Rough token estimation: ~4 chars per token + overhead per message
    let totalChars = 0;
    for (const msg of activeMessages) {
        totalChars += msg.content.length;
    }
    
    const estimatedTokens = Math.max(
        1,
        Math.ceil(totalChars / 4) + (activeMessages.length * 12)
    );

    const percentage = maxContextLength > 0 ? estimatedTokens / maxContextLength : 0;

    return {
        used: estimatedTokens,
        max: maxContextLength,
        percentage,
        activeMessages
    };
}

/**
 * Check if context usage exceeds threshold
 */
export function shouldSummarizeContext(
    messages: Message[],
    maxContextLength: number = 8192,
    threshold: number = 0.7
): boolean {
    const { percentage } = calculateContextTokens(messages, maxContextLength);
    return percentage >= threshold;
}

/**
 * Get messages before the last context archive point
 */
export function getArchivedMessages(messages: Message[]): Message[] {
    return messages.filter(m => m.isContextArchived);
}

/**
 * Get active messages (not archived)
 */
export function getActiveMessages(messages: Message[]): Message[] {
    return messages.filter(m => !m.isContextArchived);
}

/**
 * Create a summary message from conversation
 */
export function createSummaryMessage(
    _messagesBefore: Message[],
    summaryContent: string
): Message {
    const now = new Date().toISOString();
    return {
        id: `summary-${Date.now()}`,
        role: 'system',
        content: `[CONTEXT SUMMARY]\n${summaryContent}`,
        createdAt: now,
        toolCalls: [{
            id: `context-summary-${Date.now()}`,
            type: 'context_summarization',
            status: 'done',
            label: 'Context summarized to preserve tokens'
        }]
    };
}

/**
 * Archive messages up to a certain point and insert summary
 * Returns new messages array with archived messages marked and summary inserted
 */
export function archiveMessagesWithSummary(
    messages: Message[],
    summaryContent: string,
    keepLastN: number = 5
): { messages: Message[]; summaryId: string } {
    const summaryId = `summary-${Date.now()}`;
    
    // Keep the last N messages as active context
    const keepFromIndex = Math.max(0, messages.length - keepLastN);
    
    const updated = messages.map((msg, idx) => {
        if (idx < keepFromIndex) {
            // Archive old messages
            return {
                ...msg,
                isContextArchived: true,
                contextSummaryId: summaryId
            };
        }
        return msg;
    });
    
    // Find where to insert the summary (after first message if something is archived)
    const insertIndex = keepFromIndex > 0 ? 1 : 0;
    const summaryMessage = createSummaryMessage(updated.slice(0, keepFromIndex), summaryContent);
    summaryMessage.id = summaryId;
    
    updated.splice(insertIndex, 0, summaryMessage);
    
    return { messages: updated, summaryId };
}

/**
 * Get only messages that should be sent to the API (excluding archived ones)
 * Includes the summary message if one exists
 */
export function getContextMessagesForAPI(messages: Message[]): Message[] {
    const result: Message[] = [];
    let hasSummary = false;
    
    for (const msg of messages) {
        // Include non-archived messages and summaries
        if (!msg.isContextArchived) {
            result.push(msg);
        } else if (msg.role === 'system' && msg.content.includes('[CONTEXT SUMMARY]') && !hasSummary) {
            // Include only the first summary found
            result.push(msg);
            hasSummary = true;
        }
    }
    
    return result;
}
