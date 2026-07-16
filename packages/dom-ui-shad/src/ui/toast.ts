// shad <shad-toaster> + toast() — Sonner-style notifications.
// Put one <shad-toaster></shad-toaster> on the page, then call toast() anywhere:
//   import { toast } from "@youneed/dom-ui-shad";
//   toast("Event created", { description: "Sun, Dec 03", action: { label: "Undo", onClick() {} } });
//   toast.success("Saved"); toast.error("Failed"); toast.loading("Working…");
// toast() dispatches a document event; the toaster renders the stack (fixed,
// positioned, auto-dismiss with hover-pause).

import { Component, html, css, map, when, type OnMount, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

type ToastType = "default" | "success" | "error" | "warning" | "info" | "loading";
export interface ToastOptions {
  description?: string;
  action?: { label: string; onClick: () => void };
  type?: ToastType;
  duration?: number;
  /** Per-toast position; falls back to the toaster's `position`. */
  position?: string;
}
interface ToastRecord extends ToastOptions {
  id: number;
  message: string;
}

let _id = 0;
function emit(message: string, opts: ToastOptions = {}): number {
  const id = ++_id;
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("shad-toast", { detail: { id, message, ...opts } }));
  }
  return id;
}
type ToastFn = ((message: string, opts?: ToastOptions) => number) & {
  success: (m: string, o?: ToastOptions) => number;
  error: (m: string, o?: ToastOptions) => number;
  warning: (m: string, o?: ToastOptions) => number;
  info: (m: string, o?: ToastOptions) => number;
  loading: (m: string, o?: ToastOptions) => number;
  message: (m: string, o?: ToastOptions) => number;
  dismiss: (id?: number) => void;
};
export const toast: ToastFn = Object.assign((m: string, o?: ToastOptions) => emit(m, o), {
  success: (m: string, o?: ToastOptions) => emit(m, { ...o, type: "success" }),
  error: (m: string, o?: ToastOptions) => emit(m, { ...o, type: "error" }),
  warning: (m: string, o?: ToastOptions) => emit(m, { ...o, type: "warning" }),
  info: (m: string, o?: ToastOptions) => emit(m, { ...o, type: "info" }),
  loading: (m: string, o?: ToastOptions) => emit(m, { ...o, type: "loading" }),
  message: (m: string, o?: ToastOptions) => emit(m, o),
  dismiss: (id?: number) =>
    typeof document !== "undefined" && document.dispatchEvent(new CustomEvent("shad-toast-dismiss", { detail: { id } })),
});

const ICONS: Record<string, TemplateResult> = {
  success: html`<svg class="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>`,
  error: html`<svg class="h-4 w-4 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>`,
  warning: html`<svg class="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>`,
  info: html`<svg class="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>`,
  loading: html`<svg class="h-4 w-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>`,
};

@Component.define()
export class ShadToaster extends Component("shad-toaster") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: contents; }
      /* One fixed region per active position; toasts group into their own region. */
      .region { position: fixed; z-index: 100; display: flex; flex-direction: column; gap: 0.75rem; pointer-events: none; }
      .region[data-y="top"] { top: 1.5rem; }
      .region[data-y="bottom"] { bottom: 1.5rem; flex-direction: column-reverse; }
      .region[data-x="right"] { right: 1.5rem; align-items: flex-end; }
      .region[data-x="left"] { left: 1.5rem; align-items: flex-start; }
      .region[data-x="center"] { left: 50%; transform: translateX(-50%); align-items: center; }
      .toast { pointer-events: auto; animation: toastIn 0.2s cubic-bezier(0.21, 1.02, 0.73, 1); }
      @keyframes toastIn { from { opacity: 0; transform: translateY(var(--enter, 1rem)) scale(0.96); } }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) position = "bottom-right";

  #toasts = this.signal<ToastRecord[]>([]);
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  onMount(): void {
    document.addEventListener("shad-toast", (e) => this.#add((e as CustomEvent<ToastRecord>).detail), { signal: this.abortSignal });
    document.addEventListener("shad-toast-dismiss", (e) => {
      const id = (e as CustomEvent<{ id?: number }>).detail?.id;
      if (id == null) this.#toasts.set([]);
      else this.#dismiss(id);
    }, { signal: this.abortSignal });
  }

  #add(t: ToastRecord): void {
    this.#toasts.set([...this.#toasts(), t]);
    if (t.type !== "loading") this.#arm(t.id, t.duration ?? 4000);
  }
  #arm(id: number, ms: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.set(id, setTimeout(() => this.#dismiss(id), ms));
  }
  #dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.#toasts.set(this.#toasts().filter((t) => t.id !== id));
  }

  override render() {
    // Group toasts by their effective position; render one fixed region each so
    // changing the position only affects NEW toasts (existing ones stay put).
    const groups = new Map<string, ToastRecord[]>();
    for (const t of this.#toasts()) {
      const pos = t.position || this.position || "bottom-right";
      (groups.get(pos) ?? groups.set(pos, []).get(pos)!).push(t);
    }
    return html`${map(
      [...groups.entries()],
      ([pos, list]) => {
        const [y, x] = pos.split("-");
        return html`<div class="region" data-y=${y} data-x=${x} style=${`--enter:${y === "top" ? "-1rem" : "1rem"}`}>
          ${map(list, (t) => this.#card(t))}
        </div>`;
      },
    )}`;
  }

  #card(t: ToastRecord) {
    const icon = t.type && t.type !== "default" ? ICONS[t.type] : null;
    return html`<div
      role="status"
      class="toast flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
      @pointerenter=${() => clearTimeout(this.#timers.get(t.id))}
      @pointerleave=${() => t.type !== "loading" && this.#arm(t.id, t.duration ?? 4000)}
    >
      ${when(icon, () => html`<span class="mt-0.5 shrink-0">${icon}</span>`)}
      <div class="flex-1">
        <div class="font-medium leading-tight">${t.message}</div>
        ${when(t.description, () => html`<div class="mt-1 text-sm text-muted-foreground">${t.description}</div>`)}
      </div>
      ${when(
        t.action,
        () => html`<button
          class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          @click=${() => { t.action!.onClick(); this.#dismiss(t.id); }}
        >${t.action!.label}</button>`,
      )}
      <button
        aria-label="Close"
        class="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
        @click=${() => this.#dismiss(t.id)}
      ><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
    </div>`;
  }
}
