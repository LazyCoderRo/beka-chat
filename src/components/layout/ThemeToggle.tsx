import './ThemeToggle.css';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            className="bk-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            <span className={`bk-theme-toggle__track ${theme === 'dark' ? 'bk-theme-toggle__track--dark' : 'bk-theme-toggle__track--light'}`}>
                <span className="bk-theme-toggle__thumb">
                    {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                </span>
            </span>
        </button>
    );
}
