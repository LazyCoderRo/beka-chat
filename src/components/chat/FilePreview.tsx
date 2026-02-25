import './FilePreview.css';
import { FileText, Image, X, FileSpreadsheet, FileType } from 'lucide-react';
import type { FileAttachment } from '../../types';

function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface FilePreviewProps {
    file: FileAttachment;
    onRemove?: () => void;
    onClick?: (src: string) => void;
    compact?: boolean;
}

export function FilePreview({ file, onRemove, onClick, compact }: FilePreviewProps) {
    const isImage = file.type === 'image';

    const handleClick = () => {
        if (isImage && (file.dataUrl || file.url) && onClick) {
            onClick(file.dataUrl || file.url!);
        }
    };

    // Determine icon based on file type
    const getFileIcon = () => {
        if (isImage) {
            return <Image size={18} className="bk-file-preview__icon bk-file-preview__icon--image" />;
        }

        const fileName = file.name.toLowerCase();
        const mimeType = file.mimeType.toLowerCase();

        // PDF files
        if (file.type === 'pdf' || fileName.endsWith('.pdf') || mimeType.includes('pdf')) {
            return <FileType size={18} className="bk-file-preview__icon bk-file-preview__icon--pdf" />;
        }

        // Excel files
        if (
            fileName.endsWith('.xls') ||
            fileName.endsWith('.xlsx') ||
            mimeType.includes('spreadsheet') ||
            mimeType.includes('excel')
        ) {
            return <FileSpreadsheet size={18} className="bk-file-preview__icon bk-file-preview__icon--excel" />;
        }

        // Word documents
        if (
            fileName.endsWith('.doc') ||
            fileName.endsWith('.docx') ||
            mimeType.includes('word') ||
            mimeType.includes('document')
        ) {
            return <FileText size={18} className="bk-file-preview__icon bk-file-preview__icon--word" />;
        }

        // Default text icon
        return <FileText size={18} className="bk-file-preview__icon bk-file-preview__icon--doc" />;
    };

    return (
        <div
            className={`bk-file-preview ${compact ? 'bk-file-preview--compact' : ''} ${onClick && isImage ? 'bk-file-preview--clickable' : ''}`}
            onClick={handleClick}
        >
            <div className="bk-file-preview__thumb">
                {isImage && file.preview
                    ? <img src={file.preview} alt={file.name} className="bk-file-preview__img" />
                    : getFileIcon()
                }
            </div>
            {!compact && (
                <div className="bk-file-preview__info">
                    <span className="bk-file-preview__name">{file.name}</span>
                    <span className="bk-file-preview__size">{formatBytes(file.size)}</span>
                </div>
            )}
            {onRemove && (
                <button className="bk-file-preview__remove" onClick={onRemove} aria-label={`Remove ${file.name}`}>
                    <X size={12} />
                </button>
            )}
        </div>
    );
}
