import './AuthPages.css';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Bot, Mail, CheckCircle2 } from 'lucide-react';

export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isSent, setIsSent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await new Promise(r => setTimeout(r, 1000));
        setIsLoading(false);
        setIsSent(true);
    };

    return (
        <div className="bk-auth-page">
            <div className="bk-auth-card">
                <div className="bk-auth-header">
                    <div className="bk-auth-logo">
                        <Bot size={28} />
                    </div>
                    <h1 className="bk-auth-title">Reset password</h1>
                    <p className="bk-auth-sub">
                        {isSent
                            ? "Check your email for the reset link"
                            : "We'll send you a link to reset your password"}
                    </p>
                </div>

                {isSent ? (
                    <div className="bk-auth-success">
                        <CheckCircle2 size={48} className="bk-auth-success-icon" />
                        <p>Verification email sent to <strong>{email}</strong></p>
                        <Button variant="secondary" fullWidth onClick={() => setIsSent(false)}>
                            Try another email
                        </Button>
                    </div>
                ) : (
                    <form className="bk-auth-form" onSubmit={handleSubmit}>
                        <Input
                            label="Email address"
                            type="email"
                            placeholder="name@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            leftIcon={<Mail size={16} />}
                            required
                        />

                        <Button type="submit" isLoading={isLoading} fullWidth>
                            Send reset link
                        </Button>
                    </form>
                )}

                <div className="bk-auth-footer">
                    <Link to="/login">Back to sign in</Link>
                </div>
            </div>
        </div>
    );
}
