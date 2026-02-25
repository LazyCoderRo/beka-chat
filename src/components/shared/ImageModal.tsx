import './ImageModal.css';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ImageModalProps {
    src: string;
    alt?: string;
    onClose: () => void;
}

export function ImageModal({ src, alt, onClose }: ImageModalProps) {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        // Scroll up (negative deltaY) = zoom in, scroll down (positive deltaY) = zoom out
        if (e.deltaY < 0) {
            handleZoomIn();
        } else {
            handleZoomOut();
        }
    };

    return (
        <div className="bk-img-modal" onClick={onClose}>
            <div className="bk-img-modal__overlay" />

            <div className="bk-img-modal__toolbar" onClick={e => e.stopPropagation()}>
                <div className="bk-img-modal__tools">
                    <button onClick={handleZoomOut} title="Zoom Out"><ZoomOut size={18} /></button>
                    <button onClick={handleZoomIn} title="Zoom In"><ZoomIn size={18} /></button>
                    <a href={src} download={alt || 'image'} title="Download" className="bk-img-modal__btn">
                        <Download size={18} />
                    </a>
                </div>
                <button className="bk-img-modal__close" onClick={onClose}>
                    <X size={20} />
                </button>
            </div>

            <div className="bk-img-modal__content" onWheel={handleWheel}>
                <img
                    src={src}
                    alt={alt}
                    style={{ transform: `scale(${scale})` }}
                    className="bk-img-modal__image"
                    onClick={e => e.stopPropagation()}
                />
            </div>
        </div>
    );
}
