import './TypographySelector.css';
import { useState, useRef, useEffect } from 'react';
import { Baseline, ChevronDown, Check, Minus, Plus, Palette } from 'lucide-react';
import { useTheme, ACCENT_COLORS, type AccentColor } from '../../context/ThemeContext';

const fontOptions = [
    { value: 'Inter', label: 'Inter' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Lato', label: 'Lato' },
    { value: 'Montserrat', label: 'Montserrat' },
    { value: 'Poppins', label: 'Poppins' },
    { value: 'Source Sans Pro', label: 'Source Sans Pro' },
    { value: 'Raleway', label: 'Raleway' },
    { value: 'Oswald', label: 'Oswald' },
    { value: 'Ubuntu', label: 'Ubuntu' },
    { value: 'Playfair Display', label: 'Playfair Display' },
    { value: 'Merriweather', label: 'Merriweather' },
    { value: 'Roboto Mono', label: 'Roboto Mono' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
    { value: 'Outfit', label: 'Outfit' },
    { value: 'Manrope', label: 'Manrope' },
    { value: 'Sora', label: 'Sora' },
    { value: 'Lexend', label: 'Lexend' },
    { value: 'Space Grotesk', label: 'Space Grotesk' },
];

export function TypographySelector() {
    const {
        fontSizeScale, setFontSizeScale,
        fontFamily, setFontFamily,
        accentColor, setAccentColor
    } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleScaleChange = (delta: number) => {
        const newScale = Math.round((fontSizeScale + delta) * 10) / 10;
        if (newScale >= 0.7 && newScale <= 2.0) {
            setFontSizeScale(newScale);
        }
    };

    return (
        <div className="bk-typo-selector" ref={dropdownRef}>
            <div className="bk-typo-selector__colors">
                <Palette size={14} className="bk-typo-selector__colors-icon" />
                <div className="bk-typo-selector__color-grid">
                    {(Object.keys(ACCENT_COLORS) as AccentColor[]).map((colorKey) => (
                        <button
                            key={colorKey}
                            className={`bk-typo-selector__color-dot ${accentColor === colorKey ? 'active' : ''}`}
                            style={{
                                backgroundColor: ACCENT_COLORS[colorKey].primary,
                                '--color-glow': ACCENT_COLORS[colorKey].glow
                            } as React.CSSProperties}
                            onClick={() => setAccentColor(colorKey)}
                            title={colorKey.charAt(0).toUpperCase() + colorKey.slice(1)}
                        >
                            {accentColor === colorKey && <Check size={10} color="white" />}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bk-typo-selector__controls">
                <div className="bk-typo-selector__scale">
                    <button
                        className="bk-typo-selector__scale-btn"
                        onClick={() => handleScaleChange(-0.1)}
                        disabled={fontSizeScale <= 0.7}
                        title="Decrease font size"
                    >
                        <Minus size={14} />
                    </button>
                    <span className="bk-typo-selector__scale-value">{Math.round(fontSizeScale * 100)}%</span>
                    <button
                        className="bk-typo-selector__scale-btn"
                        onClick={() => handleScaleChange(0.1)}
                        disabled={fontSizeScale >= 2.0}
                        title="Increase font size"
                    >
                        <Plus size={14} />
                    </button>
                </div>

                <button
                    className={`bk-typo-selector__trigger ${isOpen ? 'active' : ''}`}
                    onClick={() => setIsOpen(!isOpen)}
                    title="Change font family"
                >
                    <Baseline size={16} />
                    <span className="bk-typo-selector__current-font">{fontFamily}</span>
                    <ChevronDown size={14} className={`bk-typo-selector__chevron ${isOpen ? 'open' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <div className="bk-typo-selector__dropdown">
                    <div className="bk-typo-selector__header">Select Font</div>
                    <div className="bk-typo-selector__list">
                        {fontOptions.map((option) => (
                            <button
                                key={option.value}
                                className={`bk-typo-selector__item ${fontFamily === option.value ? 'selected' : ''}`}
                                onClick={() => {
                                    setFontFamily(option.value);
                                    setIsOpen(false);
                                }}
                                style={{ fontFamily: option.value }}
                            >
                                <span className="bk-typo-selector__item-label">{option.label}</span>
                                {fontFamily === option.value && <Check size={14} className="bk-typo-selector__check" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

