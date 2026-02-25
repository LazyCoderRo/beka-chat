# BekaChat Design System & Styling Guide

This document outlines the design philosophy and CSS architecture used in BekaChat.

## 🎨 Theme System

BekaChat uses a token-based styling system with comprehensive light and dark modes.

### Design Tokens
All core styles are defined in `src/index.css` using CSS custom properties:
- **Base Colors**: `--bg-base`, `--bg-surface`, `--bg-elevated`
- **Accents**: `--accent-primary`, `--accent-secondary`, `--accent-subtle`
- **Typography**: `--font-sans`, `--text-base`, `--leading-relaxed`
- **Spacing**: `--space-1` through `--space-12` (modular scale)
- **Status Colors**: Success (Green), Warning (Orange), Error (Red), Info (Blue)
- **Special Modes**: Web search (Blue-cyan), Deep search (Orange-amber)

### Applying a Theme
The theme is applied by setting a `data-theme` attribute on the root `<html>` element.

```css
[data-theme="dark"] {
  /* Dark mode variants */
}
[data-theme="light"] {
  /* Light mode variants */
}
```

## 🏗️ CSS Architecture

1. **Global Styles**: Defined in `src/index.css` (reset, tokens, generic utilities).
2. **Component Styles**: Each component has its own `.css` file accompanying the `.tsx` file.
3. **Naming Convention**: Uses the `bk-` prefix to avoid collisions and provide a clear namespace.
   - Example: `.bk-btn`, `.bk-btn--primary`, `.bk-btn__icon`

## ✨ Glass-morphism & Aesthetics

- **Glass effects**: Use `backdrop-filter: blur(x)` combined with semi-transparent backgrounds.
- **Shadows**: Large, soft shadows for elevated panels (`--shadow-lg`).
- **Transitions**: Fast transitions (150ms) for interaction, normal transitions (300ms) for layout shifts.

## 📐 Spacing Scale

Always use the predefined spacing variables for consistency:
- `var(--space-1)`: 4px
- `var(--space-2)`: 8px
- `var(--space-4)`: 16px
- `var(--space-8)`: 32px
- `var(--space-12)`: 48px
