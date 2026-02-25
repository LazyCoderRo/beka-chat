import type { User, ChatSession, ModelProviderName, AIModel } from '../types';

export const mockUser: User = {
    id: 'user-1',
    name: 'Alex Rivera',
    email: 'alex@bekachat.ai',
    createdAt: '2025-01-15T10:00:00Z',
};

export const mockModels: AIModel[] = [
    { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B', provider: 'LM Studio' as ModelProviderName, capabilities: ['vision', 'text'] },
    { id: 'llama3-8b', name: 'Llama 3 8B', provider: 'LM Studio' as ModelProviderName, capabilities: ['text'] },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' as ModelProviderName, capabilities: ['vision', 'text', 'search'] },
];

export const mockSessions: ChatSession[] = [
    {
        id: 'session-1',
        title: 'Analyzing Product Screenshots',
        preview: 'Can you compare these two UI designs and suggest improvements?',
        hasAttachments: true,
        searchMode: 'none',
        usedSearchModes: [],
        isPinned: true,
        tags: ['design', 'vision'],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        messages: [
            {
                id: 'm1',
                role: 'user',
                content: 'I have attached two screenshots of our new dashboard. Can you compare the layouts?',
                attachments: [
                    { id: 'f1', name: 'dashboard-v1.png', type: 'image', mimeType: 'image/png', size: 450000, url: 'https://placehold.co/600x400', preview: 'https://placehold.co/100x100' },
                    { id: 'f2', name: 'dashboard-v2.png', type: 'image', mimeType: 'image/png', size: 480000, url: 'https://placehold.co/600x400', preview: 'https://placehold.co/100x100' },
                ],
                createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
            },
            {
                id: 'm2',
                role: 'assistant',
                content: 'Analyzing these designs...',
                toolCalls: [
                    { id: 'tc1', type: 'vision_analysis', status: 'done', label: 'Comparing UI layouts' }
                ],
                createdAt: new Date(Date.now() - 39 * 60 * 1000).toISOString(),
            },
            {
                id: 'm3',
                role: 'assistant',
                content: 'Dashboard V2 is much cleaner. The use of whitespace in the sidebar improves readability significantly. However, the contrast of the secondary buttons in V2 seems a bit low for accessibility.',
                createdAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
            }
        ],
    },
    {
        id: 'session-2',
        title: 'Nvidia Stock Performance Research',
        preview: 'How has NVDA performed relative to competitors in Q4 2023?',
        hasAttachments: false,
        searchMode: 'web',
        usedSearchModes: ['web'],
        isPinned: false,
        tags: ['finance', 'market'],
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
        messages: [
            {
                id: 'm4',
                role: 'user',
                content: 'How has NVDA performed relative to competitors in Q4 2023?',
                createdAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
            },
            {
                id: 'm5',
                role: 'assistant',
                content: '',
                isStreaming: false,
                webSearchResult: {
                    query: 'Nvidia stock performance Q4 2023 vs competitors',
                    sources: [
                        { title: 'Nvidia Q4 Earnings Report', url: 'https://nvidianews.nvidia.com', content: 'Nvidia announced record revenue for Q4...' },
                        { title: 'Market Analysis: Chip Stocks', url: 'https://finance.yahoo.com', content: 'NVDA surged 25% in Q4, outperforming AMD and Intel...' }
                    ]
                },
                createdAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
            },
            {
                id: 'm6',
                role: 'assistant',
                content: 'In Q4 2023, Nvidia (NVDA) showed exceptional growth, significantly outperforming its main competitors, AMD and Intel. NVDA stock rose approximately 25% during this period, driven by strong AI chip demand.',
                createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            }
        ]
    },
    {
        id: 'session-3',
        title: 'Future of Sustainable Energy',
        preview: 'Let\'s do a deep dive into the feasibility of solid-state batteries.',
        hasAttachments: false,
        searchMode: 'deep',
        usedSearchModes: ['deep'],
        isPinned: false,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        messages: [
            {
                id: 'm7',
                role: 'user',
                content: 'Let\'s do a deep dive into the feasibility of solid-state batteries for mass market EVs by 2030.',
                createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
            },
            {
                id: 'm8',
                role: 'assistant',
                content: '',
                deepSearchSteps: [
                    { id: 'ds1', label: 'Researching current solid-state battery tech', status: 'done' },
                    { id: 'ds2', label: 'Analyzing Toyota and QuantumScape roadmap', status: 'done' },
                    { id: 'ds3', label: 'Evaluating manufacturing scalability issues', status: 'done' },
                    { id: 'ds4', label: 'Synthesizing findings for 2030 outlook', status: 'running' }
                ],
                createdAt: new Date(Date.now() - 99 * 60 * 60 * 1000).toISOString(),
            }
        ]
    }
];
