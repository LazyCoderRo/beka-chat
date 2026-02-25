export interface ModelRule {
    modelId: string | RegExp;
    hasReasoningLevel?: boolean;
    reasoningLevels?: string[];
}

export const modelRules: ModelRule[] = [
    {
        modelId: 'openai/gpt-oss-20b',
        hasReasoningLevel: true,
        reasoningLevels: ['off', 'low', 'medium', 'high']
    }
];

export function getRuleForModel(modelId: string): ModelRule | undefined {
    return modelRules.find(rule =>
        typeof rule.modelId === 'string'
            ? rule.modelId === modelId
            : rule.modelId.test(modelId)
    );
}
