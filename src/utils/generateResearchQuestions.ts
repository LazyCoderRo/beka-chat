import type { ResearchQuestion } from '../types';

interface GenerateQuestionsOptions {
    topic: string;
    modelId: string;
    signal?: AbortSignal;
    proxyBase?: string;
}

export async function generateResearchQuestions(
    options: GenerateQuestionsOptions
): Promise<ResearchQuestion[]> {
    const { topic, modelId, signal, proxyBase = '/api/lmstudio' } = options;

    const prompt = `You are a research strategist. Given a user's research topic, generate 3-4 clarifying questions to refine the research strategy.

Topic: "${topic}"

Generate questions in JSON format. Each question should help narrow down the scope or approach.
Return ONLY valid JSON array, no other text.

Example format:
[
  {
    "id": "q1",
    "question": "What is your primary focus?",
    "type": "select",
    "options": ["Technical details", "Market analysis", "Best practices"],
    "required": true
  },
  {
    "id": "q2", 
    "question": "Should I look for recent case studies?",
    "type": "yesno",
    "required": false
  },
  {
    "id": "q3",
    "question": "Any specific industry or context?",
    "type": "text",
    "placeholder": "e.g., healthcare, finance, education",
    "required": false
  }
]`;

    try {
        const response = await fetch(`${proxyBase}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                model: modelId,
                input: prompt,
                stream: false,
                system_prompt: 'You are a JSON API. Return only valid JSON arrays with no additional text or markdown.'
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to generate questions (HTTP ${response.status})`);
        }

        const data = await response.json() as {
            output?: Array<{ content?: string }>;
            content?: string;
            choices?: Array<{ message?: { content?: string } }>;
        };

        const raw = (
            data.output?.[0]?.content ||
            data.content ||
            data.choices?.[0]?.message?.content ||
            ''
        ).trim();

        if (!raw) {
            return getDefaultQuestions(topic);
        }

        // Extract JSON array from response
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            return getDefaultQuestions(topic);
        }

        const parsed = JSON.parse(jsonMatch[0]) as ResearchQuestion[];
        
        // Validate and normalize questions
        return parsed.map((q, idx) => ({
            id: q.id || `q${idx + 1}`,
            question: q.question || '',
            type: (q.type as 'yesno' | 'text' | 'select') || 'text',
            required: q.required ?? false,
            options: q.options,
            placeholder: q.placeholder
        })).filter(q => q.question);
    } catch (error) {
        console.error('Error generating research questions:', error);
        return getDefaultQuestions(topic);
    }
}

function getDefaultQuestions(topic: string): ResearchQuestion[] {
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
}
