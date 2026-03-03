import './ResearchFindingsPanel.css';
import { CheckCircle2, TrendingUp } from 'lucide-react';

export interface ResearchFinding {
    id: string;
    phase: string;
    title: string;
    content: string;
    sourceCount: number;
    confidence: 'high' | 'medium' | 'low';
    timestamp: number;
}

interface ResearchFindingsPanelProps {
    findings: ResearchFinding[];
    isVisible: boolean;
}

export function ResearchFindingsPanel({ findings, isVisible }: ResearchFindingsPanelProps) {
    if (!isVisible || findings.length === 0) {
        return null;
    }

    const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
        const colors = {
            high: 'bk-finding__confidence--high',
            medium: 'bk-finding__confidence--medium',
            low: 'bk-finding__confidence--low'
        };
        return colors[confidence];
    };

    return (
        <div className="bk-findings-panel">
            <div className="bk-findings-panel__header">
                <TrendingUp size={16} className="bk-findings-panel__icon" />
                <h3 className="bk-findings-panel__title">Intermediate Findings</h3>
                <span className="bk-findings-panel__count">{findings.length}</span>
            </div>

            <div className="bk-findings-panel__content">
                {findings.map((finding) => (
                    <div key={finding.id} className="bk-finding">
                        <div className="bk-finding__header">
                            <div className="bk-finding__meta">
                                <span className="bk-finding__phase">{finding.phase}</span>
                                <span className={`bk-finding__confidence ${getConfidenceBadge(finding.confidence)}`}>
                                    {finding.confidence}
                                </span>
                            </div>
                            <span className="bk-finding__sources">
                                <CheckCircle2 size={12} />
                                {finding.sourceCount} source{finding.sourceCount !== 1 ? 's' : ''}
                            </span>
                        </div>

                        <h4 className="bk-finding__title">{finding.title}</h4>
                        <p className="bk-finding__content">{finding.content}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
