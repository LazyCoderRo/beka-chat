import './Spinner.css';

interface SpinnerProps { size?: 'sm' | 'md' | 'lg'; className?: string; }

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
    return <span className={`bk-spinner bk-spinner--${size} ${className}`} aria-label="Loading" role="status" />;
}

export function LoadingDots({ className = '' }: { className?: string }) {
    return (
        <span className={`bk-dots ${className}`} aria-label="Loading" role="status">
            <span className="bk-dots__dot" />
            <span className="bk-dots__dot" />
            <span className="bk-dots__dot" />
        </span>
    );
}
