// Shared <head> pieces for the site's Pages — fonts, favicon, tokens.
import { Meta, Link } from "@youneed/ssr";

export const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='2' y='2' width='12' height='12' rx='2' fill='%233a63d8'/%3E%3C/svg%3E";

export const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

/** Head entries common to every page (order: viewport → icon → fonts → tokens). */
export function baseHead(): string[] {
  return [
    // Overrides the default viewport (later meta wins) — footer uses safe-area insets.
    Meta({ name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }),
    Link({ rel: "icon", href: ICON }),
    Link({ rel: "preconnect", href: "https://fonts.googleapis.com" }),
    Link({ rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true }),
    Link({ rel: "stylesheet", href: FONTS_CSS }),
    Link({ rel: "stylesheet", href: "/tokens.css" }),
  ];
}
