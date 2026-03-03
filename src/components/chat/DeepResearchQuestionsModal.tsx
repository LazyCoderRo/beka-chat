import './DeepResearchQuestionsModal.css';
import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { ArrowRight } from 'lucide-react';
import type { ResearchQuestion } from '../../types';

interface DeepResearchQuestionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (answers: Record<string, string | boolean>) => void;
    questions: ResearchQuestion[];
    isLoading?: boolean;
}

export function DeepResearchQuestionsModal({
    isOpen,
    onClose,
    onSubmit,
    questions,
    isLoading = false
}: DeepResearchQuestionsModalProps) {
    const [answers, setAnswers] = useState<Record<string, string | boolean>>({});

    const handleAnswer = (questionId: string, value: string | boolean) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const handleSubmit = () => {
        const requiredAnswered = questions
            .filter(q => q.required)
            .every(q => answers[q.id] !== undefined && answers[q.id] !== '');

        if (!requiredAnswered) {
            return; // Prevent submit if required questions aren't answered
        }

        onSubmit(answers);
        setAnswers({});
        onClose();
    };

    const requiredAnswered = questions
        .filter(q => q.required)
        .every(q => answers[q.id] !== undefined && answers[q.id] !== '');

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Refine Your Research"
            size="md"
            footer={
                <div className="bk-questions-modal__footer">
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!requiredAnswered || isLoading}
                        isLoading={isLoading}
                        leftIcon={<ArrowRight size={16} />}
                    >
                        Start Research
                    </Button>
                </div>
            }
        >
            <div className="bk-questions-modal__content">
                <p className="bk-questions-modal__description">
                    Answer these questions to help refine the research strategy:
                </p>

                <div className="bk-questions-modal__questions">
                    {questions.map((q) => (
                        <div key={q.id} className="bk-question-item">
                            <label className="bk-question-item__label">
                                {q.question}
                                {q.required && <span className="bk-question-item__required">*</span>}
                            </label>

                            {q.type === 'yesno' && (
                                <div className="bk-question-item__buttons">
                                    <Button
                                        variant={answers[q.id] === true ? 'primary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleAnswer(q.id, true)}
                                        disabled={isLoading}
                                    >
                                        Yes
                                    </Button>
                                    <Button
                                        variant={answers[q.id] === false ? 'primary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleAnswer(q.id, false)}
                                        disabled={isLoading}
                                    >
                                        No
                                    </Button>
                                </div>
                            )}

                            {q.type === 'text' && (
                                <Input
                                    placeholder={q.placeholder || 'Enter your answer...'}
                                    value={(answers[q.id] as string) || ''}
                                    onChange={(e) => handleAnswer(q.id, e.target.value)}
                                    disabled={isLoading}
                                />
                            )}

                            {q.type === 'select' && q.options && (
                                <select
                                    className="bk-question-item__select"
                                    value={(answers[q.id] as string) || ''}
                                    onChange={(e) => handleAnswer(q.id, e.target.value)}
                                    disabled={isLoading}
                                >
                                    <option value="">Select an option...</option>
                                    {q.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
