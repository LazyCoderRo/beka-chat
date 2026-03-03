import type { ToolCall, WebSearchSource } from '../types';

export interface ResearchTrace {
    topic: string;
    startedAt: string;
    completedAt?: string;
    phases: ResearchPhase[];
    totalSources: number;
    finalAnswer: string;
}

export interface ResearchPhase {
    id: string;
    name: string;
    query: string;
    findings: string;
    sources: WebSearchSource[];
    duration: number;
    status: 'pending' | 'running' | 'done' | 'error';
}

export function captureResearchTrace(
    topic: string,
    tasks: ToolCall[],
    sources: WebSearchSource[],
    finalAnswer: string
): ResearchTrace {
    const startTask = tasks[0];
    const endTask = tasks[tasks.length - 1];

    const startedAt = startTask?.startedAt || new Date().toISOString();
    const completedAt = endTask?.completedAt || new Date().toISOString();

    const phases: ResearchPhase[] = tasks
        .filter(t => t.type === 'deep_search')
        .map((task, idx) => ({
            id: task.id,
            name: task.label || `Phase ${idx + 1}`,
            query: '', // Would need to be captured during research
            findings: '', // Would need to be captured during research
            sources: idx === tasks.length - 1 ? sources : [], // Assign sources to last phase
            duration: task.duration || 0,
            status: task.status as 'pending' | 'running' | 'done' | 'error'
        }));

    return {
        topic,
        startedAt,
        completedAt,
        phases,
        totalSources: sources.length,
        finalAnswer
    };
}

export function exportResearchTraceAsJSON(trace: ResearchTrace): string {
    return JSON.stringify(trace, null, 2);
}

export function exportResearchTraceAsMarkdown(trace: ResearchTrace): string {
    const lines: string[] = [];

    lines.push(`# Research Report: ${trace.topic}`);
    lines.push('');
    lines.push(`**Generated**: ${new Date(trace.startedAt).toLocaleString()}`);
    lines.push(`**Duration**: ${Math.round((new Date(trace.completedAt!).getTime() - new Date(trace.startedAt).getTime()) / 1000)}s`);
    lines.push(`**Sources Used**: ${trace.totalSources}`);
    lines.push('');

    lines.push('## Research Phases');
    lines.push('');

    trace.phases.forEach((phase, idx) => {
        lines.push(`### ${idx + 1}. ${phase.name}`);
        lines.push(`- **Status**: ${phase.status}`);
        lines.push(`- **Duration**: ${phase.duration}ms`);
        if (phase.findings) {
            lines.push(`- **Key Findings**: ${phase.findings}`);
        }
        if (phase.sources.length > 0) {
            lines.push('- **Sources**:');
            phase.sources.slice(0, 5).forEach(source => {
                lines.push(`  - [${source.title}](${source.url})`);
            });
        }
        lines.push('');
    });

    lines.push('## Final Answer');
    lines.push('');
    lines.push(trace.finalAnswer);
    lines.push('');

    if (trace.phases.flatMap(p => p.sources).length > 0) {
        lines.push('## All Sources');
        lines.push('');
        const allSources = new Map<string, WebSearchSource>();
        trace.phases.forEach(phase => {
            phase.sources.forEach(source => {
                if (!allSources.has(source.url)) {
                    allSources.set(source.url, source);
                }
            });
        });

        Array.from(allSources.values()).forEach((source, idx) => {
            lines.push(`${idx + 1}. **${source.title}**`);
            lines.push(`   URL: ${source.url}`);
            if (source.content) {
                lines.push(`   Content: ${source.content.slice(0, 150)}...`);
            }
            lines.push('');
        });
    }

    return lines.join('\n');
}

export function downloadResearchTrace(trace: ResearchTrace, format: 'json' | 'markdown' = 'markdown') {
    const content = format === 'json'
        ? exportResearchTraceAsJSON(trace)
        : exportResearchTraceAsMarkdown(trace);

    const filename = `research-${trace.topic.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : 'md'}`;

    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
