import './TaskDrawer.css';
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Eye, Globe, Zap, FileSearch, X, Download } from 'lucide-react';
import { Button } from '../shared/Button';
import type { ToolCall } from '../../types';

interface TaskDrawerProps {
    tasks: ToolCall[];
    isVisible: boolean;
    title?: string;
    currentStep?: string;
    onClose?: () => void;
    onExport?: (format: 'json' | 'markdown') => void;
    tasksTotalCount?: number;
}

export function TaskDrawer({ tasks, isVisible, title = 'Active Tasks', currentStep, onClose, onExport }: TaskDrawerProps) {
    const [shouldRender, setShouldRender] = useState(isVisible);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const isDeepResearch = tasks.some(t => t.type === 'deep_search');
    const isComplete = tasks.every(t => t.status === 'done' || t.status === 'error');

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
                    {onExport && isDeepResearch && isComplete && (
                        <div className="bk-task-drawer__export-menu">
                            <button
                                className="bk-task-drawer__export-button"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                title="Export research"
                                aria-label="Export research"
                            >
                                <Download size={14} />
                            </button>
                            {showExportMenu && (
                                <div className="bk-task-drawer__export-dropdown">
                                    <button
                                        className="bk-task-drawer__export-option"
                                        onClick={() => {
                                            onExport('markdown');
                                            setShowExportMenu(false);
                                        }}
                                    >
                                        Export as Markdown
                                    </button>
                                    <button
                                        className="bk-task-drawer__export-option"
                                        onClick={() => {
                                            onExport('json');
                                            setShowExportMenu(false);
                                        }}
                                    >
                                        Export as JSON
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
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
