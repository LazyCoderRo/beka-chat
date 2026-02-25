# BekaChat Component Development Guide

This guide helps you create consistent and high-quality UI components for BekaChat.

## 📦 Component Structure

Every component should follow this folder/file pattern:
```
src/components/[category]/[ComponentName].tsx
src/components/[category]/[ComponentName].css
```

### Example Template

```tsx
import './MyComponent.css';
import type { ReactNode } from 'react';

interface MyComponentProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function MyComponent({ title, children, className = '' }: MyComponentProps) {
  return (
    <div className={`bk-my-comp ${className}`}>
      <h3 className="bk-my-comp__title">{title}</h3>
      <div className="bk-my-comp__body">{children}</div>
    </div>
  );
}
```

## 💅 Styling Patterns

Use the `bk-` prefix for all classes to avoid naming conflicts.

```css
.bk-my-comp {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.bk-my-comp__title {
  color: var(--text-primary);
  font-weight: var(--weight-semi);
}
```

## 🧱 Shared Components Usage

| Component | Props Highlights | When to use |
|-----------|------------------|-------------|
| `Button`  | `variant`, `size`, `isLoading`, `leftIcon` | All clickable actions. |
| `Input`   | `label`, `error`, `leftIcon`, `hint` | Forms and data entry. |
| `Badge`   | `variant` (default, accent, etc.) | Status tags, mode indicators. |
| `Spinner` | `size` (sm, md, lg) | Loading states. |

## 🧪 Testing Guidelines

- Ensure components render correctly in both **Dark** and **Light** modes.
- Test keyboard navigation (Tab through focusable elements).
- Check responsiveness by resizing the browser.
