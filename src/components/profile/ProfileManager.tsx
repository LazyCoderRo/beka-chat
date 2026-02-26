import './ProfileManager.css';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { UserAvatar } from './UserAvatar';
import { X, Check } from 'lucide-react';

const AVATAR_OPTIONS = Array.from({ length: 12 }, (_, i) => `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${i + 1}`);

export function ProfileManager() {
    const { user, updateProfile } = useAuth();
    const [isSaved, setIsSaved] = useState(false);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    if (!user) return null;

    const handleSave = async () => {
        if (password && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        try {
            setError('');
            await updateProfile({
                name: name !== user.name ? name : undefined,
                email: email !== user.email ? email : undefined,
                password: password || undefined,
                avatarUrl: avatarUrl !== user.avatarUrl ? avatarUrl : undefined
            });
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
            setPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setError(err.message || 'Failed to save profile');
        }
    };

    return (
        <div className="bk-profile-manager" style={{ display: 'block', padding: '20px' }}>
            <main className="bk-profile-manager__content">
                <section className="bk-profile-section">
                    <h3 className="bk-profile-section__title">Profile & Security Settings</h3>

                    {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

                    <div className="bk-profile-avatar-edit">
                        <UserAvatar user={{ ...user, avatarUrl: avatarUrl }} size="lg" />
                        <div className="bk-profile-avatar-actions">
                            <Button variant="secondary" size="sm" onClick={() => setIsAvatarModalOpen(true)}>Change avatar</Button>
                        </div>
                    </div>

                    <div className="bk-profile-form">
                        <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
                        <Input label="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} />

                        <div style={{ marginTop: '20px' }}>
                            <h4 style={{ marginBottom: '10px' }}>Change Password (Optional)</h4>
                            <Input label="New Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                        </div>

                        <div className="bk-profile-actions">
                            <Button variant="primary" onClick={handleSave} leftIcon={isSaved ? <Check size={16} /> : undefined}>
                                {isSaved ? 'Saved' : 'Save changes'}
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            {isAvatarModalOpen && (
                <div className="bk-modal-overlay" onClick={() => setIsAvatarModalOpen(false)}>
                    <div className="bk-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', padding: '20px' }}>
                        <div className="bk-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 className="bk-modal-title">Select Avatar</h2>
                            <button className="bk-modal-close" onClick={() => setIsAvatarModalOpen(false)}>
                                <X size={24} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center' }}>
                            {AVATAR_OPTIONS.map((url, i) => (
                                <img
                                    key={i}
                                    src={url}
                                    alt={`Avatar ${i}`}
                                    style={{
                                        width: '80px', height: '80px', borderRadius: '50%', cursor: 'pointer',
                                        border: avatarUrl === url ? '3px solid var(--accent-primary)' : '3px solid transparent'
                                    }}
                                    onClick={() => {
                                        setAvatarUrl(url);
                                        setIsAvatarModalOpen(false);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
