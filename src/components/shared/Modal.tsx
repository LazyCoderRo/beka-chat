import './Modal.css';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="bk-modal-backdrop" onClick={onClose} role="dialog" aria-modal>
            <div
                className={`bk-modal bk-modal--${size}`}
                onClick={e => e.stopPropagation()}
            >
                {title && (
                    <div className="bk-modal__header">
                        <h2 className="bk-modal__title">{title}</h2>
                        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                            <X size={18} />
                        </Button>
                    </div>
                )}
                <div className="bk-modal__body">{children}</div>
                {footer && <div className="bk-modal__footer">{footer}</div>}
            </div>
        </div>
    );
}
