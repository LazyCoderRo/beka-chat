import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CustomDropdown.css';

export interface DropdownOption {
    id: string;
    name: string;
    icon?: ReactNode;
    meta?: string;
    subMeta?: ReactNode;
}

interface CustomDropdownProps {
    options: DropdownOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    icon?: ReactNode;
    style?: React.CSSProperties;
}

export function CustomDropdown({ options, value, onChange, placeholder = 'Select an option', label, icon, style }: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="bk-custom-dropdown" ref={dropdownRef} style={style}>
            <button
                className={`bk-custom-dropdown__trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                type="button"
            >
                {icon && <span className="bk-custom-dropdown__icon">{icon}</span>}
                <span className="bk-custom-dropdown__name">{selectedOption?.name || placeholder}</span>
                <ChevronDown size={14} className={`bk-custom-dropdown__chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="bk-custom-dropdown__menu">
                    {label && <div className="bk-custom-dropdown__header">{label}</div>}
                    <div className="bk-custom-dropdown__list">
                        {options.length === 0 ? (
                            <div className="bk-custom-dropdown__empty">No options available</div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.id}
                                    className={`bk-custom-dropdown__item ${value === option.id ? 'selected' : ''}`}
                                    onClick={() => {
                                        onChange(option.id);
                                        setIsOpen(false);
                                    }}
                                    type="button"
                                >
                                    <div className="bk-custom-dropdown__item-info">
                                        <div className="bk-custom-dropdown__item-name">
                                            {option.name}
                                            {value === option.id && <Check size={14} className="bk-custom-dropdown__check" />}
                                        </div>
                                        {(option.meta || option.subMeta) && (
                                            <div className="bk-custom-dropdown__item-meta">
                                                {option.meta && <span className="bk-custom-dropdown__provider">{option.meta}</span>}
                                                {option.subMeta && <div className="bk-custom-dropdown__caps">{option.subMeta}</div>}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
