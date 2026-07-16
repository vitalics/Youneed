// Types for `@youneed/ts-plugin/preview` (the engine ships as plain ESM in
// preview.mjs; these declarations give editors completion on the config).

/** A component prop discovered by the index — name + best-effort type + JSDoc. */
export interface PreviewProp {
  name: string;
  type?: string;
  doc?: string;
}

/** A component the engine found (passed to your `generate` hook). */
export interface PreviewComponent {
  tag: string;
  className: string;
  doc?: string;
  see?: string[];
  props: PreviewProp[];
  fileName?: string;
}

/** What `generate(component)` may return to control a single render. */
export interface PreviewSpec {
  /** Properties to assign on the element (overrides type-sampled defaults). */
  props?: Record<string, unknown>;
  /** Raw markup for the stage instead of mounting `<tag>` (full control). */
  html?: string;
  /** Don't render this component. */
  skip?: boolean;
  /** Min-width (px) of the render stage / screenshot wrapper. */
  width?: number;
  /** Settle delay (ms) before the screenshot, to let a render flush. */
  wait?: number;
}

export interface ComponentPreviewConfig {
  /** Entry file(s) that define the components (their imports register the elements). */
  file: string | string[];
  /** Output dir for the PNGs (PNG mode only). Default: "preview". */
  outDir?: string;
  /** Explicit Chromium binary (PNG mode only). Default: `PW_CHROMIUM_PATH` / bundled. */
  executablePath?: string;
  /** Per-component render control; return nothing to auto-sample props by type. */
  generate?: (component: PreviewComponent) => PreviewSpec | void;
}

/** Identity helper for an editor-typed config (like vite's `defineConfig`). */
export function defineComponentPreview(config: ComponentPreviewConfig): ComponentPreviewConfig;

/** A sample value for a prop, inferred from its declared/initialised type text. */
export function sampleFor(type?: string, tag?: string): string | number | boolean | undefined;

/** Render every component to `<outDir>/<tag>.png` (headless Chromium). Returns the
 *  number of PNGs written. Needs `esbuild`, `typescript`, `playwright-core`. */
export function runComponentPreview(config: ComponentPreviewConfig): Promise<number>;

/** Start a live preview dev-server (browser gallery, re-bundles + reloads on save).
 *  Needs `esbuild` and `typescript`. */
export function serveComponentPreview(config: ComponentPreviewConfig, opts?: { port?: number; host?: string }): Promise<void>;
