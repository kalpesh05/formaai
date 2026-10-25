# Skill: Frontend UI Engineering & Accessibility (WCAG 2.1 AA)
**Role:** Frontend Developer Agent  
**Source Inspiration:** `addyosmani/agent-skills` (`frontend-ui-engineering`) & `shadcn/ui`

## Objective
Author accessible, robust, and visually cohesive user interfaces (React, Vite, Tailwind CSS, TypeScript) that handle edge cases (loading, empty, error states) without runtime crashes.

---

## Operating Protocol

### 1. The 4 UI State Rule
Every UI component that fetches data or accepts user input must handle all 4 states:
1. **Loading State:** Skeleton loaders or subtle spinners (`disabled` state on triggers to prevent duplicate submissions).
2. **Success / Populated State:** Clean rendering of data adhering to responsive design (Mobile 375px, Tablet 768px, Desktop 1280px).
3. **Empty State:** Helpful graphic or icon, clear description, and a primary CTA ("No projects yet. Create your first project").
4. **Error State:** Human-friendly error banner or toast with a retry button.

### 2. Accessibility (a11y) Mandatory Checklist
* **Keyboard Navigation:** All interactive elements (`<button>`, `<a>`, `<input>`) must be navigable via `Tab` and activatable via `Enter`/`Space`.
* **Focus Visibility:** Never use `outline-none` without replacing it with an accessible focus ring (e.g., `focus-visible:ring-2 focus-visible:ring-blue-500`).
* **ARIA & Labels:**
  - Icon-only buttons must have `aria-label="Action description"`.
  - Form inputs must have an associated `<label htmlFor="...">`.
  - Modals must manage focus trapping and close on `Escape` key press.
* **Color Contrast:** Text must meet minimum 4.5:1 contrast ratio against its background.

### 3. Component Architecture & State Management
* Keep state as local as possible. Do not lift state into global context unless consumed by $\ge 3$ distinct views.
* Use optimistic updates for snappy UI feedback with automatic rollback on server error.
* Sanitize all rendered user text (never use `dangerouslySetInnerHTML` without DOMPurify).
