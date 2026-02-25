import './ProfilePage.css';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { UserAvatar } from '../components/profile/UserAvatar';
import { User, Settings, Shield, CreditCard, ChevronRight, Check } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

type Tab = 'profile' | 'settings' | 'security' | 'billing';

export function ProfilePage() {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = (searchParams.get('tab') as Tab) || 'profile';
    const [isSaved, setIsSaved] = useState(false);

    if (!user) return null;

    const handleSave = () => {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    return (
        <div className="bk-profile-page">
            <div className="bk-profile-container">
                <aside className="bk-profile-nav">
                    <h2 className="bk-profile-nav__title">Account</h2>
                    <nav className="bk-profile-nav__list">
                        <button
                            className={`bk-profile-nav__item ${activeTab === 'profile' ? 'active' : ''}`}
                            onClick={() => setSearchParams({ tab: 'profile' })}
                        >
                            <User size={18} />
                            <span>Profile</span>
                            <ChevronRight size={14} className="bk-profile-nav__arrow" />
                        </button>
                        <button
                            className={`bk-profile-nav__item ${activeTab === 'settings' ? 'active' : ''}`}
                            onClick={() => setSearchParams({ tab: 'settings' })}
                        >
                            <Settings size={18} />
                            <span>Settings</span>
                            <ChevronRight size={14} className="bk-profile-nav__arrow" />
                        </button>
                        <button
                            className={`bk-profile-nav__item ${activeTab === 'security' ? 'active' : ''}`}
                            onClick={() => setSearchParams({ tab: 'security' })}
                        >
                            <Shield size={18} />
                            <span>Security</span>
                            <ChevronRight size={14} className="bk-profile-nav__arrow" />
                        </button>
                        <button
                            className={`bk-profile-nav__item ${activeTab === 'billing' ? 'active' : ''}`}
                            onClick={() => setSearchParams({ tab: 'billing' })}
                        >
                            <CreditCard size={18} />
                            <span>Billing</span>
                            <ChevronRight size={14} className="bk-profile-nav__arrow" />
                        </button>
                    </nav>
                </aside>

                <main className="bk-profile-content">
                    {activeTab === 'profile' && (
                        <section className="bk-profile-section">
                            <h1 className="bk-profile-section__title">Public Profile</h1>
                            <div className="bk-profile-avatar-edit">
                                <UserAvatar user={user} size="lg" />
                                <div className="bk-profile-avatar-actions">
                                    <Button variant="secondary" size="sm">Change avatar</Button>
                                    <p className="bk-profile-help">JPG, GIF or PNG. 1MB max.</p>
                                </div>
                            </div>

                            <div className="bk-profile-form">
                                <Input label="Full Name" defaultValue={user.name} />
                                <Input label="Email Address" defaultValue={user.email} disabled hint="Email cannot be changed" />
                                <div className="bk-profile-actions">
                                    <Button variant="primary" onClick={handleSave} leftIcon={isSaved ? <Check size={16} /> : undefined}>
                                        {isSaved ? 'Saved' : 'Save changes'}
                                    </Button>
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === 'settings' && (
                        <section className="bk-profile-section">
                            <h1 className="bk-profile-section__title">App Settings</h1>
                            <div className="bk-settings-list">
                                <div className="bk-settings-item">
                                    <div className="bk-settings-info">
                                        <span className="bk-settings-label">Sound Effects</span>
                                        <span className="bk-settings-desc">Play sounds for incoming messages</span>
                                    </div>
                                    <input type="checkbox" className="bk-toggle" defaultChecked />
                                </div>
                                <div className="bk-settings-item">
                                    <div className="bk-settings-info">
                                        <span className="bk-settings-label">Desktop Notifications</span>
                                        <span className="bk-settings-desc">Receive notifications when app is in background</span>
                                    </div>
                                    <input type="checkbox" className="bk-toggle" defaultChecked />
                                </div>
                                <div className="bk-settings-item">
                                    <div className="bk-settings-info">
                                        <span className="bk-settings-label">Markdown Rendering</span>
                                        <span className="bk-settings-desc">Enable rich text rendering for AI responses</span>
                                    </div>
                                    <input type="checkbox" className="bk-toggle" defaultChecked />
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === 'security' && (
                        <section className="bk-profile-section">
                            <h1 className="bk-profile-section__title">Security</h1>
                            <div className="bk-profile-form">
                                <Input label="Current Password" type="password" />
                                <Input label="New Password" type="password" />
                                <Input label="Confirm New Password" type="password" />
                                <div className="bk-profile-actions">
                                    <Button variant="primary" onClick={handleSave}>Update password</Button>
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === 'billing' && (
                        <section className="bk-profile-section">
                            <h1 className="bk-profile-section__title">Billing & Subscription</h1>
                            <div className="bk-billing-card">
                                <div className="bk-billing-header">
                                    <div className="bk-billing-info">
                                        <span className="bk-billing-plan">Free Plan</span>
                                        <span className="bk-billing-price">$0/month</span>
                                    </div>
                                    <Button variant="accent-outline" size="sm">Upgrade to Pro</Button>
                                </div>
                                <div className="bk-billing-features">
                                    <ul>
                                        <li>1,000 messages / month</li>
                                        <li>Standard AI models</li>
                                        <li>Web search access</li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
}
