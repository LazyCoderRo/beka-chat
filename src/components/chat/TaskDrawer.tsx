import './TaskDrawer.css';
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Eye, Globe, Zap, FileSearch, X } from 'lucide-react';
import type { ToolCall } from '../../types';

interface TaskDrawerProps {
    tasks: ToolCall[];
    isVisible: boolean;
    title?: string;
    currentStep?: string;
    onClose?: () => void;
}

export function TaskDrawer({ tasks, isVisible, title = 'Active Tasks', currentStep, onClose }: TaskDrawerProps) {
    const [shouldRender, setShouldRender] = useState(isVisible);

    useEffect(() => {
        if (isVisible) {
            setShouldRender(true);
        } else {
            const timer = setTimeout(() => setShouldRender(false), 500); // Wait for transition
            return () => clearTimeout(timer);
        }
    }, [isVisible]);

    if (!shouldRender && !isVisible) return null;

    return (
        <div className={`bk-task-drawer ${isVisible ? 'bk-task-drawer--visible' : ''}`}>
            <div className="bk-task-drawer__header">
                <h3 className="bk-task-drawer__title">{title}</h3>
                <div className="bk-task-drawer__header-right">
                    <span className="bk-task-drawer__count">{tasks.length}</span>
                    {onClose && (
                        <button className="bk-task-drawer__close" onClick={onClose} aria-label="Close task drawer">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>
            {currentStep && (
                <div className="bk-task-drawer__current-step">
                    <span className="bk-task-drawer__current-step-label">Current Step</span>
                    <span className="bk-task-drawer__current-step-text">{currentStep}</span>
                </div>
            )}
            <div className="bk-task-drawer__list">
                {tasks.length === 0 ? (
                    <div className="bk-task-drawer__empty">No active tasks</div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className={`bk-task-drawer__item bk-task-drawer__item--${task.status}`}>
                            <div className="bk-task-drawer__item-icon">
                                {task.status === 'running' || task.status === 'pending' ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : task.status === 'done' ? (
                                    <CheckCircle2 size={16} />
                                ) : (
                                    <AlertCircle size={16} />
                                )}
                            </div>
                            <div className="bk-task-drawer__item-info">
                                <span className="bk-task-drawer__item-label">{task.label}</span>
                                <div className="bk-task-drawer__item-meta">
                                    {task.type === 'vision_analysis' && <><Eye size={12} /> <span>Vision</span></>}
                                    {task.type === 'web_search' && <><Globe size={12} /> <span>Search</span></>}
                                    {task.type === 'deep_search' && <><Zap size={12} /> <span>Deep</span></>}
                                    {task.type === 'webpage_fetch' && <><FileSearch size={12} /> <span>Webpage</span></>}
                                </div>
                            </div>
                            {task.status === 'running' && (
                                <div className="bk-task-drawer__progress-bar">
                                    <div className="bk-task-drawer__progress-fill" />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
