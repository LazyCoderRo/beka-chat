import './DeepSearchProgress.css';
import { Zap, CheckCircle2, Loader2 } from 'lucide-react';
import type { DeepSearchStep } from '../../types';

interface DeepSearchProgressProps {
    steps: DeepSearchStep[];
    isComplete?: boolean;
}

export function DeepSearchProgress({ steps, isComplete }: DeepSearchProgressProps) {
    const doneCount = steps.filter(s => s.status === 'done').length;

    return (
        <div className="bk-deep-search">
            <div className="bk-deep-search__header">
                <Zap size={14} className="bk-deep-search__icon" />
                <span className="bk-deep-search__title">Deep Search</span>
                <span className="bk-deep-search__progress">
                    {doneCount}/{steps.length}
                </span>
            </div>

            <div className="bk-deep-search__steps">
                {steps.map((step, idx) => (
                    <div key={step.id} className={`bk-deep-step bk-deep-step--${step.status}`}>
                        <div className="bk-deep-step__connector">
                            <div className="bk-deep-step__dot">
                                {step.status === 'done'
                                    ? <CheckCircle2 size={12} />
                                    : step.status === 'running'
                                        ? <Loader2 size={12} className="bk-deep-step__spin" />
                                        : <span className="bk-deep-step__num">{idx + 1}</span>
                                }
                            </div>
                            {idx < steps.length - 1 && (
                                <div className={`bk-deep-step__line ${step.status === 'done' ? 'bk-deep-step__line--done' : ''}`} />
                            )}
                        </div>
                        <span className="bk-deep-step__label">{step.label}</span>
                    </div>
                ))}
            </div>

            {!isComplete && (
                <div className="bk-deep-search__shimmer" />
            )}
        </div>
    );
}
