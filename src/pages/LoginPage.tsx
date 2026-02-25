import './AuthPages.css';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Bot, Mail, Lock, ArrowRight } from 'lucide-react';

export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        setIsLoading(true);
        setError('');

        try {
            await login(email, password);
            navigate('/chat');
        } catch (err) {
            console.error('Login error:', err);
            setError('Invalid email or password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bk-auth-page">
            <div className="bk-auth-card">
                <div className="bk-auth-header">
                    <div className="bk-auth-logo">
                        <Bot size={28} />
                    </div>
                    <h1 className="bk-auth-title">Welcome back</h1>
                    <p className="bk-auth-sub">Log in to your BekaChat account</p>
                </div>

                <form className="bk-auth-form" onSubmit={handleSubmit}>
                    <Input
                        label="Email address"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        leftIcon={<Mail size={16} />}
                        required
                        autoComplete="email"
                    />
                    <div className="bk-auth-field-wrap">
                        <Input
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            leftIcon={<Lock size={16} />}
                            required
                            autoComplete="current-password"
                        />
                        <Link to="/forgot-password" className="bk-auth-link-inline">
                            Forgot?
                        </Link>
                    </div>

                    {error && <p className="bk-auth-error">{error}</p>}

                    <Button
                        type="submit"
                        isLoading={isLoading}
                        fullWidth
                        rightIcon={<ArrowRight size={16} />}
                    >
                        Sign in
                    </Button>
                </form>

                <div className="bk-auth-footer">
                    Don't have an account? <Link to="/register">Create one</Link>
                </div>
            </div>
        </div>
    );
}
