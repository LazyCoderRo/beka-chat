import './AuthPages.css';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Bot, Mail, Lock, User, ArrowRight } from 'lucide-react';

export function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await register(name, email, password);
        setIsLoading(false);
        navigate('/chat');
    };

    return (
        <div className="bk-auth-page">
            <div className="bk-auth-card">
                <div className="bk-auth-header">
                    <div className="bk-auth-logo">
                        <Bot size={28} />
                    </div>
                    <h1 className="bk-auth-title">Create account</h1>
                    <p className="bk-auth-sub">Join BekaChat to start chatting with AI</p>
                </div>

                <form className="bk-auth-form" onSubmit={handleSubmit}>
                    <Input
                        label="Full Name"
                        placeholder="Alex Rivera"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        leftIcon={<User size={16} />}
                        required
                        autoComplete="name"
                    />
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
                    <Input
                        label="Password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        leftIcon={<Lock size={16} />}
                        required
                        hint="Must be at least 8 characters"
                        autoComplete="new-password"
                    />

                    <Button
                        type="submit"
                        isLoading={isLoading}
                        fullWidth
                        rightIcon={<ArrowRight size={16} />}
                    >
                        Get started
                    </Button>
                </form>

                <div className="bk-auth-footer">
                    Already have an account? <Link to="/login">Sign in</Link>
                </div>
            </div>
        </div>
    );
}
