# BekaChat Project Rules & Best Practices

To maintain a high-quality, maintainable codebase, all contributions must follow these rules.

## 🚀 General Principles

1. **Type Safety First**: Use TypeScript for all files. Avoid `any`. Define interfaces in `src/types/index.ts`.
2. **Modular Architecture**: Keep components small and focused. One component per file with its own CSS.
3. **Vanilla CSS Utility**: Use CSS custom properties for theming. Avoid inline styles unless dynamic.
4. **Mock Driven Development**: Use `src/data/mockData.ts` for UI development until backend integration is ready.

## 📁 Directory Structure

- `src/components/`: Reusable UI elements.
  - `shared/`: Generic components (Button, Input, Modal).
  - `layout/`: App shell components (Sidebar, Header).
  - `chat/`: Chat-specific logic (MessageBubble, ChatInput).
- `src/context/`: Global state management.
- `src/pages/`: Top-level route components.
- `src/types/`: Shared TypeScript definitions.

## 🛠️ Code Conventions

- **Functional Components**: Use `export function ComponentName() {}`.
- **Hooks**: Use custom hooks for complex logic (e.g., `useTheme`, `useAuth`).
- **Imports**: Organize imports by: Core (React), Components, Hooks/Context, Types, Styles.
- **Props**: Destructure props in the function signature.

## 🎨 Design Rules

- **Responsiveness**: Use Flexbox and Grid. Ensure the sidebar collapses correctly on narrow screens.
- **Micro-interactions**: Use transitions for hover and active states.
- **Accessibility**: Use semantic HTML (`<main>`, `<aside>`, `<nav>`, `<button>`). Include `aria-label` where text is not visible.
