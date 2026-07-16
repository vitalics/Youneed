// shad sidebar — a composable, collapsible app sidebar.
//   <shad-sidebar-provider>
//     <shad-sidebar>
//       <shad-sidebar-header>…</shad-sidebar-header>
//       <shad-sidebar-content>
//         <shad-sidebar-group>
//           <shad-sidebar-group-label>Platform</shad-sidebar-group-label>
//           <shad-sidebar-menu>
//             <shad-sidebar-menu-item>
//               <shad-sidebar-menu-button active><svg/><span>Playground</span></shad-sidebar-menu-button>
//             </shad-sidebar-menu-item>
//           </shad-sidebar-menu>
//         </shad-sidebar-group>
//       </shad-sidebar-content>
//       <shad-sidebar-footer>…</shad-sidebar-footer>
//     </shad-sidebar>
//     <shad-sidebar-inset><shad-sidebar-trigger></shad-sidebar-trigger> … </shad-sidebar-inset>
//   </shad-sidebar-provider>
//
// The provider owns open/collapsed state (toggled by the trigger, the rail, or
// Ctrl/Cmd+B) and exposes it as data-state; the sidebar collapses to an icon rail
// via :host-context, hiding slotted text labels. No context API needed.

import { Component, html, css, type OnMount, type OnUpdate } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

// Sidebar surface (a subtle gray, like shadcn's --sidebar).
const SURFACE = "background: hsl(var(--sidebar));";

@Component.define()
export class ShadSidebarProvider extends Component("shad-sidebar-provider") implements OnMount, OnUpdate {
  static styles = [
    tw,
    css`
      :host {
        display: flex;
        width: 100%;
        min-height: 100%;
        --sidebar-width: 16rem;
        --sidebar-width-icon: 3.25rem;
      }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) open = true;

  toggle(): void {
    this.open = !this.open;
  }

  onMount(): void {
    // A Tailwind named group: descendants opt into collapse styling via
    // `group-data-[state=collapsed]/sidebar:…` (host-context can't reach the
    // deeply-slotted light-DOM labels). data-state is set below.
    this.classList.add("group/sidebar");
    this.dataset.state = this.open ? "expanded" : "collapsed";
    this.addEventListener("sidebartoggle", () => this.toggle(), { signal: this.abortSignal });
    addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && (e as KeyboardEvent).key.toLowerCase() === "b") {
        e.preventDefault();
        this.toggle();
      }
    }, { signal: this.abortSignal });
  }
  onUpdate(): void {
    this.dataset.state = this.open ? "expanded" : "collapsed";
  }

  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadSidebar extends Component("shad-sidebar") {
  static styles = [
    tw,
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: var(--sidebar-width);
        flex-shrink: 0;
        border-right: 1px solid hsl(var(--sidebar-border));
        ${SURFACE}
        transition: width 0.2s ease;
        overflow: hidden;
      }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { width: var(--sidebar-width-icon); }
      slot { display: contents; }
    `,
  ];
  override render() {
    return html`<slot></slot>`;
  }
}

// --- layout regions (thin styled wrappers) --------------------------------

@Component.define()
export class ShadSidebarHeader extends Component("shad-sidebar-header") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() { return html`<div class="flex flex-col gap-2 p-2"><slot></slot></div>`; }
}
@Component.define()
export class ShadSidebarFooter extends Component("shad-sidebar-footer") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() { return html`<div class="mt-auto flex flex-col gap-2 p-2"><slot></slot></div>`; }
}
@Component.define()
export class ShadSidebarContent extends Component("shad-sidebar-content") {
  static styles = [tw, css`:host { display: flex; min-height: 0; flex: 1 1 0%; flex-direction: column; } slot { display: contents; }`];
  override render() { return html`<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2"><slot></slot></div>`; }
}
@Component.define()
export class ShadSidebarGroup extends Component("shad-sidebar-group") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() { return html`<div class="relative flex w-full min-w-0 flex-col p-2"><slot></slot></div>`; }
}
@Component.define()
export class ShadSidebarGroupContent extends Component("shad-sidebar-group-content") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() { return html`<div class="w-full text-sm"><slot></slot></div>`; }
}
@Component.define()
export class ShadSidebarMenu extends Component("shad-sidebar-menu") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() { return html`<ul class="flex w-full min-w-0 flex-col gap-1"><slot></slot></ul>`; }
}
@Component.define()
export class ShadSidebarMenuItem extends Component("shad-sidebar-menu-item") implements OnMount {
  static styles = [tw, css`:host { display: block; position: relative; } slot { display: contents; }`];

  // When the item contains a <shad-sidebar-menu-sub>, its button toggles it.
  @Component.prop({ attribute: "default-open" }) defaultOpen = false;

  onMount(): void {
    if (!this.querySelector("shad-sidebar-menu-sub")) return;
    this.classList.add("group/collapsible"); // chevrons rotate via group-data
    this.dataset.state = this.defaultOpen ? "open" : "closed";
    this.querySelector("shad-sidebar-menu-button")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        this.dataset.state = this.dataset.state === "open" ? "closed" : "open";
      },
      { signal: this.abortSignal },
    );
  }

  override render() { return html`<li class="group/menu-item relative list-none"><slot></slot></li>`; }
}
@Component.define()
export class ShadSidebarMenuSub extends Component("shad-sidebar-menu-sub") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { display: none; }
      :host-context(shad-sidebar-menu-item[data-state="closed"]) { display: none; }
      slot { display: contents; }
    `,
  ];
  override render() { return html`<ul class="mx-3.5 flex min-w-0 flex-col gap-1 border-l border-border px-2.5 py-0.5"><slot></slot></ul>`; }
}
@Component.define()
export class ShadSidebarMenuSubItem extends Component("shad-sidebar-menu-sub-item") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() { return html`<li class="relative list-none"><slot></slot></li>`; }
}

@Component.define()
export class ShadSidebarGroupLabel extends Component("shad-sidebar-group-label") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { opacity: 0; }
      slot { display: contents; }
    `,
  ];
  override render() {
    return html`<div class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadSidebarMenuButton extends Component("shad-sidebar-menu-button") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      slot { display: contents; }
      ::slotted(svg) { width: 1rem; height: 1rem; flex-shrink: 0; }
      /* Collapsed: square icon button (the labels themselves hide via the
         group-data utility on the slotted markup — ::slotted can't be scoped by
         :host-context). */
      :host-context(shad-sidebar-provider[data-state="collapsed"]) .btn { justify-content: center; padding: 0; width: 2rem; }
    `,
  ];

  @Component.prop({ attribute: true }) active = false;
  @Component.prop({ attribute: true }) size: "default" | "lg" = "default";
  @Component.prop({ attribute: true }) href = "";

  override render() {
    const cls =
      "btn flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring " +
      (this.size === "lg" ? "h-12" : "h-8") +
      (this.active ? " bg-accent font-medium text-accent-foreground" : "");
    return this.href
      ? html`<a href=${this.href} data-active=${String(this.active)} class=${cls}><slot></slot></a>`
      : html`<button type="button" data-active=${String(this.active)} class=${cls}><slot></slot></button>`;
  }
}

@Component.define()
export class ShadSidebarMenuSubButton extends Component("shad-sidebar-menu-sub-button") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; } ::slotted(svg){width:1rem;height:1rem}`];
  @Component.prop({ attribute: true }) active = false;
  @Component.prop({ attribute: true }) href = "";
  override render() {
    const cls =
      "flex h-7 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground " +
      (this.active ? "bg-accent text-accent-foreground" : "");
    return this.href
      ? html`<a href=${this.href} class=${cls}><slot></slot></a>`
      : html`<button type="button" class=${cls}><slot></slot></button>`;
  }
}

@Component.define()
export class ShadSidebarMenuAction extends Component("shad-sidebar-menu-action") {
  static styles = [
    tw,
    css`
      :host { position: absolute; right: 0.375rem; top: 0.375rem; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { display: none; }
      slot { display: contents; }
      ::slotted(svg){width:1rem;height:1rem}
    `,
  ];
  override render() {
    return html`<button type="button" class="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"><slot></slot></button>`;
  }
}

@Component.define()
export class ShadSidebarMenuBadge extends Component("shad-sidebar-menu-badge") {
  static styles = [
    tw,
    css`
      :host { position: absolute; right: 0.375rem; top: 50%; transform: translateY(-50%); pointer-events: none; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { display: none; }
      slot { display: contents; }
    `,
  ];
  override render() {
    return html`<div class="flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-muted-foreground"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadSidebarTrigger extends Component("shad-sidebar-trigger") {
  static styles = [tw, css`:host { display: inline-flex; }`];
  override render() {
    return html`<button
      type="button"
      aria-label="Toggle Sidebar"
      class="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      @click=${() => this.dispatchEvent(new CustomEvent("sidebartoggle", { bubbles: true, composed: true }))}
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>
      <span class="sr-only">Toggle Sidebar</span>
    </button>`;
  }
}

@Component.define()
export class ShadSidebarRail extends Component("shad-sidebar-rail") {
  static styles = [
    tw,
    css`
      :host { position: absolute; inset-block: 0; right: -0.5rem; width: 1rem; cursor: w-resize; z-index: 20; }
      :host(:hover) .bar { background: hsl(var(--border)); }
      .bar { position: absolute; inset-block: 0; left: 50%; width: 2px; transform: translateX(-50%); transition: background 0.15s; }
    `,
  ];
  override render() {
    return html`<button type="button" aria-label="Toggle Sidebar" tabindex="-1" class="h-full w-full" @click=${() => this.dispatchEvent(new CustomEvent("sidebartoggle", { bubbles: true, composed: true }))}><span class="bar"></span></button>`;
  }
}

@Component.define()
export class ShadSidebarInset extends Component("shad-sidebar-inset") {
  static styles = [tw, css`:host { display: flex; min-width: 0; flex: 1 1 0%; flex-direction: column; background: hsl(var(--background)); } slot { display: contents; }`];
  override render() {
    return html`<div class="flex min-h-0 flex-1 flex-col"><slot></slot></div>`;
  }
}
