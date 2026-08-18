# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** SkillSage
**Generated:** 2026-08-18 00:00:00
**Category:** Productivity Tool
**Design Dials:** Variance 2/10 (Native / Minimal) | Motion 2/10 (Subtle) | Density 4/10 (Standard)

## Project Specification Overrides

The attached project specifications remain authoritative for product behavior and desktop constraints. The confirmed visual direction is now: preview 01 as light mode and preview 03 as dark mode. Use system fonts, CSS radius variables, 4px spacing increments, semantic Tailwind tokens, and only `shadow-sm` / `shadow-lg`; the generated recommendations below are secondary guidance.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0D9488` light / `#75E6D7` dark | `--app-color-primary` |
| On Primary | `#FFFFFF` light / `#0B0D11` dark | `--color-on-primary` |
| Secondary | `#EEF1F4` light / `#171D25` dark | `--app-color-secondary` |
| On Secondary | `#27313C` light / `#E6ECEE` dark | `--color-on-secondary` |
| Accent/CTA | Teal active states; white dark-mode primary buttons | `--app-color-accent` |
| On Accent/CTA | `#FFFFFF` light / `#0B0D11` dark | `--color-on-accent` |
| Background | `#F5F6F8` light / `#0B0D11` dark | `--app-color-background` |
| Foreground | `#17202A` light / `#F1F5F6` dark | `--app-color-foreground` |
| Card | `#FFFFFF` light / `#11161D` dark | `--app-color-card` |
| Card Foreground | `#17202A` light / `#F1F5F6` dark | `--app-color-card-foreground` |
| Muted | `#EEF1F4` light / `#171D25` dark | `--app-color-muted` |
| Muted Foreground | `#718096` light / `#8B96A3` dark | `--app-color-muted-foreground` |
| Border | `#E1E6EB` light / `#29313B` dark | `--app-color-border` |
| Destructive | `#C2413D` light / `#F08078` dark | `--app-color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#16A39A` light / `#75E6D7` dark | `--app-color-ring` |

**Color Notes:** Light mode uses a near-white Swiss utility canvas; dark mode uses an OLED workbench canvas. Teal is reserved for active navigation, status, links, and focus, while dark-mode primary action buttons use the foreground color for a quiet high-contrast treatment.

### Typography

- **Heading Font:** System sans-serif
- **Body Font:** System sans-serif
- **Mood:** calm, precise, spacious, professional, high-end utility
- **Font Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`

### Spacing Variables

*Density: 4/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #0D9488;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0D9488;
  border: 1px solid #E1E6EB;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E1E6EB;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #0D9488;
  outline: none;
  box-shadow: 0 0 0 3px #0D948820;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow-lg);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Minimalism & Swiss Style

**Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential

**Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools

**Key Effects:** Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Page Pattern

**Pattern Name:** Product Demo + Features

- **Conversion Strategy:** Use an interactive demo only when it explains value better than static media. Provide captions, transcript, visible play/pause controls, and a non-video fallback; do not autoplay under reduced motion. Pause media when offscreen or hidden and keep the final product state available as static content.
- **CTA Placement:** Video center + CTA right/bottom
- **Section Order:** Hero > Product video/mockup (center) > Feature breakdown per section > Comparison (optional) > CTA

---

## Motion

**Scroll Reveal** (Subtle) — Trigger: scroll (viewport enter) | Duration: 300-400ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger); Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep the y offset small (8-16px) so it reads as a fade, not a slide
- ❌ Don't reveal below-the-fold content needed for SEO/crawlers as invisible-by-default without a no-JS fallback
- ⚡ toggleActions 'play none none reverse' avoids re-triggering on every scroll direction change

---

## Anti-Patterns (Do NOT Use)

- ❌ Complex onboarding
- ❌ Slow performance

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Desktop baseline: minimum 1200×800; resizable and maximizable
- [ ] No content hidden behind fixed navbars
- [ ] No mobile-specific layout branch is required
