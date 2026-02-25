/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Theme } from '../types';

export const ACCENT_COLORS = {
    indigo: { primary: '#6c63ff', secondary: '#9f97ff', glow: 'rgba(108, 99, 255, 0.25)', subtle: 'rgba(108, 99, 255, 0.12)', border: 'rgba(108, 99, 255, 0.4)' },
    pink: { primary: '#ff63b1', secondary: '#ff9ecf', glow: 'rgba(255, 99, 177, 0.25)', subtle: 'rgba(255, 99, 177, 0.12)', border: 'rgba(255, 99, 177, 0.4)' },
    cyan: { primary: '#00d2ff', secondary: '#70eaff', glow: 'rgba(0, 210, 255, 0.25)', subtle: 'rgba(0, 210, 255, 0.12)', border: 'rgba(0, 210, 255, 0.4)' },
    emerald: { primary: '#00c896', secondary: '#53ebb9', glow: 'rgba(0, 200, 150, 0.25)', subtle: 'rgba(0, 200, 150, 0.12)', border: 'rgba(0, 200, 150, 0.4)' },
    orange: { primary: '#ff8c42', secondary: '#ffb38a', glow: 'rgba(255, 140, 66, 0.25)', subtle: 'rgba(255, 140, 66, 0.12)', border: 'rgba(255, 140, 66, 0.4)' },
    gold: { primary: '#f3c623', secondary: '#f7d766', glow: 'rgba(243, 198, 35, 0.25)', subtle: 'rgba(243, 198, 35, 0.12)', border: 'rgba(243, 198, 35, 0.4)' },
    rose: { primary: '#e84545', secondary: '#f07b7b', glow: 'rgba(232, 69, 69, 0.25)', subtle: 'rgba(232, 69, 69, 0.12)', border: 'rgba(232, 69, 69, 0.4)' },
    violet: { primary: '#af40ff', secondary: '#d59eff', glow: 'rgba(175, 64, 255, 0.25)', subtle: 'rgba(175, 64, 255, 0.12)', border: 'rgba(175, 64, 255, 0.4)' },
} as const;

export type AccentColor = keyof typeof ACCENT_COLORS;

interface ThemeContextValue {
    theme: Theme;
    fontSizeScale: number;
    fontFamily: string;
    accentColor: AccentColor;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
    setFontSizeScale: (scale: number) => void;
    setFontFamily: (font: string) => void;
    setAccentColor: (color: AccentColor) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'bekachat-theme';
const FONT_SIZE_STORAGE_KEY = 'bekachat-font-size-scale';
const FONT_FAMILY_STORAGE_KEY = 'bekachat-font-family';
const ACCENT_COLOR_STORAGE_KEY = 'bekachat-accent-color';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
        if (stored === 'light' || stored === 'dark') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    const [fontSizeScale, setFontSizeScaleState] = useState<number>(() => {
        const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
        return stored ? parseFloat(stored) : 1.0;
    });

    const [fontFamily, setFontFamilyState] = useState<string>(() => {
        const stored = localStorage.getItem(FONT_FAMILY_STORAGE_KEY);
        return stored || 'Inter';
    });

    const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
        const stored = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY) as AccentColor | null;
        return stored && ACCENT_COLORS[stored] ? stored : 'indigo';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    useEffect(() => {
        document.documentElement.style.setProperty('--font-size-scale', fontSizeScale.toString());
        localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSizeScale.toString());
    }, [fontSizeScale]);

    useEffect(() => {
        const fullFontName = fontFamily.includes(' ') ? `'${fontFamily}'` : fontFamily;
        document.documentElement.style.setProperty('--font-family-selected', fullFontName);
        localStorage.setItem(FONT_FAMILY_STORAGE_KEY, fontFamily);
    }, [fontFamily]);

    useEffect(() => {
        const colors = ACCENT_COLORS[accentColor];
        const root = document.documentElement;

        root.style.setProperty('--accent-primary', colors.primary);
        root.style.setProperty('--accent-secondary', colors.secondary);
        root.style.setProperty('--accent-glow', colors.glow);
        root.style.setProperty('--accent-subtle', colors.subtle);

        // Update dependent tokens
        root.style.setProperty('--text-accent', colors.secondary);
        root.style.setProperty('--border-accent', colors.border);
        root.style.setProperty('--shadow-accent', `0 0 24px ${colors.glow}`);
        root.style.setProperty('--input-focus-border', colors.border);

        localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor);
    }, [accentColor]);


    const setTheme = (t: Theme) => setThemeState(t);
    const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
    const setFontSizeScale = (scale: number) => setFontSizeScaleState(scale);
    const setFontFamily = (font: string) => setFontFamilyState(font);
    const setAccentColor = (color: AccentColor) => setAccentColorState(color);

    return (
        <ThemeContext.Provider value={{
            theme,
            toggleTheme,
            setTheme,
            fontSizeScale,
            setFontSizeScale,
            fontFamily,
            setFontFamily,
            accentColor,
            setAccentColor
        }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
    return ctx;
}


