# Skill: Web Performance & Core Web Vitals
**Role:** Frontend Developer Agent  
**Source Inspiration:** `addyosmani/agent-skills` (`web-performance`)

## Objective
Ensure all client code achieves top-tier performance (LCP < 2.5s, CLS < 0.1, INP < 200ms) with zero memory leaks and minimal JS bundle overhead.

---

## Operating Protocol

### 1. Cumulative Layout Shift (CLS) Prevention
* Always reserve width and height dimensions for images, video embeds, and dynamic widgets (`aspect-ratio` or fixed dimensions) before assets load.
* Never insert dynamic DOM elements (e.g., banners, cookie notices) above the viewport fold without reserving space.

### 2. React Rendering & Memory Leak Guardrails
* **Timer & Listener Cleanup:** Every `useEffect` attaching `addEventListener`, `setInterval`, or `setTimeout` MUST return a cleanup callback:
  ```typescript
  useEffect(() => {
    const handleResize = () => { /* ... */ };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  ```
* **Memoization Discipline:** Wrap expensive data transformations or filtered lists in `useMemo`. Wrap callbacks passed to memoized children in `useCallback`.
* **Code Splitting:** Lazy-load non-critical routes and heavyweight modals via `React.lazy()` and `Suspense`.

### 3. Network & Asset Optimization
* Optimize images (WebP/AVIF format, modern responsive `srcset`).
* Debounce rapid user input events (search inputs, auto-save sliders) by 300–400ms before triggering network requests.
