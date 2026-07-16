// The docs content: a nav (sidebar groups) + a demo per component slug.
// Each demo is a list of EXAMPLES; every example is a TemplateResult (using the
// real <shad-*> custom elements) that docs-page frames in its own <docs-view>,
// the shadcn way — variants get their own preview instead of sharing one box.
import { html, map, when, type TemplateResult } from "@youneed/dom";
import { autoplay, toast, type DataTableColumn, type RowAction } from "@youneed/dom-ui-shad";

export interface DemoExample {
  /** Heading shown above the preview. Omit for a single-example demo. */
  name?: string;
  render: () => TemplateResult;
  /** Explicit code shown in the block. Use when the demo is configured via JS
   *  props (so its markup wouldn't appear in the slotted DOM). */
  code?: string;
}

export interface PropDoc {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface SlotDoc {
  name: string;
  description: string;
}

export interface EventDoc {
  name: string;
  detail: string;
  description: string;
}

export interface ApiDoc {
  /** Reactive `@Component.prop` inputs (rendered as a table). */
  props?: PropDoc[];
  /** Named (and default) slots the component projects. */
  slots?: SlotDoc[];
  /** Events the component emits (`this.emit(...)`). */
  events?: EventDoc[];
  /** A snippet showing how to build on the component via `extends`. */
  extend?: string;
}

export interface Demo {
  title: string;
  description: string;
  examples: DemoExample[];
  /** Reference: props/slots + an `extends`-based extension example. */
  api?: ApiDoc;
}

export interface NavGroup {
  group: string;
  items: { slug: string; title: string }[];
}

/** Anchor id for an example/section heading — shared by docs-page (sets the id)
 *  and docs-toc (links to it). "With Label" → "with-label". */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// One parameterized <shad-alert-dialog> demo, reused for every variant below.
function alertDialogDemo(opts: { size?: "sm"; media?: boolean; destructive?: boolean; rtl?: boolean } = {}): TemplateResult {
  const open = (e: Event) =>
    (e.currentTarget as Element).parentElement!
      .querySelector<HTMLElement & { show(): void }>("shad-alert-dialog")!.show();
  const close = (e: Event) =>
    (e.currentTarget as Element).closest<HTMLElement & { close(): void }>("shad-alert-dialog")!.close();
  return html`
    <div dir=${opts.rtl ? "rtl" : "ltr"}>
      <shad-button variant="outline" @click=${open}>Show Dialog</shad-button>
      <shad-alert-dialog size=${opts.size ?? "default"}>
        ${opts.media
          ? html`<div slot="media" class="flex h-28 items-center justify-center bg-muted">
              <svg class="h-10 w-10 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </div>`
          : ""}
        <span slot="title">${opts.destructive ? "Delete account?" : "Are you absolutely sure?"}</span>
        <span slot="description"
          >${opts.destructive
            ? "This permanently deletes your account and all of its data. This cannot be undone."
            : "This action cannot be undone. This will permanently delete your account and remove your data from our servers."}</span
        >
        <shad-button slot="footer" variant="outline" @click=${close}>Cancel</shad-button>
        <shad-button slot="footer" variant=${opts.destructive ? "destructive" : "default"} @click=${close}
          >${opts.destructive ? "Delete" : "Continue"}</shad-button
        >
      </shad-alert-dialog>
    </div>
  `;
}

// One parameterized <shad-dialog> demo, reused for every variant below.
function dialogDemo(
  opts: { closeButton?: boolean; sticky?: boolean; long?: boolean; rtl?: boolean; custom?: boolean } = {},
): TemplateResult {
  const open = (e: Event) =>
    (e.currentTarget as Element).parentElement!.querySelector<HTMLElement & { show(): void }>("shad-dialog")!.show();
  const close = (e: Event) =>
    (e.currentTarget as Element).closest<HTMLElement & { close(): void }>("shad-dialog")!.close();
  const body = opts.long
    ? html`<div class="flex flex-col gap-3 text-sm text-muted-foreground">
        ${map(
          Array.from({ length: 8 }, (_, i) => i),
          (i) => html`<p>
            §${i + 1}. By accessing this service you agree to the terms. Lorem ipsum dolor sit amet, consectetur
            adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
            veniam, quis nostrud exercitation ullamco laboris.
          </p>`,
        )}
      </div>`
    : html`<div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <shad-label for="name">Name</shad-label>
          <shad-input id="name" value="Pedro Duarte"></shad-input>
        </div>
        <div class="flex flex-col gap-2">
          <shad-label for="username">Username</shad-label>
          <shad-input id="username" value="@peduarte"></shad-input>
        </div>
      </div>`;
  return html`
    <div dir=${opts.rtl ? "rtl" : "ltr"}>
      <shad-button variant="outline" @click=${open}>Open Dialog</shad-button>
      <shad-dialog close-button=${opts.closeButton === false ? "false" : "true"} sticky-footer=${opts.sticky ? "true" : "false"}>
        <span slot="title">${opts.long ? "Terms of Service" : "Edit profile"}</span>
        <span slot="description"
          >${opts.long
            ? "Please read these terms carefully before continuing."
            : "Make changes to your profile here. Click save when you're done."}</span
        >
        ${body}
        ${opts.custom
          ? html`<shad-button slot="close" variant="outline" size="sm" @click=${close}>Close</shad-button>`
          : ""}
        <shad-button slot="footer" variant="outline" @click=${close}>Cancel</shad-button>
        <shad-button slot="footer" @click=${close}>Save changes</shad-button>
      </shad-dialog>
    </div>
  `;
}

// One parameterized <shad-drawer> demo, reused for every variant below.
const GOAL_BARS = [40, 30, 20, 30, 20, 28, 19, 24, 30, 20, 28, 19, 35];
function drawerDemo(
  opts: { direction?: "bottom" | "top" | "left" | "right"; long?: boolean; responsive?: boolean; rtl?: boolean } = {},
): TemplateResult {
  const open = (e: Event) =>
    (e.currentTarget as Element).parentElement!.querySelector<HTMLElement & { show(): void }>("shad-drawer")!.show();
  const close = (e: Event) =>
    (e.currentTarget as Element).closest<HTMLElement & { close(): void }>("shad-drawer")!.close();
  const bump = (e: Event, delta: number) => {
    const el = (e.currentTarget as Element).closest("shad-drawer")!.querySelector<HTMLElement>("[data-goal]");
    if (el) el.textContent = String(Math.max(0, +el.textContent! + delta));
  };
  const round = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-lg leading-none hover:bg-muted";
  const body = opts.long
    ? html`<div class="flex flex-col gap-3 text-sm text-muted-foreground">
        ${map(Array.from({ length: 10 }, (_, i) => i), (i) => html`<p>
          §${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
          labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.
        </p>`)}
      </div>`
    : html`<div class="flex items-center justify-center gap-4">
        <button class=${round} @click=${(e: Event) => bump(e, -10)}>−<span class="sr-only">Decrease</span></button>
        <div class="flex-1 text-center">
          <div class="text-6xl font-bold tracking-tighter" data-goal>350</div>
          <div class="text-[0.70rem] uppercase text-muted-foreground">Calories/day</div>
        </div>
        <button class=${round} @click=${(e: Event) => bump(e, 10)}>+<span class="sr-only">Increase</span></button>
      </div>
      <div class="mt-4 flex h-[120px] items-end justify-between gap-1">
        ${map(GOAL_BARS, (h) => html`<div class="w-full rounded-sm bg-primary/80" style=${`height:${h * 3}px`}></div>`)}
      </div>`;
  return html`
    <div dir=${opts.rtl ? "rtl" : "ltr"}>
      <shad-button variant="outline" @click=${open}>Open Drawer</shad-button>
      <shad-drawer direction=${opts.direction ?? "bottom"} responsive=${opts.responsive ? "true" : "false"}>
        <span slot="title">${opts.long ? "Terms of Service" : "Move Goal"}</span>
        <span slot="description"
          >${opts.long ? "Scroll to read all of it." : "Set your daily activity goal."}</span
        >
        ${body}
        <shad-button slot="footer" @click=${close}>Submit</shad-button>
        <shad-button slot="footer" variant="outline" @click=${close}>Cancel</shad-button>
      </shad-drawer>
    </div>
  `;
}

// Empty-state demos. A folder-code icon + "No Projects Yet", parameterized by
// the surface variant, the media (icon / avatar / group), and the content row.
const icFolderCode = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19h-6a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v4" /><path d="M20 21l2 -2l-2 -2" /><path d="M17 17l-2 2l2 2" /></svg>`;
const icArrowUpRight = html`<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>`;

// Icons for the input-group demos.
const igSearch = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>`;
const igChevron = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;
const igSpinner = html`<svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>`;

// Icons for the item demos.
const itBadge = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>`;
const itChevron = html`<svg class="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
const itDots = html`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>`;

// Icons for the sidebar demo.
const sbTerminal = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2" /><path d="M11 13h4" /><rect width="18" height="18" x="3" y="3" rx="2" /></svg>`;
const sbBot = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>`;
const sbBook = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>`;
const sbSettings = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>`;
const sbChevron = html`<svg class="ml-auto text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[state=collapsed]/sidebar:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
// Footer user-menu icons.
const sbSparkles = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>`;
const sbBadgeCheck = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>`;
const sbBell = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>`;
const sbLogout = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>`;
const sbCard = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>`;
const SB_USER_MENU = [
  { heading: true, label: "shadcn · m@example.com" },
  { label: "Upgrade to Pro", icon: sbSparkles, value: "upgrade" },
  { separator: true },
  { label: "Account", icon: sbBadgeCheck, value: "account" },
  { label: "Billing", icon: sbCard, value: "billing" },
  { label: "Notifications", icon: sbBell, value: "notifications" },
  { separator: true },
  { label: "Log out", icon: sbLogout, value: "logout" },
];
const sbUpDown = html`<svg class="ml-auto text-muted-foreground group-data-[state=collapsed]/sidebar:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>`;

function emptyDemo(
  opts: { variant?: "default" | "outline" | "background"; media?: "icon" | "avatar" | "group" | "input"; rtl?: boolean } = {},
): TemplateResult {
  const media =
    opts.media === "avatar"
      ? html`<shad-empty-media variant="default"><shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar></shad-empty-media>`
      : opts.media === "group"
        ? html`<shad-empty-media variant="default">
            <shad-avatar-group>
              <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
              <shad-avatar src="https://github.com/vercel.png" alt="vercel">VC</shad-avatar>
              <shad-avatar alt="plus">+3</shad-avatar>
            </shad-avatar-group>
          </shad-empty-media>`
        : html`<shad-empty-media variant="icon">${icFolderCode}</shad-empty-media>`;
  const content =
    opts.media === "input"
      ? html`<shad-empty-content>
          <shad-input placeholder="Search projects…" class="flex-1"></shad-input>
          <shad-button>Search</shad-button>
        </shad-empty-content>`
      : html`<shad-empty-content>
          <shad-button>Create Project</shad-button>
          <shad-button variant="outline">Import Project</shad-button>
        </shad-empty-content>`;
  return html`<div class="flex h-80 w-full" dir=${opts.rtl ? "rtl" : "ltr"}>
    <shad-empty variant=${opts.variant ?? "default"}>
      <shad-empty-header>
        ${media}
        <shad-empty-title>No Projects Yet</shad-empty-title>
        <shad-empty-description
          >You haven't created any projects yet. Get started by creating your first project.</shad-empty-description
        >
      </shad-empty-header>
      ${content}
      <shad-button variant="link" size="sm" class="text-muted-foreground">Learn More ${icArrowUpRight}</shad-button>
    </shad-empty>
  </div>`;
}

// Hover-card demo (the @nextjs profile preview), parameterized by delays/side.
function hoverCardDemo(
  opts: { openDelay?: number; closeDelay?: number; side?: "top" | "right" | "bottom" | "left"; label?: string } = {},
): TemplateResult {
  return html`<shad-hover-card
    open-delay=${opts.openDelay ?? 200}
    close-delay=${opts.closeDelay ?? 200}
    side=${opts.side ?? "bottom"}
  >
    <shad-button variant="link">${opts.label ?? "@nextjs"}</shad-button>
    <div slot="content" class="flex w-64 flex-col gap-1">
      <div class="font-semibold">@nextjs</div>
      <div>The React Framework – created and maintained by @vercel.</div>
      <div class="mt-1 text-xs text-muted-foreground">Joined December 2021</div>
    </div>
  </shad-hover-card>`;
}

// Numbered placeholder slides for the carousel demos. Square by default
// (horizontal); vertical demos pass a fixed height instead.
function carouselSlides(n: number, sizeCls = "aspect-square"): TemplateResult[] {
  return Array.from(
    { length: n },
    (_, i) => html`<div class=${"flex items-center justify-center rounded-lg border border-border bg-muted text-3xl font-semibold " + sizeCls}>${i + 1}</div>`,
  );
}

// Sample data/config shared by the chart demos.
const CHART_DATA = [
  { month: "Jan", desktop: 186, mobile: 80 },
  { month: "Feb", desktop: 305, mobile: 200 },
  { month: "Mar", desktop: 237, mobile: 120 },
  { month: "Apr", desktop: 173, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "Jun", desktop: 264, mobile: 140 },
];
const CHART_CONFIG = {
  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },
  mobile: { label: "Mobile", color: "hsl(var(--chart-2))" },
};
const chartDemo = (type: string): TemplateResult =>
  html`<div class="w-full max-w-md"><shad-chart type=${type} xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`;
const CHART_CODE = (type: string): string =>
  [
    `<shad-chart type="${type}" xkey="month"></shad-chart>`,
    ``,
    `// data & config are object props — set them in JS:`,
    `const chart = document.querySelector("shad-chart");`,
    `chart.data = [{ month: "Jan", desktop: 186, mobile: 80 }, …];`,
    `chart.config = {`,
    `  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },`,
    `  mobile:  { label: "Mobile",  color: "hsl(var(--chart-2))" },`,
    `};`,
  ].join("\n");

// Sample options shared by the combobox demos.
const FW_OPTIONS = [
  { value: "next", label: "Next.js" },
  { value: "svelte", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
];
const GROUPED_OPTIONS = [
  { group: "Frontend", value: "next", label: "Next.js" },
  { group: "Frontend", value: "svelte", label: "SvelteKit" },
  { group: "Frontend", value: "astro", label: "Astro" },
  { group: "Frontend", value: "nuxt", label: "Nuxt.js" },
  { group: "Frontend", value: "remix", label: "Remix" },
  { group: "Frontend", value: "solid", label: "SolidStart" },
  { group: "Backend", value: "nest", label: "NestJS" },
  { group: "Backend", value: "express", label: "Express" },
  { group: "Backend", value: "fastify", label: "Fastify" },
  { group: "Backend", value: "hono", label: "Hono" },
  { group: "Backend", value: "adonis", label: "AdonisJS" },
];
const COMBO_CODE = (tag: string): string =>
  [tag, ``, `combobox.options = [{ value: "next", label: "Next.js" }, …];`].join("\n");

// Lucide-style icons (each a complete <svg> template → correct SVG namespace).
const icCalendar = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>`;
const icSmile = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>`;
const icCalc = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M8 14h.01" /><path d="M12 14h.01" /></svg>`;
const icUser = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>`;
const icCard = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>`;
const icGear = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>`;
const icDot = html`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3" /></svg>`;

// Sample command items.
const CMD_BASIC = [
  { value: "calendar", label: "Calendar", icon: icCalendar },
  { value: "emoji", label: "Search Emoji", icon: icSmile },
  { value: "calc", label: "Calculator", icon: icCalc },
];
const CMD_SHORTCUTS = [
  { value: "profile", label: "Profile", icon: icUser, shortcut: "⌘P" },
  { value: "billing", label: "Billing", icon: icCard, shortcut: "⌘B" },
  { value: "settings", label: "Settings", icon: icGear, shortcut: "⌘S" },
];
const CMD_GROUPS = [
  { group: "Suggestions", value: "calendar", label: "Calendar", icon: icCalendar },
  { group: "Suggestions", value: "emoji", label: "Search Emoji", icon: icSmile },
  { group: "Suggestions", value: "calc", label: "Calculator", icon: icCalc },
  { group: "Settings", value: "profile", label: "Profile", icon: icUser, shortcut: "⌘P" },
  { group: "Settings", value: "billing", label: "Billing", icon: icCard, shortcut: "⌘B" },
  { group: "Settings", value: "settings", label: "Settings", icon: icGear, shortcut: "⌘S" },
];
const CMD_MANY = Array.from({ length: 20 }, (_, i) => ({ value: "item-" + i, label: "Command item " + (i + 1), icon: icDot }));

// Context-menu data + trigger.
const cmTrigger = (items: unknown): TemplateResult => html`<shad-context-menu .items=${items}>
  <div class="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground select-none">
    Right click here
  </div>
</shad-context-menu>`;
const CM_BASIC = [
  { label: "Back", shortcut: "⌘[" },
  { label: "Forward", shortcut: "⌘]", disabled: true },
  { label: "Reload", shortcut: "⌘R" },
];
const CM_ICONS = [
  { label: "Profile", icon: icUser, shortcut: "⌘P" },
  { label: "Billing", icon: icCard },
  { label: "Settings", icon: icGear },
];
const CM_DESTRUCTIVE = [
  { label: "Edit" },
  { label: "Duplicate" },
  { separator: true },
  { label: "Delete", destructive: true, shortcut: "⌘⌫" },
];
const CM_FULL = [
  { label: "Back", shortcut: "⌘[" },
  { label: "Forward", shortcut: "⌘]", disabled: true },
  { label: "Reload", shortcut: "⌘R" },
  {
    label: "More Tools",
    items: [
      { label: "Save Page As…", shortcut: "⌘S" },
      { label: "Create Shortcut…" },
      { separator: true },
      { label: "Developer Tools" },
    ],
  },
  { separator: true },
  { checkbox: true, label: "Show Bookmarks", value: "bookmarks", checked: true },
  { checkbox: true, label: "Show Full URLs", value: "urls" },
  { separator: true },
  { heading: "People" },
  { radio: "people", value: "pedro", label: "Pedro Duarte", checked: true },
  { radio: "people", value: "colm", label: "Colm Tuite" },
];
const CM_CODE = [
  `<shad-context-menu>`,
  `  <div class="trigger">Right click here</div>`,
  `</shad-context-menu>`,
  ``,
  `menu.items = [`,
  `  { label: "Reload", shortcut: "⌘R" },`,
  `  { label: "Delete", destructive: true },`,
  `];`,
].join("\n");
const CM_SUB_CODE = [
  `menu.items = [`,
  `  { label: "Reload", shortcut: "⌘R" },`,
  `  { label: "More Tools", items: [{ label: "Developer Tools" }] },`,
  `  { separator: true },`,
  `  { checkbox: true, label: "Show Bookmarks", value: "bm", checked: true },`,
  `  { heading: "People" },`,
  `  { radio: "people", value: "pedro", label: "Pedro Duarte", checked: true },`,
  `];`,
].join("\n");
const CMD_CODE = [
  `<shad-command></shad-command>`,
  ``,
  `// icon is an html\`<svg>…</svg>\` template (or an emoji string).`,
  `command.items = [`,
  `  { value: "calendar", label: "Calendar", icon: html\`<svg>…</svg>\` },`,
  `  { value: "settings", label: "Settings", icon: gearIcon, shortcut: "⌘S" },`,
  `];`,
].join("\n");

// Dropdown-menu data + trigger (a button by default; pass a custom trigger node).
const ddTrigger = (items: unknown, trigger?: TemplateResult): TemplateResult => html`<shad-dropdown-menu .items=${items}>
  ${trigger ?? html`<shad-button variant="outline">Open</shad-button>`}
</shad-dropdown-menu>`;
const DD_BASIC = [
  { heading: true, label: "My Account" },
  { label: "Profile" },
  { label: "Billing" },
  { label: "Settings" },
  { separator: true },
  { label: "Log out" },
];
const DD_SHORTCUTS = [
  { label: "Profile", shortcut: "⇧⌘P" },
  { label: "Billing", shortcut: "⌘B" },
  { label: "Settings", shortcut: "⌘S" },
  { label: "Keyboard shortcuts", shortcut: "⌘K" },
];
const DD_ICONS = [
  { label: "Profile", icon: icUser },
  { label: "Billing", icon: icCard },
  { label: "Settings", icon: icGear },
];
const DD_CHECKBOXES = [
  { heading: true, label: "Appearance" },
  { checkbox: true, label: "Status Bar", value: "status", checked: true },
  { checkbox: true, label: "Activity Bar", value: "activity" },
  { checkbox: true, label: "Panel", value: "panel" },
];
const DD_CHECKBOXES_ICONS = [
  { heading: true, label: "Appearance" },
  { checkbox: true, label: "Status Bar", value: "status", checked: true, icon: icGear },
  { checkbox: true, label: "Activity Bar", value: "activity", icon: icCard },
  { checkbox: true, label: "Panel", value: "panel", icon: icUser },
];
const DD_RADIO = [
  { heading: true, label: "Panel Position" },
  { radio: "pos", value: "top", label: "Top", checked: true },
  { radio: "pos", value: "bottom", label: "Bottom" },
  { radio: "pos", value: "right", label: "Right" },
];
const DD_RADIO_ICONS = [
  { heading: true, label: "Panel Position" },
  { radio: "pos", value: "top", label: "Top", checked: true, icon: icCalendar },
  { radio: "pos", value: "bottom", label: "Bottom", icon: icCard },
  { radio: "pos", value: "right", label: "Right", icon: icGear },
];
const DD_DESTRUCTIVE = [
  { label: "Edit", icon: icGear },
  { label: "Duplicate", icon: icCard },
  { separator: true },
  { label: "Delete", destructive: true, icon: icDot, shortcut: "⌘⌫" },
];
const DD_COMPLEX = [
  { heading: true, label: "My Account" },
  { label: "Profile", shortcut: "⇧⌘P" },
  { label: "Billing", shortcut: "⌘B" },
  { label: "Settings", shortcut: "⌘S" },
  { separator: true },
  { label: "Team" },
  { label: "Invite users", items: [{ label: "Email" }, { label: "Message" }, { separator: true }, { label: "More…" }] },
  { label: "New Team", shortcut: "⌘+T" },
  { separator: true },
  { label: "GitHub" },
  { label: "Support" },
  { label: "API", disabled: true },
  { separator: true },
  { label: "Log out", shortcut: "⇧⌘Q" },
];
const DD_CODE = [
  `<shad-dropdown-menu>`,
  `  <shad-button variant="outline">Open</shad-button>`,
  `</shad-dropdown-menu>`,
  ``,
  `menu.items = [`,
  `  { heading: true, label: "My Account" },`,
  `  { label: "Profile", shortcut: "⇧⌘P" },`,
  `  { separator: true },`,
  `  { label: "Invite users", items: [{ label: "Email" }, { label: "Message" }] }, // submenu`,
  `  { label: "Log out", destructive: true },`,
  `];`,
  `menu.addEventListener("select", (e) => console.log(e.detail));`,
].join("\n");

// Menubar menus (the classic File / Edit / View / Profiles bar).
const MB_MENUS = [
  {
    label: "File",
    items: [
      { label: "New Tab", shortcut: "⌘T" },
      { label: "New Window", shortcut: "⌘N" },
      { label: "New Incognito Window", disabled: true },
      { separator: true },
      { label: "Share", items: [{ label: "Email link" }, { label: "Messages" }, { label: "Notes" }] },
      { separator: true },
      { label: "Print…", shortcut: "⌘P" },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "⌘Z" },
      { label: "Redo", shortcut: "⇧⌘Z" },
      { separator: true },
      {
        label: "Find",
        items: [{ label: "Search the web" }, { separator: true }, { label: "Find…" }, { label: "Find Next" }, { label: "Find Previous" }],
      },
      { separator: true },
      { label: "Cut" },
      { label: "Copy" },
      { label: "Paste" },
    ],
  },
  {
    label: "View",
    items: [
      { checkbox: true, label: "Bookmarks Bar", value: "bookmarks" },
      { checkbox: true, label: "Full URLs", value: "urls", checked: true },
      { separator: true },
      { label: "Reload", shortcut: "⌘R" },
      { label: "Force Reload", shortcut: "⇧⌘R", disabled: true },
      { separator: true },
      { label: "Toggle Fullscreen" },
      { separator: true },
      { label: "Hide Sidebar" },
    ],
  },
  {
    label: "Profiles",
    items: [
      { heading: true, label: "Profile" },
      { radio: "profile", value: "andy", label: "Andy" },
      { radio: "profile", value: "benoit", label: "Benoit", checked: true },
      { radio: "profile", value: "luis", label: "Luis" },
      { separator: true },
      { label: "Edit…" },
      { separator: true },
      { label: "Add Profile…" },
    ],
  },
];
const MB_ICONS = [
  {
    label: "Account",
    items: [
      { label: "Profile", icon: icUser, shortcut: "⇧⌘P" },
      { label: "Billing", icon: icCard, shortcut: "⌘B" },
      { label: "Settings", icon: icGear, shortcut: "⌘S" },
      { separator: true },
      { label: "Log out", icon: icDot, destructive: true },
    ],
  },
];

// Navigation-menu items (the docs nav: a list panel, a 2-col grid, a plain link).
const NAV_COMPONENTS = [
  { title: "Alert Dialog", href: "#", description: "A modal dialog that interrupts the user with important content." },
  { title: "Hover Card", href: "#", description: "For sighted users to preview content available behind a link." },
  { title: "Progress", href: "#", description: "Displays an indicator showing the completion progress of a task." },
  { title: "Scroll-area", href: "#", description: "Visually or semantically separates content." },
  { title: "Tabs", href: "#", description: "Layered sections of content displayed one at a time." },
  { title: "Tooltip", href: "#", description: "A popup that displays information related to an element on hover." },
];
const NAV_ITEMS = [
  {
    label: "Getting started",
    width: "w-96",
    links: [
      { title: "Introduction", href: "#", description: "Re-usable components built with Tailwind CSS." },
      { title: "Installation", href: "#", description: "How to install dependencies and structure your app." },
      { title: "Typography", href: "#", description: "Styles for headings, paragraphs, lists…etc" },
    ],
  },
  { label: "Components", cols: 2, width: "w-[520px]", links: NAV_COMPONENTS },
  { label: "Docs", href: "#" },
];

// ---- Table / Data Table ------------------------------------------------

// A simple, static invoice table for the primitives demo.
const INVOICES = [
  { invoice: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
  { invoice: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
  { invoice: "INV003", status: "Unpaid", method: "Bank Transfer", amount: "$350.00" },
  { invoice: "INV004", status: "Paid", method: "Credit Card", amount: "$450.00" },
  { invoice: "INV005", status: "Paid", method: "PayPal", amount: "$550.00" },
];

function basicTable(): TemplateResult {
  return html`<div class="w-full">
    <shad-table>
      <shad-table-header>
        <shad-table-row>
          <shad-table-head>Invoice</shad-table-head>
          <shad-table-head>Status</shad-table-head>
          <shad-table-head>Method</shad-table-head>
          <shad-table-head align="end">Amount</shad-table-head>
        </shad-table-row>
      </shad-table-header>
      <shad-table-body>
        ${map(
          INVOICES,
          (inv) => html`<shad-table-row>
            <shad-table-cell class="font-medium">${inv.invoice}</shad-table-cell>
            <shad-table-cell>${inv.status}</shad-table-cell>
            <shad-table-cell>${inv.method}</shad-table-cell>
            <shad-table-cell align="end">${inv.amount}</shad-table-cell>
          </shad-table-row>`,
        )}
      </shad-table-body>
    </shad-table>
  </div>`;
}

const BASIC_TABLE_CODE = [
  `<shad-table>`,
  `  <shad-table-header>`,
  `    <shad-table-row>`,
  `      <shad-table-head>Invoice</shad-table-head>`,
  `      <shad-table-head>Status</shad-table-head>`,
  `      <shad-table-head align="end">Amount</shad-table-head>`,
  `    </shad-table-row>`,
  `  </shad-table-header>`,
  `  <shad-table-body>`,
  `    <shad-table-row>`,
  `      <shad-table-cell class="font-medium">INV001</shad-table-cell>`,
  `      <shad-table-cell>Paid</shad-table-cell>`,
  `      <shad-table-cell align="end">$250.00</shad-table-cell>`,
  `    </shad-table-row>`,
  `  </shad-table-body>`,
  `</shad-table>`,
].join("\n");

// Payments dataset for the <shad-data-table> demos.
interface Payment {
  id: string;
  status: "success" | "processing" | "failed";
  email: string;
  amount: number;
}
const PAYMENTS: Payment[] = [
  { id: "m5gr84i9", status: "success", email: "ken99@example.com", amount: 316 },
  { id: "3u1reuv4", status: "success", email: "Abe45@example.com", amount: 242 },
  { id: "derv1ws0", status: "processing", email: "Monserrat44@example.com", amount: 837 },
  { id: "5kma53ae", status: "success", email: "Silas22@example.com", amount: 874 },
  { id: "bhqecj4p", status: "failed", email: "carmella@example.com", amount: 721 },
  { id: "p0r8nf2q", status: "processing", email: "jolie.green@example.com", amount: 459 },
  { id: "x7tz1k9w", status: "success", email: "marvin.h@example.com", amount: 128 },
  { id: "qa3lm8vd", status: "failed", email: "estell.brakus@example.com", amount: 642 },
  { id: "z9pn4c6y", status: "success", email: "lue.runte@example.com", amount: 503 },
  { id: "k2wd7s1b", status: "processing", email: "tanya.bauch@example.com", amount: 217 },
  { id: "v6hb3x8m", status: "success", email: "alfreda.k@example.com", amount: 956 },
  { id: "n4qj5t2r", status: "failed", email: "wilburn.d@example.com", amount: 388 },
];

const DT_COLUMNS: DataTableColumn<Payment>[] = [
  { key: "status", header: "Status", class: "capitalize" },
  { key: "email", header: "Email", sortable: true, filterable: true, class: "lowercase" },
  {
    key: "amount",
    header: "Amount",
    align: "end",
    class: "text-right font-medium",
    cell: (r) => `$${r.amount.toFixed(2)}`,
  },
];
const DT_ACTIONS: RowAction[] = [
  { label: "Copy payment ID", value: "copy" },
  { separator: true },
  { label: "View customer", value: "customer" },
  { label: "View payment details", value: "details" },
];

function dataTable(
  opts: { selectable?: boolean; pageSize?: number; showColumns?: boolean; actions?: boolean } = {},
): TemplateResult {
  return html`<div class="w-full">
    <shad-data-table
      row-key="id"
      .columns=${DT_COLUMNS}
      .data=${PAYMENTS}
      .selectable=${opts.selectable ?? false}
      .showColumns=${opts.showColumns ?? false}
      .pageSize=${opts.pageSize ?? 0}
      .rowActions=${opts.actions ? DT_ACTIONS : []}
    ></shad-data-table>
  </div>`;
}

const DT_FULL_CODE = [
  `<shad-data-table row-key="id" selectable show-columns page-size="5"></shad-data-table>`,
  ``,
  `const t = document.querySelector("shad-data-table");`,
  `t.columns = [`,
  `  { key: "status", header: "Status", class: "capitalize" },`,
  `  { key: "email", header: "Email", sortable: true, filterable: true, class: "lowercase" },`,
  `  { key: "amount", header: "Amount", align: "end",`,
  `    cell: (r) => \`$\${r.amount.toFixed(2)}\`, class: "text-right font-medium" },`,
  `];`,
  `t.data = payments;`,
  `t.rowActions = [`,
  `  { label: "Copy payment ID", value: "copy" },`,
  `  { separator: true },`,
  `  { label: "View customer", value: "customer" },`,
  `];`,
  `t.addEventListener("selectionchange", (e) => console.log(e.detail)); // selected rows`,
  `t.addEventListener("rowaction", (e) => console.log(e.detail));       // { action, row }`,
].join("\n");

export const DEMOS: Record<string, Demo> = {
  "data-table": {
    title: "Data Table",
    description: "Powerful table and datagrids built with composable parts — sorting, filtering, pagination, row selection and actions.",
    examples: [
      { name: "Basic Table", render: basicTable, code: BASIC_TABLE_CODE },
      {
        name: "Data Table",
        render: () => dataTable({ selectable: true, showColumns: true, pageSize: 5, actions: true }),
        code: DT_FULL_CODE,
      },
      {
        name: "Sorting",
        render: () => dataTable({}),
        code: `// Mark a column sortable → its header becomes a button that toggles asc/desc.\n{ key: "email", header: "Email", sortable: true }`,
      },
      {
        name: "Filtering",
        render: () => dataTable({}),
        code: `// A filterable column adds a toolbar input that filters on that field.\n{ key: "email", header: "Email", filterable: true }`,
      },
      {
        name: "Pagination",
        render: () => dataTable({ pageSize: 5 }),
        code: `<shad-data-table page-size="5"></shad-data-table>`,
      },
      {
        name: "Row Selection",
        render: () => dataTable({ selectable: true }),
        code: `<shad-data-table selectable></shad-data-table>\n\nt.addEventListener("selectionchange", (e) => console.log(e.detail));`,
      },
      {
        name: "Column Visibility",
        render: () => dataTable({ showColumns: true }),
        code: `<shad-data-table show-columns></shad-data-table> <!-- adds the "Columns" menu -->`,
      },
      {
        name: "Row Actions",
        render: () => dataTable({ actions: true }),
        code: `t.rowActions = [\n  { label: "Copy payment ID", value: "copy" },\n  { separator: true },\n  { label: "View customer", value: "customer" },\n];\nt.addEventListener("rowaction", (e) => console.log(e.detail)); // { action, row }`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl">${dataTable({ selectable: true, showColumns: true, pageSize: 5, actions: true })}</div>`,
        code: `<div dir="rtl"><shad-data-table …></shad-data-table></div>`,
      },
    ],
    api: {
      props: [
        { name: "columns", type: "DataTableColumn[]", default: "[]", description: "Column definitions (key, header, sortable, align, cell, class, filterable, hideable)." },
        { name: "data", type: "object[]", default: "[]", description: "The row objects to render." },
        { name: "rowKey", type: "string", default: '""', description: "Field used as a stable row id for selection (falls back to a JSON key)." },
        { name: "selectable", type: "boolean", default: "false", description: "Adds a checkbox column (select all + per row)." },
        { name: "showColumns", type: "boolean", default: "false", description: 'Adds the "Columns" visibility dropdown to the toolbar.' },
        { name: "pageSize", type: "number", default: "0", description: "Rows per page; 0 disables pagination." },
        { name: "rowActions", type: "RowAction[]", default: "[]", description: "Per-row ellipsis menu; empty hides the actions column." },
        { name: "filterPlaceholder", type: "string", default: '""', description: "Override the toolbar filter input placeholder." },
      ],
      events: [
        { name: "selectionchange", detail: "object[]", description: "Selection changed; detail is the array of selected rows." },
        { name: "rowaction", detail: "{ action, row }", description: "A row-action item was chosen." },
        { name: "sortchange", detail: "{ key, dir }", description: "The sort column or direction changed." },
      ],
      extend: [
        `import { ShadDataTable } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose the primitives yourself for full control, or drive the`,
        `// high-level grid declaratively:`,
        `class PaymentsTable extends ShadDataTable {`,
        `  columns = [`,
        `    { key: "status", header: "Status", class: "capitalize" },`,
        `    { key: "email", header: "Email", sortable: true, filterable: true },`,
        `    { key: "amount", header: "Amount", align: "end",`,
        `      cell: (r) => \`$\${r.amount.toFixed(2)}\` },`,
        `  ];`,
        `  selectable = true;`,
        `  pageSize = 10;`,
        `}`,
      ].join("\n"),
    },
  },
  button: {
    title: "Button",
    description: "Displays a button or a component that looks like a button.",
    examples: [
      { name: "Default", render: () => html`<shad-button>Button</shad-button>` },
      { name: "Secondary", render: () => html`<shad-button variant="secondary">Secondary</shad-button>` },
      { name: "Destructive", render: () => html`<shad-button variant="destructive">Destructive</shad-button>` },
      { name: "Outline", render: () => html`<shad-button variant="outline">Outline</shad-button>` },
      { name: "Ghost", render: () => html`<shad-button variant="ghost">Ghost</shad-button>` },
      { name: "Link", render: () => html`<shad-button variant="link">Link</shad-button>` },
      {
        name: "Sizes",
        render: () => html`
          <div class="flex flex-wrap items-center gap-3">
            <shad-button size="sm">Small</shad-button>
            <shad-button>Default</shad-button>
            <shad-button size="lg">Large</shad-button>
          </div>
        `,
      },
      { name: "Disabled", render: () => html`<shad-button disabled>Disabled</shad-button>` },
    ],
    api: {
      props: [
        {
          name: "variant",
          type: `"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"`,
          default: `"default"`,
          description: "Visual style of the button.",
        },
        {
          name: "size",
          type: `"default" | "sm" | "lg" | "icon"`,
          default: `"default"`,
          description: "Size preset (height + horizontal padding).",
        },
        {
          name: "disabled",
          type: "boolean",
          default: "false",
          description: "Disables interaction and dims the button.",
        },
      ],
      slots: [{ name: "(default)", description: "The button's label / content." }],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadButton } from "@youneed/dom-ui-shad";`,
        ``,
        `// Reuse ShadButton's variants & sizes, prepend an icon.`,
        `@Component.define()`,
        `export class IconButton extends ShadButton {`,
        `  static tagName = "icon-button";`,
        ``,
        `  @Component.prop({ attribute: true }) icon = "★";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      <span class="inline-flex items-center gap-2">`,
        `        <span aria-hidden="true">\${this.icon}</span>`,
        `        \${super.render()}`,
        `      </span>\`;`,
        `  }`,
        `}`,
        ``,
        `// <icon-button variant="outline" size="sm">Star</icon-button>`,
      ].join("\n"),
    },
  },
  "button-group": {
    title: "Button Group",
    description: "Groups related buttons into a single segmented control.",
    examples: [
      {
        name: "Orientation",
        render: () => html`
          <div class="flex flex-col items-start gap-6">
            <shad-button-group>
              <shad-button variant="outline">Years</shad-button>
              <shad-button variant="outline">Months</shad-button>
              <shad-button variant="outline">Days</shad-button>
            </shad-button-group>
            <shad-button-group orientation="vertical">
              <shad-button variant="outline">Top</shad-button>
              <shad-button variant="outline">Middle</shad-button>
              <shad-button variant="outline">Bottom</shad-button>
            </shad-button-group>
          </div>
        `,
      },
      {
        name: "Size",
        render: () => html`
          <div class="flex flex-col items-start gap-4">
            <shad-button-group>
              <shad-button variant="outline" size="sm">One</shad-button>
              <shad-button variant="outline" size="sm">Two</shad-button>
              <shad-button variant="outline" size="sm">Three</shad-button>
            </shad-button-group>
            <shad-button-group>
              <shad-button variant="outline" size="lg">One</shad-button>
              <shad-button variant="outline" size="lg">Two</shad-button>
              <shad-button variant="outline" size="lg">Three</shad-button>
            </shad-button-group>
          </div>
        `,
      },
      {
        name: "Separator",
        render: () => html`
          <shad-button-group>
            <shad-button variant="outline">Copy</shad-button>
            <shad-button-group-separator></shad-button-group-separator>
            <shad-button variant="outline">Paste</shad-button>
            <shad-button-group-separator></shad-button-group-separator>
            <shad-button variant="outline">Cut</shad-button>
          </shad-button-group>
        `,
      },
      {
        name: "Split",
        render: () => html`
          <shad-button-group>
            <shad-button>Save</shad-button>
            <shad-button size="icon" aria-label="More options">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </shad-button>
          </shad-button-group>
        `,
      },
      {
        name: "Text",
        render: () => html`
          <shad-button-group>
            <shad-button-group-text>https://</shad-button-group-text>
            <shad-button variant="outline">example.com</shad-button>
          </shad-button-group>
        `,
      },
      {
        name: "Nested",
        render: () => html`
          <div class="flex items-center gap-2">
            <shad-button-group>
              <shad-button variant="outline" size="icon" aria-label="Bold"><span class="font-bold">B</span></shad-button>
              <shad-button variant="outline" size="icon" aria-label="Italic"><span class="italic">I</span></shad-button>
            </shad-button-group>
            <shad-button-group>
              <shad-button variant="outline" size="icon" aria-label="Align left">⬅</shad-button>
              <shad-button variant="outline" size="icon" aria-label="Align center">⬌</shad-button>
            </shad-button-group>
          </div>
        `,
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-button-group>
              <shad-button variant="outline">السابق</shad-button>
              <shad-button variant="outline">التالي</shad-button>
              <shad-button variant="outline">إنهاء</shad-button>
            </shad-button-group>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "On <shad-button-group>: lays children in a row or a column." },
      ],
      slots: [{ name: "(default)", description: "Buttons, <shad-button-group-separator>, and <shad-button-group-text> segments." }],
      extend: [
        `// Children connect automatically — each shad-button flattens its joined`,
        `// edges via :host-context(shad-button-group). Compose with:`,
        `<shad-button-group>`,
        `  <shad-button-group-text>https://</shad-button-group-text>`,
        `  <shad-button variant="outline">example.com</shad-button>`,
        `  <shad-button-group-separator></shad-button-group-separator>`,
        `  <shad-button variant="outline">Go</shad-button>`,
        `</shad-button-group>`,
      ].join("\n"),
    },
  },
  badge: {
    title: "Badge",
    description: "Displays a badge or a component that looks like a badge.",
    examples: [
      {
        name: "Variants",
        render: () => html`
          <div class="flex flex-wrap items-center gap-2">
            <shad-badge>Default</shad-badge>
            <shad-badge variant="secondary">Secondary</shad-badge>
            <shad-badge variant="destructive">Destructive</shad-badge>
            <shad-badge variant="outline">Outline</shad-badge>
          </div>
        `,
      },
      {
        name: "With Icon",
        render: () => html`
          <div class="flex flex-wrap items-center gap-2">
            <shad-badge>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              Verified
            </shad-badge>
            <shad-badge variant="destructive">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              Alert
            </shad-badge>
          </div>
        `,
      },
      {
        name: "With Spinner",
        render: () => html`
          <shad-badge variant="secondary">
            <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            Syncing
          </shad-badge>
        `,
      },
      {
        name: "Link",
        render: () => html`<shad-badge href="#examples">Go to examples</shad-badge>`,
      },
      {
        name: "Custom Colors",
        render: () => html`
          <div class="flex flex-wrap items-center gap-2">
            <shad-badge class="border-transparent bg-sky-500 text-white">Info</shad-badge>
            <shad-badge class="border-transparent bg-emerald-500 text-white">Success</shad-badge>
            <shad-badge class="border-transparent bg-amber-500 text-white">Warning</shad-badge>
            <shad-badge variant="outline" class="border-sky-500 text-sky-600">Outlined</shad-badge>
          </div>
        `,
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-badge>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              موثق
            </shad-badge>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "variant", type: `"default" | "secondary" | "destructive" | "outline"`, default: `"default"`, description: "Visual style of the pill." },
        { name: "href", type: "string", default: `""`, description: "When set, the badge renders as an <a> link." },
      ],
      slots: [{ name: "(default)", description: "Badge content — text and/or an icon (icons are auto-sized)." }],
      extend: [
        `import { Component } from "@youneed/dom";`,
        `import { ShadBadge } from "@youneed/dom-ui-shad";`,
        ``,
        `// A pill locked to the destructive look.`,
        `@Component.define()`,
        `export class ErrorBadge extends ShadBadge {`,
        `  static tagName = "error-badge";`,
        ``,
        `  override variant = "destructive" as const;`,
        `}`,
        ``,
        `// Custom colors: pass utility classes on the host — they're forwarded:`,
        `// <shad-badge class="bg-sky-500 text-white border-transparent">Info</shad-badge>`,
      ].join("\n"),
    },
  },
  breadcrumb: {
    title: "Breadcrumb",
    description: "Displays the path to the current resource using a hierarchy of links.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-breadcrumb
          .items=${[
            { label: "Home", href: "#" },
            { label: "Components", href: "#" },
            { label: "Breadcrumb" },
          ]}
        ></shad-breadcrumb>`,
        code: [
          `breadcrumb.items = [`,
          `  { label: "Home", href: "/" },`,
          `  { label: "Components", href: "/components" },`,
          `  { label: "Breadcrumb" },          // current page`,
          `];`,
        ].join("\n"),
      },
      {
        name: "Custom Separator",
        render: () => html`<shad-breadcrumb
          separator="/"
          .items=${[
            { label: "Home", href: "#" },
            { label: "Components", href: "#" },
            { label: "Breadcrumb" },
          ]}
        ></shad-breadcrumb>`,
        code: [
          `<shad-breadcrumb separator="/"></shad-breadcrumb>`,
          ``,
          `breadcrumb.items = [`,
          `  { label: "Home", href: "/" },`,
          `  { label: "Components", href: "/components" },`,
          `  { label: "Breadcrumb" },`,
          `];`,
        ].join("\n"),
      },
      {
        name: "Collapsed",
        render: () => html`<shad-breadcrumb
          .items=${[
            { label: "Home", href: "#" },
            { ellipsis: true },
            { label: "Components", href: "#" },
            { label: "Breadcrumb" },
          ]}
        ></shad-breadcrumb>`,
        code: [
          `breadcrumb.items = [`,
          `  { label: "Home", href: "/" },`,
          `  { ellipsis: true },               // collapsed middle`,
          `  { label: "Components", href: "/components" },`,
          `  { label: "Breadcrumb" },`,
          `];`,
        ].join("\n"),
      },
      {
        name: "Link Component",
        render: () => html`<shad-breadcrumb
          .items=${[
            { label: "Docs", href: "#" },
            { label: "Building Your Application", href: "#" },
            { label: "Data Fetching", href: "#" },
            { label: "Caching" },
          ]}
        ></shad-breadcrumb>`,
        code: [
          `// Each item with an href renders as an <a>.`,
          `breadcrumb.items = [`,
          `  { label: "Docs", href: "/docs" },`,
          `  { label: "Building Your Application", href: "/docs/app" },`,
          `  { label: "Data Fetching", href: "/docs/app/data" },`,
          `  { label: "Caching" },`,
          `];`,
        ].join("\n"),
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-breadcrumb
          .items=${[
            { label: "الرئيسية", href: "#" },
            { label: "المكونات", href: "#" },
            { label: "مسار التنقل" },
          ]}
        ></shad-breadcrumb></div>`,
        code: [
          `<div dir="rtl">`,
          `  <shad-breadcrumb></shad-breadcrumb>   <!-- chevron flips automatically -->`,
          `</div>`,
        ].join("\n"),
      },
    ],
    api: {
      props: [
        { name: "items", type: "Crumb[]", default: "[]", description: "Trail items. Crumb = { label?, href?, ellipsis? }: href → link, no href → current page, ellipsis → collapsed “…”." },
        { name: "separator", type: "string", default: `""`, description: "Custom separator text (e.g. \"/\"); a chevron is used when empty." },
      ],
      extend: [
        `import { ShadBreadcrumb } from "@youneed/dom-ui-shad";`,
        ``,
        `// Data-driven: a single component, no per-item composition.`,
        `const crumbs = document.querySelector("shad-breadcrumb");`,
        `crumbs.items = [`,
        `  { label: "Home", href: "/" },`,
        `  { ellipsis: true },`,
        `  { label: "Components", href: "/components" },`,
        `  { label: "Breadcrumb" },        // current page (no href)`,
        `];`,
      ].join("\n"),
    },
  },
  card: {
    title: "Card",
    description: "Displays a card with header, content, and footer.",
    examples: [
      {
        name: "Default",
        render: () => html`
          <shad-card class="w-full max-w-sm">
            <span slot="title">Create project</span>
            <span slot="description">Deploy your new project in one click.</span>
            <shad-button slot="action" variant="ghost" size="sm">Settings</shad-button>
            <p class="text-sm text-muted-foreground">Fill in the details below, then hit deploy to ship it.</p>
            <shad-button slot="footer" variant="outline">Cancel</shad-button>
            <shad-button slot="footer" class="ml-2">Deploy</shad-button>
          </shad-card>
        `,
      },
      {
        name: "Image",
        render: () => html`
          <shad-card class="w-full max-w-sm">
            <div slot="image" class="h-40 bg-gradient-to-br from-sky-400 to-indigo-500"></div>
            <span slot="title">Mountain Retreat</span>
            <span slot="description">A quiet cabin in the woods.</span>
            <p class="text-sm text-muted-foreground">Three nights, breakfast included. Free cancellation.</p>
          </shad-card>
        `,
      },
      {
        name: "Spacing",
        render: () => html`
          <div class="flex flex-wrap items-start gap-4">
            <shad-card class="w-56" style="--card-gap: 0.75rem">
              <span slot="title">Compact</span>
              <span slot="description">--card-gap: 0.75rem</span>
              <p class="text-sm text-muted-foreground">Tighter padding and gaps.</p>
            </shad-card>
            <shad-card class="w-56" style="--card-gap: 2rem">
              <span slot="title">Roomy</span>
              <span slot="description">--card-gap: 2rem</span>
              <p class="text-sm text-muted-foreground">Looser padding and gaps.</p>
            </shad-card>
          </div>
        `,
      },
      {
        name: "Size",
        render: () => html`
          <div class="flex flex-wrap items-start gap-4">
            <shad-card class="w-48">
              <span slot="title">Small</span>
              <p class="text-sm text-muted-foreground">w-48</p>
            </shad-card>
            <shad-card class="w-72">
              <span slot="title">Large</span>
              <p class="text-sm text-muted-foreground">w-72 — the card fills its container.</p>
            </shad-card>
          </div>
        `,
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-card class="w-full max-w-sm">
              <span slot="title">إنشاء مشروع</span>
              <span slot="description">انشر مشروعك بنقرة واحدة.</span>
              <shad-button slot="action" variant="ghost" size="sm">الإعدادات</shad-button>
              <p class="text-sm text-muted-foreground">املأ التفاصيل ثم اضغط نشر.</p>
              <shad-button slot="footer">نشر</shad-button>
            </shad-card>
          </div>
        `,
      },
    ],
    api: {
      slots: [
        { name: "image", description: "Full-bleed media at the top (an <img> or a banner)." },
        { name: "title", description: "Card heading." },
        { name: "description", description: "Supporting subtitle under the title." },
        { name: "action", description: "Header end action (e.g. a button); placed top-end." },
        { name: "(default)", description: "Card body content." },
        { name: "footer", description: "Footer actions." },
      ],
      extend: [
        `// Spacing is driven by a CSS variable — override it per card:`,
        `<shad-card style="--card-gap: 2rem">…</shad-card>`,
        ``,
        `// Slots compose the parts; empty ones add no spacing:`,
        `<shad-card>`,
        `  <img slot="image" src="…" />`,
        `  <span slot="title">Title</span>`,
        `  <span slot="description">Subtitle</span>`,
        `  <button slot="action">…</button>`,
        `  Body content`,
        `  <button slot="footer">Save</button>`,
        `</shad-card>`,
      ].join("\n"),
    },
  },
  carousel: {
    title: "Carousel",
    description: "A slideshow for cycling through a set of slides.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-xs"><shad-carousel>${carouselSlides(5)}</shad-carousel></div>`,
      },
      {
        name: "Sizes",
        render: () => html`<div class="w-full max-w-md"><shad-carousel style="--slide-basis: 50%">${carouselSlides(6)}</shad-carousel></div>`,
      },
      {
        name: "Spacing",
        render: () => html`<div class="w-full max-w-md"><shad-carousel style="--slide-basis: 50%; --slide-gap: 2rem">${carouselSlides(6)}</shad-carousel></div>`,
      },
      {
        name: "Orientation",
        render: () => html`<div class="w-full max-w-xs"><shad-carousel orientation="vertical">${carouselSlides(5, "h-40")}</shad-carousel></div>`,
      },
      {
        name: "Autoplay (Plugin)",
        render: () => html`<div class="w-full max-w-xs">
          <shad-carousel .plugins=${[autoplay({ delay: 2000 })]}>${carouselSlides(5)}</shad-carousel>
        </div>`,
        code: [
          `import { autoplay } from "@youneed/dom-ui-shad";`,
          ``,
          `const carousel = document.querySelector("shad-carousel");`,
          `carousel.plugins = [autoplay({ delay: 2000 })];`,
          ``,
          `// Advances every 2s, loops at the end, pauses on hover/focus.`,
        ].join("\n"),
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-xs"><shad-carousel>${carouselSlides(5)}</shad-carousel></div>`,
      },
    ],
    api: {
      props: [
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Scroll axis of the carousel." },
        { name: "plugins", type: "CarouselPlugin[]", default: "[]", description: "Plugins run on mount — e.g. autoplay({ delay }) — via the carousel's public API." },
      ],
      events: [
        { name: "scroll", detail: "-1 | 1", description: "Fires when prev/next is pressed; detail is the direction." },
      ],
      slots: [{ name: "(default)", description: "The slides — each direct child is one slide." }],
      extend: [
        `// Sizing & spacing are CSS variables on the host:`,
        `<shad-carousel style="--slide-basis: 50%">…</shad-carousel>   // ~2 slides visible`,
        `<shad-carousel style="--slide-gap: 1.5rem">…</shad-carousel>  // gap between slides`,
        `<shad-carousel orientation="vertical" style="--carousel-height: 18rem">…</shad-carousel>`,
        ``,
        `carousel.addEventListener("scroll", (e) => console.log("dir", e.detail));`,
      ].join("\n"),
    },
  },
  chart: {
    title: "Chart",
    description: "Dependency-free SVG charts (bar / line / area) configured like shadcn's ChartConfig.",
    examples: [
      { name: "Bar Chart", render: () => chartDemo("bar"), code: CHART_CODE("bar") },
      { name: "Line Chart", render: () => chartDemo("line"), code: CHART_CODE("line") },
      { name: "Area Chart", render: () => chartDemo("area"), code: CHART_CODE("area") },
      {
        name: "Interactive",
        render: () => html`<div class="w-full max-w-md"><shad-chart type="bar" interactive totals xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`,
        code: [
          `<shad-chart type="bar" interactive totals></shad-chart>`,
          ``,
          `// interactive → click a legend item to toggle that series.`,
          `// totals → show per-series sums in the legend.`,
        ].join("\n"),
      },
      {
        name: "No Legend",
        render: () => html`<div class="w-full max-w-md"><shad-chart type="line" legend="false" xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`,
        code: [
          `<shad-chart type="line" legend="false"></shad-chart>`,
          ``,
          `// legend="false" hides the legend entirely.`,
        ].join("\n"),
      },
      { name: "RTL", render: () => html`<div dir="rtl" class="w-full max-w-md"><shad-chart type="bar" xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`, code: CHART_CODE("bar") },
    ],
    api: {
      props: [
        { name: "type", type: `"bar" | "line" | "area"`, default: `"bar"`, description: "Chart kind." },
        { name: "data", type: "Record<string, string|number>[]", default: "[]", description: "Rows of data points." },
        { name: "xkey", type: "string", default: `""`, description: "Data key used for the X axis category." },
        { name: "config", type: "ChartConfig", default: "{}", description: "Maps each series key → { label, color }. Colors can use --chart-1…5." },
        { name: "legend", type: "boolean", default: "true", description: "Render the legend (set legend=\"false\" to hide)." },
        { name: "interactive", type: "boolean", default: "false", description: "Make the legend clickable to toggle series on/off." },
        { name: "totals", type: "boolean", default: "false", description: "Show per-series sums in the legend." },
      ],
      extend: [
        `import { ShadChart } from "@youneed/dom-ui-shad";`,
        ``,
        `const chart = document.querySelector("shad-chart");`,
        `chart.type = "bar";`,
        `chart.xkey = "month";`,
        `chart.data = [{ month: "Jan", desktop: 186, mobile: 80 }, …];`,
        `chart.config = {`,
        `  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },`,
        `  mobile:  { label: "Mobile",  color: "hsl(var(--chart-2))" },`,
        `};`,
      ].join("\n"),
    },
  },
  input: {
    title: "Input",
    description: "Displays a form input field.",
    examples: [
      { name: "Basic", render: () => html`<div class="max-w-sm"><shad-input placeholder="Email"></shad-input></div>` },
      {
        name: "With Label",
        render: () => html`
          <div class="flex max-w-sm flex-col gap-2">
            <shad-label for="api-key">API Key</shad-label>
            <shad-input id="api-key" type="password" placeholder="sk-..."></shad-input>
          </div>
        `,
      },
      { name: "Disabled", render: () => html`<div class="max-w-sm"><shad-input placeholder="Email" disabled></shad-input></div>` },
      {
        name: "Invalid",
        render: () => html`
          <div class="flex max-w-sm flex-col gap-2">
            <shad-input placeholder="Email" value="not-an-email" invalid></shad-input>
            <p class="text-sm text-destructive">Enter a valid email address.</p>
          </div>
        `,
      },
      { name: "File", render: () => html`<div class="max-w-sm"><shad-input type="file"></shad-input></div>` },
      {
        name: "With Button",
        render: () => html`
          <div class="flex w-full max-w-sm items-center gap-2">
            <shad-input placeholder="Email"></shad-input>
            <shad-button variant="outline">Subscribe</shad-button>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "type", type: "string", default: `"text"`, description: `Native input type ("text", "password", "file", "search"…).` },
        { name: "placeholder", type: "string", default: `""`, description: "Placeholder text shown when empty." },
        { name: "value", type: "string", default: `""`, description: "Current value; mirrored to/from the attribute." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables the field and dims it." },
        { name: "invalid", type: "boolean", default: "false", description: "Marks the field invalid (destructive border + aria-invalid)." },
      ],
      events: [
        { name: "input", detail: "string", description: "Fires on every keystroke; detail is the current value." },
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadInput } from "@youneed/dom-ui-shad";`,
        ``,
        `// Reuse ShadInput, force type=search and prepend an icon.`,
        `@Component.define()`,
        `export class SearchInput extends ShadInput {`,
        `  static tagName = "search-input";`,
        ``,
        `  override type = "search";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      <div class="flex items-center gap-2">`,
        `        <span aria-hidden="true">🔍</span>`,
        `        \${super.render()}`,
        `      </div>\`;`,
        `  }`,
        `}`,
        ``,
        `// <search-input placeholder="Search…"></search-input>`,
      ].join("\n"),
    },
  },
  "input-group": {
    title: "Input Group",
    description: "Wrap an input or textarea with addons — icons, text, buttons, kbd, and more.",
    examples: [
      {
        name: "Icon",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Search…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end">12 results</shad-input-group-addon>
          </shad-input-group>
        </div>`,
        code: [
          `<shad-input-group>`,
          `  <shad-input-group-input placeholder="Search…"></shad-input-group-input>`,
          `  <shad-input-group-addon><svg>…</svg></shad-input-group-addon>          <!-- inline-start -->`,
          `  <shad-input-group-addon align="inline-end">12 results</shad-input-group-addon>`,
          `</shad-input-group>`,
        ].join("\n"),
      },
      {
        name: "Text",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-addon>https://</shad-input-group-addon>
            <shad-input-group-input placeholder="example.com"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">.com</shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "Button",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="API key…" type="password"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">
              <shad-input-group-button variant="default">Save</shad-input-group-button>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "Kbd",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Search…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end">
              <kbd class="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">⌘K</kbd>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "Dropdown",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="0.00"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">
              <shad-dropdown-menu
                align="end"
                .items=${[{ label: "USD", value: "usd" }, { label: "EUR", value: "eur" }, { label: "GBP", value: "gbp" }]}
              >
                <shad-input-group-button variant="ghost">USD ${igChevron}</shad-input-group-button>
              </shad-dropdown-menu>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "Spinner",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Checking…" value="my-username"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">${igSpinner}</shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "Textarea",
        render: () => html`<div class="max-w-md">
          <shad-input-group>
            <shad-input-group-textarea placeholder="Ask, search or chat…"></shad-input-group-textarea>
            <shad-input-group-addon align="block-end">
              <span class="text-xs">Press Enter to send</span>
              <shad-input-group-button variant="default" class="ml-auto">Send</shad-input-group-button>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`,
        code: [
          `<shad-input-group>`,
          `  <shad-input-group-textarea placeholder="Ask, search or chat…"></shad-input-group-textarea>`,
          `  <shad-input-group-addon align="block-end"> … </shad-input-group-addon>`,
          `</shad-input-group>`,
        ].join("\n"),
      },
      {
        name: "Custom Input",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-input placeholder="Type a command…"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">
              <shad-input-group-button variant="outline">Clear</shad-input-group-button>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="بحث…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end">١٢ نتيجة</shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
    ],
    api: {
      props: [
        { name: "InputGroupAddon · align", type: `"inline-start" | "inline-end" | "block-start" | "block-end"`, default: `"inline-start"`, description: "Where the addon sits; block-* flips the group to a column." },
        { name: "InputGroupInput · placeholder / value / type / disabled", type: "string / string / string / boolean", default: "—", description: "Forwarded to the underlying <input>." },
        { name: "InputGroupButton · variant", type: `Button variant`, default: `"ghost"`, description: "A <shad-button> at its compact xs size (any button variant)." },
      ],
      slots: [
        { name: "shad-input-group", description: "The bordered container (focus ring follows the control)." },
        { name: "shad-input-group-input / -textarea", description: "The form control (borderless, transparent)." },
        { name: "shad-input-group-addon", description: "An edge addon: icon, text, button, kbd, spinner…" },
        { name: "shad-input-group-button", description: "A small button intended for addons." },
      ],
      extend: [
        `import { ShadInputGroup } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose freely; align addons on any edge:`,
        `<shad-input-group>`,
        `  <shad-input-group-input placeholder="Search…" />`,
        `  <shad-input-group-addon><svg>…</svg></shad-input-group-addon>`,
        `  <shad-input-group-addon align="inline-end">`,
        `    <shad-input-group-button>Go</shad-input-group-button>`,
        `  </shad-input-group-addon>`,
        `</shad-input-group>`,
      ].join("\n"),
    },
  },
  "input-otp": {
    title: "Input OTP",
    description: "Accessible one-time password component with copy-paste functionality.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-input-otp maxlength="6"></shad-input-otp>`,
        code: `<shad-input-otp maxlength="6"></shad-input-otp>`,
      },
      {
        name: "Separator",
        render: () => html`<shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp>`,
        code: `<shad-input-otp maxlength="6"></shad-input-otp>\n\notp.groups = [3, 3];   // a separator between the groups`,
      },
      { name: "Disabled", render: () => html`<shad-input-otp maxlength="6" disabled value="123"></shad-input-otp>` },
      {
        name: "Controlled",
        render: () => html`<div class="flex flex-col items-center gap-3">
          <shad-input-otp
            maxlength="6"
            @input=${(e: Event) => {
              const out = (e.currentTarget as Element).parentElement!.querySelector("[data-otp-out]")!;
              out.textContent = (e as CustomEvent<string>).detail || "—";
            }}
          ></shad-input-otp>
          <div class="text-sm text-muted-foreground">Entered: <span data-otp-out class="font-mono text-foreground">—</span></div>
        </div>`,
        code: `otp.addEventListener("input", (e) => console.log(e.detail));    // current value\notp.addEventListener("complete", (e) => verify(e.detail));      // when full`,
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col items-center gap-2">
          <shad-input-otp maxlength="6" invalid value="123456"></shad-input-otp>
          <p class="text-sm text-destructive">Invalid code. Please try again.</p>
        </div>`,
      },
      { name: "Four Digits", render: () => html`<shad-input-otp maxlength="4"></shad-input-otp>` },
      {
        name: "Alphanumeric",
        render: () => html`<shad-input-otp maxlength="6" pattern="alphanumeric"></shad-input-otp>`,
        code: `<shad-input-otp maxlength="6" pattern="alphanumeric"></shad-input-otp>`,
      },
      {
        name: "Form",
        render: () => html`<div class="flex flex-col items-center gap-3">
          <shad-label>Verification code</shad-label>
          <shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp>
          <shad-button size="sm">Verify</shad-button>
        </div>`,
      },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp></div>` },
    ],
    api: {
      props: [
        { name: "maxlength", type: "number", default: "6", description: "Number of slots / max characters." },
        { name: "value", type: "string", default: `""`, description: "Current value; mirrored to the attribute." },
        { name: "pattern", type: `"digits" | "alphanumeric" | regex`, default: `"digits"`, description: "Allowed characters (regex source also accepted)." },
        { name: "groups", type: "number[]", default: "[maxlength]", description: "Group sizes; a separator is drawn between groups (e.g. [3, 3])." },
        { name: "separator", type: "boolean", default: "false", description: "Shortcut: split into two equal halves with a separator." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables input and dims the field." },
        { name: "invalid", type: "boolean", default: "false", description: "Destructive border/ring + aria-invalid." },
      ],
      events: [
        { name: "input", detail: "string", description: "Fires on every change; detail is the current value." },
        { name: "complete", detail: "string", description: "Fires when all slots are filled." },
      ],
      extend: [
        `import { ShadInputOtp } from "@youneed/dom-ui-shad";`,
        ``,
        `const otp = document.querySelector("shad-input-otp");`,
        `otp.groups = [3, 3];                                   // separator`,
        `otp.addEventListener("complete", (e) => verify(e.detail));`,
      ].join("\n"),
    },
  },
  label: {
    title: "Label",
    description: "Renders an accessible label, optionally associated with a control.",
    examples: [
      { name: "Basic", render: () => html`<shad-label>Accept terms and conditions</shad-label>` },
      {
        name: "With Control",
        // `for` links across shadow DOM: clicking the label focuses + toggles the
        // control and donates the label text as its accessible name.
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox id="lbl-newsletter"></shad-checkbox>
            <shad-label for="lbl-newsletter">Subscribe to the newsletter</shad-label>
          </div>
        `,
      },
      {
        name: "With Input",
        render: () => html`
          <div class="flex max-w-sm flex-col gap-2">
            <shad-label for="lbl-email">Email</shad-label>
            <shad-input id="lbl-email" type="email" placeholder="me@example.com"></shad-input>
          </div>
        `,
      },
    ],
    api: {
      props: [
        {
          name: "for",
          type: "string",
          default: `""`,
          description: "Id of the control to associate (resolved within the label's root, so it works inside shadow DOM).",
        },
      ],
      slots: [{ name: "(default)", description: "The label text." }],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadLabel } from "@youneed/dom-ui-shad";`,
        ``,
        `// A required-field label that appends a red asterisk.`,
        `@Component.define()`,
        `export class RequiredLabel extends ShadLabel {`,
        `  static tagName = "required-label";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      \${super.render()}`,
        `      <span class="ml-0.5 text-destructive">*</span>\`;`,
        `  }`,
        `}`,
      ].join("\n"),
    },
  },
  switch: {
    title: "Switch",
    description: "A control that allows the user to toggle between checked and not checked.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex items-center gap-2">
          <shad-switch id="airplane"></shad-switch>
          <shad-label for="airplane">Airplane Mode</shad-label>
        </div>`,
        code: [
          `<div class="flex items-center gap-2">`,
          `  <shad-switch id="airplane"></shad-switch>`,
          `  <shad-label for="airplane">Airplane Mode</shad-label>`,
          `</div>`,
        ].join("\n"),
      },
      {
        name: "Description",
        render: () => html`<div class="flex max-w-sm items-start gap-3">
          <shad-switch id="sw-marketing" checked class="mt-0.5"></shad-switch>
          <div class="grid gap-1">
            <shad-label for="sw-marketing">Marketing emails</shad-label>
            <p class="text-sm text-muted-foreground">Receive emails about new products, features, and more.</p>
          </div>
        </div>`,
      },
      {
        name: "Choice Card",
        render: () => html`<shad-label
          for="sw-card"
          class="flex w-full max-w-sm items-center justify-between gap-3 rounded-lg border border-border p-3.5 hover:bg-muted/50 has-[shad-switch[checked]]:border-primary has-[shad-switch[checked]]:bg-muted/40"
        >
          <div class="grid gap-0.5">
            <span class="font-medium leading-none">Two-factor auth</span>
            <span class="text-sm font-normal text-muted-foreground">Add an extra layer of security.</span>
          </div>
          <shad-switch id="sw-card"></shad-switch>
        </shad-label>`,
        code: `<shad-label class="… has-[shad-switch[checked]]:border-primary"><shad-switch .../></shad-label>`,
      },
      {
        name: "Disabled",
        render: () => html`<div class="flex flex-col gap-3">
          <div class="flex items-center gap-2"><shad-switch id="sw-d1" disabled></shad-switch><shad-label for="sw-d1">Off (disabled)</shad-label></div>
          <div class="flex items-center gap-2"><shad-switch id="sw-d2" checked disabled></shad-switch><shad-label for="sw-d2">On (disabled)</shad-label></div>
        </div>`,
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col gap-2">
          <div class="flex items-center gap-2"><shad-switch id="sw-inv" invalid></shad-switch><shad-label for="sw-inv">Accept terms</shad-label></div>
          <p class="text-sm text-destructive">You must enable this to continue.</p>
        </div>`,
      },
      {
        name: "Size",
        render: () => html`<div class="flex items-center gap-6">
          <div class="flex items-center gap-2"><shad-switch id="sw-sm" size="sm" checked></shad-switch><shad-label for="sw-sm" class="text-xs">Small</shad-label></div>
          <div class="flex items-center gap-2"><shad-switch id="sw-df" checked></shad-switch><shad-label for="sw-df">Default</shad-label></div>
        </div>`,
        code: `<shad-switch size="sm"></shad-switch>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-2">
          <shad-switch id="sw-rtl" checked></shad-switch>
          <shad-label for="sw-rtl">وضع الطائرة</shad-label>
        </div>`,
      },
    ],
    api: {
      props: [
        { name: "checked", type: "boolean", default: "false", description: "On/off state; mirrored to the attribute." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables the control and dims it." },
        { name: "invalid", type: "boolean", default: "false", description: "Destructive ring (aria-invalid)." },
        { name: "size", type: `"default" | "sm"`, default: `"default"`, description: "Track/thumb size." },
      ],
      events: [{ name: "change", detail: "boolean", description: "Fires on toggle; detail is the new checked state." }],
      extend: [
        `import { ShadSwitch } from "@youneed/dom-ui-shad";`,
        ``,
        `const sw = document.querySelector("shad-switch");`,
        `sw.addEventListener("change", (e) => console.log(e.detail));`,
        `// <shad-label for="id"> toggles + labels it across shadow DOM.`,
      ].join("\n"),
    },
  },
  checkbox: {
    title: "Checkbox",
    description: "A control that can be checked or unchecked.",
    examples: [
      {
        name: "Basic",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox id="cb-terms"></shad-checkbox>
            <shad-label for="cb-terms">Accept terms and conditions</shad-label>
          </div>
        `,
      },
      {
        name: "Checked",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox checked></shad-checkbox>
            <shad-label>Subscribe to the newsletter</shad-label>
          </div>
        `,
      },
      {
        name: "With Description",
        render: () => html`
          <div class="flex max-w-sm items-start gap-3">
            <shad-checkbox id="cb-desc" checked class="mt-0.5"></shad-checkbox>
            <div class="flex flex-col gap-0.5">
              <shad-label for="cb-desc">Accept terms and conditions</shad-label>
              <p class="text-sm text-muted-foreground">By clicking this checkbox, you agree to the terms.</p>
            </div>
          </div>
        `,
      },
      {
        name: "Disabled",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox disabled></shad-checkbox>
            <shad-label>Enable notifications</shad-label>
          </div>
        `,
      },
      {
        name: "Invalid",
        render: () => html`
          <div class="flex max-w-sm items-start gap-3">
            <shad-checkbox invalid class="mt-0.5"></shad-checkbox>
            <div class="flex flex-col gap-0.5">
              <shad-label class="text-destructive">Accept terms and conditions</shad-label>
              <p class="text-sm text-destructive">You must accept before continuing.</p>
            </div>
          </div>
        `,
      },
      {
        name: "Group",
        render: () => html`
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3"><shad-checkbox checked></shad-checkbox><shad-label>Recents</shad-label></div>
            <div class="flex items-center gap-3"><shad-checkbox checked></shad-checkbox><shad-label>Home</shad-label></div>
            <div class="flex items-center gap-3"><shad-checkbox></shad-checkbox><shad-label>Applications</shad-label></div>
            <div class="flex items-center gap-3"><shad-checkbox disabled></shad-checkbox><shad-label>Desktop</shad-label></div>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "checked", type: "boolean", default: "false", description: "Whether the box is checked; mirrored to the attribute." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables interaction and dims the control." },
        { name: "invalid", type: "boolean", default: "false", description: "Marks the control invalid (destructive border + aria-invalid)." },
      ],
      events: [
        { name: "change", detail: "boolean", description: "Fires on toggle; detail is the new checked state." },
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadCheckbox } from "@youneed/dom-ui-shad";`,
        ``,
        `// A checkbox that starts checked and logs every change.`,
        `@Component.define()`,
        `export class TermsCheckbox extends ShadCheckbox {`,
        `  static tagName = "terms-checkbox";`,
        ``,
        `  override checked = true;`,
        ``,
        `  override toggle() {`,
        `    super.toggle();`,
        `    console.log("terms accepted:", this.checked);`,
        `  }`,
        `}`,
        ``,
        `// <terms-checkbox></terms-checkbox>`,
      ].join("\n"),
    },
  },
  collapsible: {
    title: "Collapsible",
    description: "An interactive component which expands/collapses a panel.",
    examples: [
      {
        name: "Basic",
        render: () => html`
          <shad-collapsible chevron open class="w-full max-w-sm">
            <span slot="trigger" class="text-sm font-medium">@peduarte starred 3 repositories</span>
            <div class="mt-2 flex flex-col gap-2">
              <div class="rounded-md border border-border px-4 py-2 text-sm">@radix-ui/primitives</div>
              <div class="rounded-md border border-border px-4 py-2 text-sm">@radix-ui/colors</div>
              <div class="rounded-md border border-border px-4 py-2 text-sm">@stitches/react</div>
            </div>
          </shad-collapsible>
        `,
      },
      {
        name: "Settings Panel",
        render: () => html`
          <shad-collapsible chevron class="w-full max-w-sm rounded-lg border border-border p-4">
            <div slot="trigger">
              <div class="text-sm font-medium">Advanced settings</div>
              <div class="text-xs text-muted-foreground">Tweak behavior and defaults</div>
            </div>
            <div class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <div class="flex items-center justify-between"><shad-label>Auto-save</shad-label><shad-switch checked></shad-switch></div>
              <div class="flex items-center justify-between"><shad-label>Telemetry</shad-label><shad-switch></shad-switch></div>
            </div>
          </shad-collapsible>
        `,
      },
      {
        name: "File Tree",
        render: () => html`
          <div class="w-full max-w-xs text-sm">
            <shad-collapsible chevron open>
              <span slot="trigger" class="font-medium">📁 src</span>
              <div class="ml-4 mt-1 flex flex-col gap-1">
                <shad-collapsible chevron>
                  <span slot="trigger">📁 components</span>
                  <div class="ml-4 mt-1 flex flex-col gap-1 text-muted-foreground">
                    <div>📄 button.ts</div>
                    <div>📄 card.ts</div>
                  </div>
                </shad-collapsible>
                <div class="text-muted-foreground">📄 index.ts</div>
              </div>
            </shad-collapsible>
          </div>
        `,
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-collapsible chevron open class="w-full max-w-sm">
              <span slot="trigger" class="text-sm font-medium">المستودعات المميزة</span>
              <div class="mt-2 flex flex-col gap-2">
                <div class="rounded-md border border-border px-4 py-2 text-sm">المكوّن الأول</div>
                <div class="rounded-md border border-border px-4 py-2 text-sm">المكوّن الثاني</div>
              </div>
            </shad-collapsible>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the panel is expanded; mirrored to the attribute (controllable)." },
        { name: "chevron", type: "boolean", default: "false", description: "Render a built-in caret that rotates with state." },
      ],
      events: [
        { name: "change", detail: "boolean", description: "Fires on toggle; detail is the new open state." },
      ],
      slots: [
        { name: "trigger", description: "Clickable header content." },
        { name: "(default)", description: "Collapsible body." },
      ],
      extend: [
        `import { ShadCollapsible } from "@youneed/dom-ui-shad";`,
        ``,
        `const c = document.querySelector("shad-collapsible");`,
        `c.addEventListener("change", (e) => console.log("open?", e.detail));`,
        `c.open = true; // controlled`,
      ].join("\n"),
    },
  },
  combobox: {
    title: "Combobox",
    description: "Autocomplete input and command palette with a list of suggestions.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox value="next" placeholder="Select framework…" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox value="next" placeholder="Select framework…"></shad-combobox>`),
      },
      {
        name: "Multiple",
        render: () => html`<div class="w-full max-w-[280px]"><shad-combobox multiple clearable placeholder="Select frameworks…" .values=${["next", "svelte"]} .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox multiple clearable placeholder="Select frameworks…"></shad-combobox>`),
      },
      {
        name: "Clear Button",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox clearable value="astro" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox clearable value="astro"></shad-combobox>`),
      },
      {
        name: "Groups",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox placeholder="Select…" .options=${GROUPED_OPTIONS}></shad-combobox></div>`,
        code: [
          `<shad-combobox></shad-combobox>`,
          ``,
          `combobox.options = [`,
          `  { group: "Frontend", value: "next", label: "Next.js" },`,
          `  { group: "Frontend", value: "svelte", label: "SvelteKit" },`,
          `  { group: "Backend", value: "nest", label: "NestJS" },`,
          `];`,
        ].join("\n"),
      },
      {
        name: "Invalid",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox invalid placeholder="Required…" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox invalid placeholder="Required…"></shad-combobox>`),
      },
      {
        name: "Disabled",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox disabled value="next" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox disabled value="next"></shad-combobox>`),
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-[260px]"><shad-combobox placeholder="اختر إطار العمل…" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<div dir="rtl"><shad-combobox placeholder="اختر…"></shad-combobox></div>`),
      },
    ],
    api: {
      props: [
        { name: "options", type: "ComboOption[]", default: "[]", description: "Items: { value, label, group? }." },
        { name: "value", type: "string", default: `""`, description: "Selected value (single mode); mirrored to the attribute." },
        { name: "values", type: "string[]", default: "[]", description: "Selected values (multiple mode)." },
        { name: "multiple", type: "boolean", default: "false", description: "Allow selecting several items (rendered as chips)." },
        { name: "clearable", type: "boolean", default: "false", description: "Show a clear (✕) control when something is selected." },
        { name: "placeholder", type: "string", default: `"Select…"`, description: "Trigger placeholder." },
        { name: "disabled", type: "boolean", default: "false", description: "Disable the control." },
        { name: "invalid", type: "boolean", default: "false", description: "Destructive border for invalid state." },
      ],
      events: [
        { name: "change", detail: "string | string[]", description: "Fires on select/clear; string (single) or string[] (multiple)." },
      ],
      extend: [
        `import { ShadCombobox } from "@youneed/dom-ui-shad";`,
        ``,
        `const cb = document.querySelector("shad-combobox");`,
        `cb.options = [{ value: "next", label: "Next.js" }, …];`,
        `cb.addEventListener("change", (e) => console.log(e.detail));`,
        ``,
        `// Keyboard: ↑/↓ to move, Enter to select, Esc to close; type to filter.`,
      ].join("\n"),
    },
  },
  command: {
    title: "Command",
    description: "Fast, composable, unstyled command menu.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_BASIC}></shad-command></div>`,
        code: CMD_CODE,
      },
      {
        name: "Shortcuts",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_SHORTCUTS}></shad-command></div>`,
        code: CMD_CODE,
      },
      {
        name: "Groups",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_GROUPS}></shad-command></div>`,
        code: [
          `<shad-command></shad-command>`,
          ``,
          `command.items = [`,
          `  { group: "Suggestions", value: "cal", label: "Calendar", icon: calendarIcon },`,
          `  { group: "Settings", value: "profile", label: "Profile", icon: userIcon, shortcut: "⌘P" },`,
          `];`,
        ].join("\n"),
      },
      {
        name: "Scrollable",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_MANY}></shad-command></div>`,
        code: CMD_CODE,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-[420px]"><shad-command placeholder="اكتب أمرًا…" .items=${CMD_GROUPS}></shad-command></div>`,
        code: CMD_CODE,
      },
    ],
    api: {
      props: [
        { name: "items", type: "CommandItem[]", default: "[]", description: "Commands: { value, label, group?, icon?, shortcut? }." },
        { name: "placeholder", type: "string", default: `"Type a command or search…"`, description: "Search input placeholder." },
      ],
      events: [
        { name: "select", detail: "string", description: "Fires when a command is chosen; detail is its value." },
      ],
      extend: [
        `import { ShadCommand } from "@youneed/dom-ui-shad";`,
        ``,
        `const cmd = document.querySelector("shad-command");`,
        `cmd.items = [{ value: "new", label: "New File", icon: fileIcon, shortcut: "⌘N" }, …];`,
        `cmd.addEventListener("select", (e) => run(e.detail));`,
      ].join("\n"),
    },
  },
  empty: {
    title: "Empty",
    description: "Use the Empty component to display an empty state.",
    examples: [
      {
        name: "Basic",
        render: () => emptyDemo(),
        code: [
          `<shad-empty>`,
          `  <shad-empty-header>`,
          `    <shad-empty-media variant="icon"><svg>…</svg></shad-empty-media>`,
          `    <shad-empty-title>No Projects Yet</shad-empty-title>`,
          `    <shad-empty-description>Get started by creating your first project.</shad-empty-description>`,
          `  </shad-empty-header>`,
          `  <shad-empty-content>`,
          `    <shad-button>Create Project</shad-button>`,
          `    <shad-button variant="outline">Import Project</shad-button>`,
          `  </shad-empty-content>`,
          `</shad-empty>`,
        ].join("\n"),
      },
      { name: "Outline", render: () => emptyDemo({ variant: "outline" }), code: `<shad-empty variant="outline"> … </shad-empty>` },
      { name: "Background", render: () => emptyDemo({ variant: "background" }), code: `<shad-empty variant="background"> … </shad-empty>` },
      {
        name: "Avatar",
        render: () => emptyDemo({ variant: "outline", media: "avatar" }),
        code: `<shad-empty-media variant="default"><shad-avatar src="…"></shad-avatar></shad-empty-media>`,
      },
      {
        name: "Avatar Group",
        render: () => emptyDemo({ variant: "outline", media: "group" }),
        code: `<shad-empty-media variant="default"><shad-avatar-group>…</shad-avatar-group></shad-empty-media>`,
      },
      {
        name: "InputGroup",
        render: () => emptyDemo({ variant: "outline", media: "input" }),
        code: [
          `<shad-empty-content>`,
          `  <shad-input placeholder="Search projects…"></shad-input>`,
          `  <shad-button>Search</shad-button>`,
          `</shad-empty-content>`,
        ].join("\n"),
      },
      { name: "RTL", render: () => emptyDemo({ variant: "outline", rtl: true }) },
    ],
    api: {
      props: [
        { name: "Empty · variant", type: `"default" | "outline" | "background"`, default: `"default"`, description: "The container surface: plain, dashed border, or a subtle gradient." },
        { name: "EmptyMedia · variant", type: `"icon" | "default"`, default: `"icon"`, description: "icon → a muted rounded box; default → bare (for an avatar / group)." },
      ],
      slots: [
        { name: "shad-empty", description: "The container; centers its header + content." },
        { name: "shad-empty-header", description: "Wraps media + title + description." },
        { name: "shad-empty-media", description: "An icon (in a box) or an avatar." },
        { name: "shad-empty-title", description: "The empty-state heading." },
        { name: "shad-empty-description", description: "Supporting text (links are underlined)." },
        { name: "shad-empty-content", description: "Actions row (buttons, an input group, etc.)." },
      ],
      extend: [
        `import { ShadEmpty } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose the parts, or subclass for a preset empty state:`,
        `class NoResults extends ShadEmpty {`,
        `  variant = "outline";`,
        `}`,
      ].join("\n"),
    },
  },
  item: {
    title: "Item",
    description: "A flexible container for a title, description, media and actions.",
    examples: [
      {
        name: "Variants",
        render: () => html`<div class="flex w-full max-w-md flex-col gap-4">
          ${map(
            ["default", "outline", "muted"] as const,
            (v) => html`<shad-item variant=${v}>
              <shad-item-content>
                <shad-item-title>${v[0].toUpperCase() + v.slice(1)} Item</shad-item-title>
                <shad-item-description>A ${v} item with a title and description.</shad-item-description>
              </shad-item-content>
              <shad-item-actions><shad-button variant="outline" size="sm">Action</shad-button></shad-item-actions>
            </shad-item>`,
          )}
        </div>`,
        code: [
          `<shad-item variant="outline">`,
          `  <shad-item-content>`,
          `    <shad-item-title>Basic Item</shad-item-title>`,
          `    <shad-item-description>A simple item.</shad-item-description>`,
          `  </shad-item-content>`,
          `  <shad-item-actions><shad-button size="sm">Action</shad-button></shad-item-actions>`,
          `</shad-item>`,
        ].join("\n"),
      },
      {
        name: "Size",
        render: () => html`<div class="flex w-full max-w-md flex-col gap-4">
          ${map(
            ["default", "sm", "xs"] as const,
            (s) => html`<shad-item variant="outline" size=${s}>
              <shad-item-media variant="icon">${itBadge}</shad-item-media>
              <shad-item-content><shad-item-title>Size ${s}</shad-item-title></shad-item-content>
              <shad-item-actions>${itChevron}</shad-item-actions>
            </shad-item>`,
          )}
        </div>`,
      },
      {
        name: "Icon",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media variant="icon">${itBadge}</shad-item-media>
            <shad-item-content>
              <shad-item-title>Your profile has been verified.</shad-item-title>
              <shad-item-description>Verified 2 minutes ago.</shad-item-description>
            </shad-item-content>
            <shad-item-actions><shad-button variant="outline" size="sm">View</shad-button></shad-item-actions>
          </shad-item>
        </div>`,
      },
      {
        name: "Avatar",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media>
              <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            </shad-item-media>
            <shad-item-content>
              <shad-item-title>shadcn</shad-item-title>
              <shad-item-description>Last seen 5 months ago.</shad-item-description>
            </shad-item-content>
            <shad-item-actions><shad-button variant="outline" size="sm">Follow</shad-button></shad-item-actions>
          </shad-item>
        </div>`,
      },
      {
        name: "Image",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media variant="image">
              <img src="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=80&h=80&fit=crop" alt="thumb" />
            </shad-item-media>
            <shad-item-content>
              <shad-item-title>Music for a Sunday Morning</shad-item-title>
              <shad-item-description>A playlist of calm tracks.</shad-item-description>
            </shad-item-content>
            <shad-item-actions>${itChevron}</shad-item-actions>
          </shad-item>
        </div>`,
      },
      {
        name: "Group",
        render: () => html`<div class="w-full max-w-md">
          <shad-item-group class="rounded-lg border border-border">
            ${map(
              [["Profile", "Manage your public profile."], ["Billing", "Update your payment details."], ["Notifications", "Choose what you hear about."]],
              ([t, d], i) => html`
                ${when(i > 0, () => html`<shad-item-separator></shad-item-separator>`)}
                <shad-item href="#">
                  <shad-item-content>
                    <shad-item-title>${t}</shad-item-title>
                    <shad-item-description>${d}</shad-item-description>
                  </shad-item-content>
                  <shad-item-actions>${itChevron}</shad-item-actions>
                </shad-item>`,
            )}
          </shad-item-group>
        </div>`,
        code: [
          `<shad-item-group>`,
          `  <shad-item href="#"> … </shad-item>`,
          `  <shad-item-separator></shad-item-separator>`,
          `  <shad-item href="#"> … </shad-item>`,
          `</shad-item-group>`,
        ].join("\n"),
      },
      {
        name: "Header",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-header>
              <shad-item-title>Storage</shad-item-title>
              <shad-badge>Pro</shad-badge>
            </shad-item-header>
            <shad-item-content>
              <shad-item-description>You are using 8.2 GB of your 20 GB plan.</shad-item-description>
            </shad-item-content>
          </shad-item>
        </div>`,
      },
      {
        name: "Link",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline" size="sm" href="#">
            <shad-item-media variant="icon">${itBadge}</shad-item-media>
            <shad-item-content><shad-item-title>Your profile has been verified.</shad-item-title></shad-item-content>
            <shad-item-actions>${itChevron}</shad-item-actions>
          </shad-item>
        </div>`,
        code: `<shad-item href="/profile"> … </shad-item>  <!-- renders an <a>, hover bg -->`,
      },
      {
        name: "Dropdown",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media><shad-avatar alt="Jane">JD</shad-avatar></shad-item-media>
            <shad-item-content>
              <shad-item-title>Jane Doe</shad-item-title>
              <shad-item-description>jane@example.com</shad-item-description>
            </shad-item-content>
            <shad-item-actions>
              <shad-dropdown-menu align="end" .items=${[{ label: "Edit" }, { label: "Share" }, { separator: true }, { label: "Delete", destructive: true }]}>
                <shad-button variant="ghost" size="icon-xs">${itDots}</shad-button>
              </shad-dropdown-menu>
            </shad-item-actions>
          </shad-item>
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media variant="icon">${itBadge}</shad-item-media>
            <shad-item-content>
              <shad-item-title>تم التحقق من ملفك الشخصي.</shad-item-title>
              <shad-item-description>قبل دقيقتين.</shad-item-description>
            </shad-item-content>
            <shad-item-actions><shad-button variant="outline" size="sm">عرض</shad-button></shad-item-actions>
          </shad-item>
        </div>`,
      },
    ],
    api: {
      props: [
        { name: "Item · variant", type: `"default" | "outline" | "muted"`, default: `"default"`, description: "The container surface." },
        { name: "Item · size", type: `"default" | "sm" | "xs"`, default: `"default"`, description: "Padding density." },
        { name: "Item · href", type: "string", default: `""`, description: "Renders the item as an <a> (a clickable row with hover)." },
        { name: "ItemMedia · variant", type: `"default" | "icon" | "image"`, default: `"default"`, description: "Bare, a muted icon box, or an image thumbnail." },
      ],
      slots: [
        { name: "shad-item", description: "The row container (div or <a>)." },
        { name: "shad-item-group / -separator", description: "Stack items into a list with dividers." },
        { name: "shad-item-media", description: "Leading icon / avatar / image." },
        { name: "shad-item-content", description: "Wraps title + description (grows to fill)." },
        { name: "shad-item-title / -description", description: "The primary + secondary text." },
        { name: "shad-item-actions", description: "Trailing buttons / dropdown (kept to the right)." },
        { name: "shad-item-header / -footer", description: "Full-width rows above / below the main line." },
      ],
      extend: [
        `import { ShadItem } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose the parts; or subclass for a preset row:`,
        `class SettingRow extends ShadItem {`,
        `  variant = "outline";`,
        `  href = "#";`,
        `}`,
      ].join("\n"),
    },
  },
  kbd: {
    title: "Kbd",
    description: "Used to display textual user input from keyboard.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex flex-col items-center gap-4">
          <shad-kbd-group>
            <shad-kbd>⌘</shad-kbd><shad-kbd>⇧</shad-kbd><shad-kbd>⌥</shad-kbd><shad-kbd>⌃</shad-kbd>
          </shad-kbd-group>
          <shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>
        </div>`,
        code: [
          `<shad-kbd-group>`,
          `  <shad-kbd>⌘</shad-kbd><shad-kbd>⇧</shad-kbd><shad-kbd>⌥</shad-kbd>`,
          `</shad-kbd-group>`,
          ``,
          `<shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>`,
        ].join("\n"),
      },
      {
        name: "Group",
        render: () => html`<div class="flex items-center gap-2 text-sm text-muted-foreground">
          Press <shad-kbd-group><shad-kbd>⌘</shad-kbd><shad-kbd>J</shad-kbd></shad-kbd-group> to open.
        </div>`,
      },
      {
        name: "Button",
        render: () => html`<shad-button variant="outline" size="sm">
          Accept <shad-kbd>⏎</shad-kbd>
        </shad-button>`,
        code: `<shad-button variant="outline" size="sm">Accept <shad-kbd>⏎</shad-kbd></shad-button>`,
      },
      {
        name: "Tooltip",
        render: () => html`<shad-tooltip>
          <shad-button variant="outline">Print</shad-button>
          <span slot="content" class="flex items-center gap-2">Print document <shad-kbd>⌘P</shad-kbd></span>
        </shad-tooltip>`,
        code: `<shad-tooltip>\n  <shad-button variant="outline">Print</shad-button>\n  <span slot="content">Print document <shad-kbd>⌘P</shad-kbd></span>\n</shad-tooltip>`,
      },
      {
        name: "Input Group",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Search…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end"><shad-kbd>⌘K</shad-kbd></shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-2 text-sm text-muted-foreground">
          اضغط <shad-kbd-group><shad-kbd>⌘</shad-kbd><shad-kbd>J</shad-kbd></shad-kbd-group> للفتح.
        </div>`,
      },
    ],
    api: {
      slots: [
        { name: "shad-kbd", description: "A single key — text or an icon (sized automatically)." },
        { name: "shad-kbd-group", description: "Groups several keys (and plain separators like “+”)." },
      ],
      extend: [
        `import { ShadKbd } from "@youneed/dom-ui-shad";`,
        ``,
        `// Just a styled <kbd>; drop it anywhere text flows:`,
        `<shad-kbd>⌘K</shad-kbd>`,
        `<shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>`,
      ].join("\n"),
    },
  },
  "dropdown-menu": {
    title: "Dropdown Menu",
    description: "Displays a menu to the user — triggered by a button.",
    examples: [
      { name: "Basic", render: () => ddTrigger(DD_BASIC), code: DD_CODE },
      { name: "Submenu", render: () => ddTrigger(DD_COMPLEX) },
      { name: "Shortcuts", render: () => ddTrigger(DD_SHORTCUTS) },
      { name: "Icons", render: () => ddTrigger(DD_ICONS) },
      { name: "Checkboxes", render: () => ddTrigger(DD_CHECKBOXES) },
      { name: "Checkboxes Icons", render: () => ddTrigger(DD_CHECKBOXES_ICONS) },
      { name: "Radio Group", render: () => ddTrigger(DD_RADIO) },
      { name: "Radio Icons", render: () => ddTrigger(DD_RADIO_ICONS) },
      { name: "Destructive", render: () => ddTrigger(DD_DESTRUCTIVE) },
      {
        name: "Avatar",
        render: () =>
          ddTrigger(
            DD_BASIC,
            html`<button class="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            </button>`,
          ),
        code: [
          `<shad-dropdown-menu>`,
          `  <button><shad-avatar src="…"></shad-avatar></button> <!-- any node is the trigger -->`,
          `</shad-dropdown-menu>`,
        ].join("\n"),
      },
      { name: "Complex", render: () => ddTrigger(DD_COMPLEX), code: DD_CODE },
      { name: "RTL", render: () => html`<div dir="rtl">${ddTrigger(DD_COMPLEX)}</div>` },
    ],
    api: {
      props: [
        { name: "items", type: "MenuEntry[]", default: "[]", description: "Menu structure (heading, separator, item, checkbox, radio, submenu)." },
        { name: "align", type: `"start" | "end"`, default: `"start"`, description: "Align the menu's start/end edge to the trigger." },
      ],
      events: [
        { name: "select", detail: "string", description: "An action item was chosen; detail is its value/label." },
        { name: "checkedchange", detail: "{ value, checked }", description: "A checkbox item toggled." },
        { name: "radiochange", detail: "{ group, value }", description: "A radio option was picked." },
      ],
      slots: [{ name: "(default)", description: "The trigger (a button, avatar, or any element). Clicking it opens the menu." }],
      extend: [
        `import { ShadDropdownMenu } from "@youneed/dom-ui-shad";`,
        ``,
        `const m = document.querySelector("shad-dropdown-menu");`,
        `m.items = [`,
        `  { heading: true, label: "My Account" },`,
        `  { label: "Profile", shortcut: "⇧⌘P" },`,
        `  { label: "Invite users", items: [{ label: "Email" }] }, // submenu`,
        `  { checkbox: true, label: "Status Bar", value: "status", checked: true },`,
        `  { radio: "pos", value: "top", label: "Top", checked: true },`,
        `  { label: "Log out", destructive: true },`,
        `];`,
        `m.addEventListener("select", (e) => console.log(e.detail));`,
      ].join("\n"),
    },
  },
  menubar: {
    title: "Menubar",
    description: "A visually persistent menu common in desktop applications.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-menubar .menus=${MB_MENUS}></shad-menubar>`,
        code: [
          `<shad-menubar></shad-menubar>`,
          ``,
          `bar.menus = [`,
          `  { label: "File", items: [`,
          `    { label: "New Tab", shortcut: "⌘T" },`,
          `    { label: "Share", items: [{ label: "Email link" }] }, // submenu`,
          `  ] },`,
          `  { label: "Edit", items: [ … ] },`,
          `];`,
          `bar.addEventListener("select", (e) => console.log(e.detail));`,
        ].join("\n"),
      },
      { name: "Checkbox", render: () => html`<shad-menubar .menus=${[MB_MENUS[2]]}></shad-menubar>` },
      { name: "Radio", render: () => html`<shad-menubar .menus=${[MB_MENUS[3]]}></shad-menubar>` },
      { name: "Submenu", render: () => html`<shad-menubar .menus=${[MB_MENUS[0]]}></shad-menubar>` },
      { name: "With Icons", render: () => html`<shad-menubar .menus=${MB_ICONS}></shad-menubar>` },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-menubar .menus=${MB_MENUS}></shad-menubar></div>` },
    ],
    api: {
      props: [
        { name: "menus", type: "MenubarMenu[]", default: "[]", description: "Top-level menus, each { label, items: MenuEntry[] }." },
      ],
      events: [
        { name: "select", detail: "string", description: "An action item was chosen; detail is its value/label." },
        { name: "checkedchange", detail: "{ value, checked }", description: "A checkbox item toggled." },
        { name: "radiochange", detail: "{ group, value }", description: "A radio option was picked." },
      ],
      extend: [
        `import { ShadMenubar } from "@youneed/dom-ui-shad";`,
        ``,
        `const bar = document.querySelector("shad-menubar");`,
        `bar.menus = [`,
        `  { label: "File", items: [`,
        `    { label: "New Tab", shortcut: "⌘T" },`,
        `    { separator: true },`,
        `    { label: "Share", items: [{ label: "Email link" }] }, // submenu`,
        `  ] },`,
        `  { label: "View", items: [`,
        `    { checkbox: true, label: "Full URLs", value: "urls", checked: true },`,
        `  ] },`,
        `];`,
        `bar.addEventListener("select", (e) => console.log(e.detail));`,
      ].join("\n"),
    },
  },
  "navigation-menu": {
    title: "Navigation Menu",
    description: "A collection of links for navigating websites.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex min-h-[260px] justify-center pt-4"><shad-navigation-menu .items=${NAV_ITEMS}></shad-navigation-menu></div>`,
        code: [
          `<shad-navigation-menu></shad-navigation-menu>`,
          ``,
          `nav.items = [`,
          `  { label: "Getting started", links: [`,
          `    { title: "Introduction", href: "/docs", description: "…" },`,
          `  ] },`,
          `  { label: "Components", cols: 2, links: components },`,
          `  { label: "Docs", href: "/docs" },   // a plain link`,
          `];`,
        ].join("\n"),
      },
      {
        name: "Link Component",
        render: () => html`<div class="flex justify-center pt-2">
          <shad-navigation-menu .items=${[{ label: "Home", href: "#" }, { label: "Docs", href: "#" }, { label: "Pricing", href: "#" }]}></shad-navigation-menu>
        </div>`,
        code: `nav.items = [{ label: "Home", href: "/" }, { label: "Docs", href: "/docs" }];`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex min-h-[260px] justify-center pt-4"><shad-navigation-menu .items=${NAV_ITEMS}></shad-navigation-menu></div>`,
      },
    ],
    api: {
      props: [
        { name: "items", type: "NavItem[]", default: "[]", description: "Each item is a trigger (links/content) or a plain link (href)." },
      ],
      slots: [],
      extend: [
        `import { ShadNavigationMenu } from "@youneed/dom-ui-shad";`,
        ``,
        `const nav = document.querySelector("shad-navigation-menu");`,
        `nav.items = [`,
        `  { label: "Getting started", width: "w-96", links: [`,
        `    { title: "Introduction", href: "/docs", description: "Re-usable components." },`,
        `  ] },`,
        `  { label: "Components", cols: 2, width: "w-[520px]", links: components },`,
        `  { label: "Docs", href: "/docs" },`,
        `];`,
      ].join("\n"),
    },
  },
  "context-menu": {
    title: "Context Menu",
    description: "Displays a menu located at the pointer, triggered by a right click.",
    examples: [
      { name: "Basic", render: () => cmTrigger(CM_BASIC), code: CM_CODE },
      { name: "Submenu", render: () => cmTrigger(CM_FULL), code: CM_SUB_CODE },
      { name: "Icons", render: () => cmTrigger(CM_ICONS), code: CM_CODE },
      { name: "Checkboxes & Radio", render: () => cmTrigger(CM_FULL), code: CM_SUB_CODE },
      { name: "Destructive", render: () => cmTrigger(CM_DESTRUCTIVE), code: CM_CODE },
      { name: "RTL", render: () => html`<div dir="rtl">${cmTrigger(CM_FULL)}</div>`, code: CM_SUB_CODE },
    ],
    api: {
      props: [
        { name: "items", type: "MenuEntry[]", default: "[]", description: "Menu structure (see kinds below)." },
      ],
      events: [
        { name: "select", detail: "string", description: "An action item was chosen; detail is its value/label." },
        { name: "checkedchange", detail: "{ value, checked }", description: "A checkbox item toggled." },
        { name: "radiochange", detail: "{ group, value }", description: "A radio option was picked." },
      ],
      slots: [{ name: "(default)", description: "The trigger area (right-click opens the menu at the cursor)." }],
      extend: [
        `import { ShadContextMenu } from "@youneed/dom-ui-shad";`,
        ``,
        `const m = document.querySelector("shad-context-menu");`,
        `m.items = [`,
        `  { label: "Reload", shortcut: "⌘R" },`,
        `  { label: "More Tools", items: [{ label: "Developer Tools" }] }, // submenu`,
        `  { separator: true },`,
        `  { checkbox: true, label: "Show Bookmarks", value: "bm", checked: true },`,
        `  { heading: "People" },`,
        `  { radio: "people", value: "pedro", label: "Pedro Duarte", checked: true },`,
        `  { label: "Delete", destructive: true },`,
        `];`,
        `m.addEventListener("select", (e) => console.log(e.detail));`,
      ].join("\n"),
    },
  },
  toggle: {
    title: "Toggle",
    description: "A two-state button that can be on or off.",
    examples: [
      {
        render: () => html`
          <div class="flex gap-3">
            <shad-toggle variant="outline">B</shad-toggle>
            <shad-toggle variant="outline">I</shad-toggle>
            <shad-toggle variant="outline">U</shad-toggle>
          </div>
        `,
      },
    ],
  },
  progress: {
    title: "Progress",
    description: "Displays an indicator showing completion progress.",
    examples: [
      { name: "Basic", render: () => html`<div class="w-full max-w-md"><shad-progress value="60"></shad-progress></div>` },
      {
        name: "Controlled",
        render: () => {
          const set = (e: Event, delta: number) => {
            const root = (e.currentTarget as Element).closest("[data-ctl]")!;
            const bar = root.querySelector<HTMLElement & { value: number }>("shad-progress")!;
            const v = Math.max(0, Math.min(100, bar.value + delta));
            bar.value = v;
            root.querySelector("[data-pct]")!.textContent = v + "%";
          };
          return html`<div data-ctl class="flex w-full max-w-md flex-col gap-3">
            <shad-progress value="40"></shad-progress>
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground"><span data-pct class="font-medium text-foreground">40%</span> complete</span>
              <div class="flex gap-2">
                <shad-button variant="outline" size="sm" @click=${(e: Event) => set(e, -10)}>−10</shad-button>
                <shad-button variant="outline" size="sm" @click=${(e: Event) => set(e, 10)}>+10</shad-button>
              </div>
            </div>
          </div>`;
        },
        code: [
          `<shad-progress value="40"></shad-progress>`,
          ``,
          `// Drive it from your own state:`,
          `const bar = document.querySelector("shad-progress");`,
          `bar.value = 66;   // reactive — the indicator animates to the new value`,
        ].join("\n"),
      },
    ],
    api: {
      props: [{ name: "value", type: "number", default: "0", description: "Completion percentage (0–100); mirrored to the attribute." }],
      extend: [
        `import { ShadProgress } from "@youneed/dom-ui-shad";`,
        ``,
        `const bar = document.querySelector("shad-progress");`,
        `bar.value = 66;   // the indicator transitions to the new value`,
      ].join("\n"),
    },
  },
  resizable: {
    title: "Resizable",
    description: "Accessible resizable panel groups and layouts with keyboard support.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-resizable-panel-group orientation="horizontal" class="h-[220px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="50%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">One</span></div>
          </shad-resizable-panel>
          <shad-resizable-handle with-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="50%">
            <shad-resizable-panel-group orientation="vertical">
              <shad-resizable-panel default-size="25%">
                <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Two</span></div>
              </shad-resizable-panel>
              <shad-resizable-handle with-handle></shad-resizable-handle>
              <shad-resizable-panel default-size="75%">
                <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Three</span></div>
              </shad-resizable-panel>
            </shad-resizable-panel-group>
          </shad-resizable-panel>
        </shad-resizable-panel-group>`,
        code: [
          `<shad-resizable-panel-group orientation="horizontal" class="rounded-lg border">`,
          `  <shad-resizable-panel default-size="50%"> … One … </shad-resizable-panel>`,
          `  <shad-resizable-handle with-handle></shad-resizable-handle>`,
          `  <shad-resizable-panel default-size="50%">`,
          `    <shad-resizable-panel-group orientation="vertical"> … Two / Three … </shad-resizable-panel-group>`,
          `  </shad-resizable-panel>`,
          `</shad-resizable-panel-group>`,
        ].join("\n"),
      },
      {
        name: "Vertical",
        render: () => html`<shad-resizable-panel-group orientation="vertical" class="h-[220px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="40%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Header</span></div>
          </shad-resizable-panel>
          <shad-resizable-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="60%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Content</span></div>
          </shad-resizable-panel>
        </shad-resizable-panel-group>`,
        code: `<shad-resizable-panel-group orientation="vertical"> … </shad-resizable-panel-group>`,
      },
      {
        name: "Handle",
        render: () => html`<shad-resizable-panel-group orientation="horizontal" class="h-[160px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="25%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Sidebar</span></div>
          </shad-resizable-panel>
          <shad-resizable-handle with-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="75%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Main</span></div>
          </shad-resizable-panel>
        </shad-resizable-panel-group>`,
        code: `<shad-resizable-handle with-handle></shad-resizable-handle>  <!-- shows the grip -->`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-resizable-panel-group orientation="horizontal" class="h-[160px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="50%"><div class="flex h-full items-center justify-center p-6"><span class="font-semibold">واحد</span></div></shad-resizable-panel>
          <shad-resizable-handle with-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="50%"><div class="flex h-full items-center justify-center p-6"><span class="font-semibold">اثنان</span></div></shad-resizable-panel>
        </shad-resizable-panel-group></div>`,
      },
    ],
    api: {
      props: [
        { name: "PanelGroup · orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Split direction (reflected for nested styling)." },
        { name: "Panel · default-size", type: "string", default: "equal", description: `Initial size weight, e.g. "50%" (panels share space proportionally).` },
        { name: "Handle · with-handle", type: "boolean", default: "false", description: "Show the draggable grip on the separator." },
      ],
      events: [
        { name: "resize", detail: "number[]", description: "Fires on the panel group while resizing (drag or arrow keys); detail is the panel sizes in percent (sums to 100)." },
      ],
      slots: [
        { name: "shad-resizable-panel-group", description: "The flex container; nest one inside a panel for grids." },
        { name: "shad-resizable-panel", description: "A resizable region (flex-basis 0; grows by weight)." },
        { name: "shad-resizable-handle", description: "Drag (pointer) or arrow-key to resize the adjacent panels." },
      ],
      extend: [
        `import { ShadResizablePanelGroup } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose freely; sizes are proportional flex-grow weights.`,
        `<shad-resizable-panel-group orientation="horizontal">`,
        `  <shad-resizable-panel default-size="30%"> … </shad-resizable-panel>`,
        `  <shad-resizable-handle with-handle></shad-resizable-handle>`,
        `  <shad-resizable-panel default-size="70%"> … </shad-resizable-panel>`,
        `</shad-resizable-panel-group>`,
        ``,
        `// React to resizing — detail is the panel sizes in percent:`,
        `group.addEventListener("resize", (e) => console.log(e.detail)); // e.g. [62.5, 37.5]`,
      ].join("\n"),
    },
  },
  "radio-group": {
    title: "Radio Group",
    description: "A set of checkable buttons where no more than one can be checked at a time.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-radio-group value="comfortable" class="w-fit">
          ${map(
            [["default", "Default"], ["comfortable", "Comfortable"], ["compact", "Compact"]],
            ([v, label], i) => html`<div class="flex items-center gap-3">
              <shad-radio-group-item value=${v} id=${"rg-" + i}></shad-radio-group-item>
              <shad-label for=${"rg-" + i}>${label}</shad-label>
            </div>`,
          )}
        </shad-radio-group>`,
        code: [
          `<shad-radio-group value="comfortable">`,
          `  <div class="flex items-center gap-3">`,
          `    <shad-radio-group-item value="default" id="r1"></shad-radio-group-item>`,
          `    <shad-label for="r1">Default</shad-label>`,
          `  </div>`,
          `  …`,
          `</shad-radio-group>`,
          ``,
          `group.addEventListener("change", (e) => console.log(e.detail));`,
        ].join("\n"),
      },
      {
        name: "Description",
        render: () => html`<shad-radio-group value="card" class="w-fit gap-4">
          ${map(
            [
              ["card", "Card", "Pay with your saved credit or debit card."],
              ["paypal", "PayPal", "You'll be redirected to PayPal to finish."],
              ["apple", "Apple Pay", "Pay quickly with Touch ID or Face ID."],
            ],
            ([v, t, d], i) => html`<div class="flex items-start gap-3">
              <shad-radio-group-item value=${v} id=${"rd-" + i} class="mt-0.5"></shad-radio-group-item>
              <div class="grid gap-0.5">
                <shad-label for=${"rd-" + i}>${t}</shad-label>
                <p class="text-sm text-muted-foreground">${d}</p>
              </div>
            </div>`,
          )}
        </shad-radio-group>`,
      },
      {
        name: "Choice Card",
        render: () => html`<shad-radio-group value="pro" class="grid w-full max-w-md gap-3">
          ${map(
            [
              ["starter", "Starter", "For individuals and small teams."],
              ["pro", "Pro", "For growing businesses."],
              ["enterprise", "Enterprise", "For large teams and enterprises."],
            ],
            ([v, t, d], i) => html`<shad-label
              for=${"cc-" + i}
              class="block rounded-lg border border-border p-3.5 transition-colors hover:bg-muted/50 has-[shad-radio-group-item[checked]]:border-primary has-[shad-radio-group-item[checked]]:bg-muted/40"
            >
              <div class="flex items-center gap-3">
                <div class="flex flex-1 flex-col gap-1">
                  <span class="font-medium leading-none">${t}</span>
                  <span class="text-sm font-normal text-muted-foreground">${d}</span>
                </div>
                <shad-radio-group-item value=${v} id=${"cc-" + i}></shad-radio-group-item>
              </div>
            </shad-label>`,
          )}
        </shad-radio-group>`,
        code: [
          `<shad-label for="r1" class="block rounded-lg border p-3.5`,
          `  has-[shad-radio-group-item[checked]]:border-primary">`,
          `  <div class="flex items-center gap-3">`,
          `    <div class="flex flex-1 flex-col gap-1">`,
          `      <span class="font-medium">Pro</span>`,
          `      <span class="text-sm text-muted-foreground">For growing businesses.</span>`,
          `    </div>`,
          `    <shad-radio-group-item value="pro" id="r1"></shad-radio-group-item>`,
          `  </div>`,
          `</shad-label>`,
        ].join("\n"),
      },
      {
        name: "Disabled",
        render: () => html`<shad-radio-group value="one" class="w-fit">
          <div class="flex items-center gap-3"><shad-radio-group-item value="one" id="rdis1"></shad-radio-group-item><shad-label for="rdis1">Enabled</shad-label></div>
          <div class="flex items-center gap-3"><shad-radio-group-item value="two" id="rdis2" disabled></shad-radio-group-item><shad-label for="rdis2">Disabled option</shad-label></div>
        </shad-radio-group>`,
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col gap-2">
          <shad-radio-group invalid class="w-fit">
            ${map(
              [["yes", "Yes"], ["no", "No"]],
              ([v, label], i) => html`<div class="flex items-center gap-3"><shad-radio-group-item value=${v} id=${"riv-" + i}></shad-radio-group-item><shad-label for=${"riv-" + i}>${label}</shad-label></div>`,
            )}
          </shad-radio-group>
          <p class="text-sm text-destructive">Please select an option.</p>
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-radio-group value="comfortable" class="w-fit">
          ${map(
            [["default", "افتراضي"], ["comfortable", "مريح"], ["compact", "مضغوط"]],
            ([v, label], i) => html`<div class="flex items-center gap-3"><shad-radio-group-item value=${v} id=${"rr-" + i}></shad-radio-group-item><shad-label for=${"rr-" + i}>${label}</shad-label></div>`,
          )}
        </shad-radio-group></div>`,
      },
    ],
    api: {
      props: [
        { name: "RadioGroup · value", type: "string", default: `""`, description: "The selected item's value; mirrored to the attribute." },
        { name: "RadioGroup · disabled", type: "boolean", default: "false", description: "Disables the whole group." },
        { name: "RadioGroup · invalid", type: "boolean", default: "false", description: "Marks every item invalid (destructive ring)." },
        { name: "RadioGroupItem · value / id / disabled", type: "string / string / boolean", default: "—", description: "Item value, id (for <shad-label for>), and per-item disable." },
      ],
      events: [{ name: "change", detail: "string", description: "Fires when the selection changes; detail is the new value." }],
      slots: [
        { name: "shad-radio-group", description: "Wraps the items (often in flex rows with labels)." },
        { name: "shad-radio-group-item", description: "A single radio control." },
      ],
      extend: [
        `import { ShadRadioGroup } from "@youneed/dom-ui-shad";`,
        ``,
        `const group = document.querySelector("shad-radio-group");`,
        `group.value = "compact";                       // select programmatically`,
        `group.addEventListener("change", (e) => console.log(e.detail));`,
      ].join("\n"),
    },
  },
  pagination: {
    title: "Pagination",
    description: "Pagination with page navigation, next and previous links.",
    examples: [
      {
        name: "Simple",
        render: () => html`<shad-pagination page="2" total="10"></shad-pagination>`,
        code: [
          `<shad-pagination page="2" total="10"></shad-pagination>`,
          ``,
          `pager.addEventListener("change", (e) => goToPage(e.detail));`,
        ].join("\n"),
      },
      {
        name: "Icons Only",
        render: () => html`<shad-pagination page="4" total="10" icons-only></shad-pagination>`,
        code: `<shad-pagination page="4" total="10" icons-only></shad-pagination>`,
      },
      {
        name: "Links (href)",
        render: () => html`<shad-pagination page="2" total="5" .hrefFor=${(p: number) => `#page-${p}`}></shad-pagination>`,
        code: [
          `// Render real <a href> links (SSR / router) instead of buttons:`,
          `pager.hrefFor = (page) => \`/products?page=\${page}\`;`,
        ].join("\n"),
      },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-pagination page="2" total="10"></shad-pagination></div>` },
    ],
    api: {
      props: [
        { name: "page", type: "number", default: "1", description: "Current page (1-based); mirrored to the attribute." },
        { name: "total", type: "number", default: "1", description: "Total number of pages." },
        { name: "siblings", type: "number", default: "1", description: "How many page numbers to show on each side of the current page." },
        { name: "iconsOnly", type: "boolean", default: "false", description: `Previous/Next show only chevrons (attribute "icons-only").` },
        { name: "hrefFor", type: "(page) => string", default: "—", description: "Property: render items as <a href> for SSR/router links." },
      ],
      events: [
        { name: "change", detail: "number", description: "Fires when a page is chosen (button mode); detail is the new page." },
      ],
      extend: [
        `import { ShadPagination } from "@youneed/dom-ui-shad";`,
        ``,
        `const pager = document.querySelector("shad-pagination");`,
        `pager.total = 20;`,
        `pager.addEventListener("change", (e) => { pager.page = e.detail; load(e.detail); });`,
        ``,
        `// Or real links for an SSR app:`,
        `pager.hrefFor = (page) => \`/products?page=\${page}\`;`,
      ].join("\n"),
    },
  },
  avatar: {
    title: "Avatar",
    description: "An image element with a fallback for representing the user.",
    examples: [
      {
        name: "Basic",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            <shad-avatar alt="no image">JD</shad-avatar>
          </div>
        `,
      },
      {
        name: "Badge",
        render: () => html`
          <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">
            CN
            <span slot="badge" class="h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"></span>
          </shad-avatar>
        `,
      },
      {
        name: "Badge with Icon",
        render: () => html`
          <shad-avatar size="lg" alt="Jane Doe">
            JD
            <span slot="badge" class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
          </shad-avatar>
        `,
      },
      {
        name: "Avatar Group",
        render: () => html`
          <shad-avatar-group>
            <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            <shad-avatar alt="Jane Doe">JD</shad-avatar>
            <shad-avatar alt="Alex Kim">AK</shad-avatar>
          </shad-avatar-group>
        `,
      },
      {
        name: "Avatar Group Count",
        render: () => html`
          <shad-avatar-group>
            <shad-avatar alt="Chris">CN</shad-avatar>
            <shad-avatar alt="Jane Doe">JD</shad-avatar>
            <shad-avatar alt="Alex Kim">AK</shad-avatar>
            <shad-avatar alt="3 more"><span class="text-xs">+3</span></shad-avatar>
          </shad-avatar-group>
        `,
      },
      {
        name: "Avatar Group with Icon",
        render: () => html`
          <shad-avatar-group>
            <shad-avatar alt="Chris">CN</shad-avatar>
            <shad-avatar alt="Jane Doe">JD</shad-avatar>
            <shad-avatar alt="Add person">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            </shad-avatar>
          </shad-avatar-group>
        `,
      },
      {
        name: "Sizes",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-avatar size="sm" alt="sm">SM</shad-avatar>
            <shad-avatar alt="default">MD</shad-avatar>
            <shad-avatar size="lg" alt="lg">LG</shad-avatar>
          </div>
        `,
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-avatar-group>
              <shad-avatar alt="Chris">CN</shad-avatar>
              <shad-avatar alt="Jane Doe">JD</shad-avatar>
              <shad-avatar alt="Alex Kim">AK</shad-avatar>
            </shad-avatar-group>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "src", type: "string", default: `""`, description: "Image URL; falls back to the slotted content if empty or it fails to load." },
        { name: "alt", type: "string", default: `""`, description: "Alternative text for the image." },
        { name: "size", type: `"sm" | "default" | "lg"`, default: `"default"`, description: "Avatar diameter (h-8 / h-10 / h-14)." },
      ],
      slots: [
        { name: "(default)", description: "Fallback content (initials / icon) shown until the image loads." },
        { name: "badge", description: "Optional corner indicator — a status dot or small icon." },
      ],
      extend: [
        `import { Component } from "@youneed/dom";`,
        `import { ShadAvatar } from "@youneed/dom-ui-shad";`,
        ``,
        `// Always-large avatar that derives its alt text into initials.`,
        `@Component.define()`,
        `export class UserAvatar extends ShadAvatar {`,
        `  static tagName = "user-avatar";`,
        ``,
        `  override size = "lg" as const;`,
        `}`,
        ``,
        `// Stack avatars with <shad-avatar-group> (overlap + ring):`,
        `// <shad-avatar-group><shad-avatar>CN</shad-avatar>…</shad-avatar-group>`,
      ].join("\n"),
    },
  },
  skeleton: {
    title: "Skeleton",
    description: "Use to show a placeholder while content is loading.",
    examples: [
      {
        name: "Avatar",
        render: () => html`<div class="flex items-center gap-4">
          <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>
          <div class="flex flex-col gap-2">
            <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>
            <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>
          </div>
        </div>`,
        code: [
          `<div class="flex items-center gap-4">`,
          `  <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>`,
          `  <div class="flex flex-col gap-2">`,
          `    <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>`,
          `    <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>`,
          `  </div>`,
          `</div>`,
        ].join("\n"),
      },
      {
        name: "Card",
        render: () => html`<div class="flex flex-col gap-3">
          <shad-skeleton class="h-[125px] w-[250px] rounded-xl"></shad-skeleton>
          <div class="flex flex-col gap-2">
            <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>
            <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>
          </div>
        </div>`,
      },
      {
        name: "Text",
        render: () => html`<div class="flex w-full max-w-sm flex-col gap-2">
          <shad-skeleton class="h-4 w-full"></shad-skeleton>
          <shad-skeleton class="h-4 w-full"></shad-skeleton>
          <shad-skeleton class="h-4 w-full"></shad-skeleton>
          <shad-skeleton class="h-4 w-3/4"></shad-skeleton>
        </div>`,
      },
      {
        name: "Form",
        render: () => html`<div class="flex w-full max-w-sm flex-col gap-5">
          ${map(
            ["w-16", "w-20", "w-14"],
            (lw) => html`<div class="flex flex-col gap-2">
              <shad-skeleton class=${"h-3.5 " + lw}></shad-skeleton>
              <shad-skeleton class="h-9 w-full"></shad-skeleton>
            </div>`,
          )}
          <shad-skeleton class="h-9 w-24 self-end"></shad-skeleton>
        </div>`,
      },
      {
        name: "Table",
        render: () => html`<div class="w-full max-w-md overflow-hidden rounded-lg border border-border">
          <div class="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5">
            ${map(["w-24", "w-32", "w-16"], (w) => html`<shad-skeleton class=${"h-4 " + w}></shad-skeleton>`)}
          </div>
          ${map(
            [0, 1, 2, 3],
            () => html`<div class="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
              <shad-skeleton class="h-4 w-24"></shad-skeleton>
              <shad-skeleton class="h-4 w-32"></shad-skeleton>
              <shad-skeleton class="h-4 w-16"></shad-skeleton>
            </div>`,
          )}
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-4">
          <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>
          <div class="flex flex-col gap-2">
            <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>
            <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>
          </div>
        </div>`,
      },
    ],
    api: {
      slots: [{ name: "(default)", description: "None — size and shape the host with utility classes (h-*, w-*, rounded-*)." }],
      extend: [
        `import { ShadSkeleton } from "@youneed/dom-ui-shad";`,
        ``,
        `<shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>  <!-- avatar -->`,
        `<shad-skeleton class="h-4 w-[200px]"></shad-skeleton>          <!-- text line -->`,
      ].join("\n"),
    },
  },
  slider: {
    title: "Slider",
    description: "An input where the user selects a value from within a given range.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[75]} max="100" step="1"></shad-slider></div>`,
        code: [
          `<shad-slider max="100" step="1"></shad-slider>`,
          ``,
          `slider.value = [75];                              // one thumb`,
          `slider.addEventListener("change", (e) => console.log(e.detail));`,
        ].join("\n"),
      },
      {
        name: "Range",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[25, 60]} max="100"></shad-slider></div>`,
        code: `<shad-slider></shad-slider>\n\nslider.value = [25, 60];   // two thumbs → a range`,
      },
      {
        name: "Multiple Thumbs",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[15, 45, 80]} max="100"></shad-slider></div>`,
        code: `slider.value = [15, 45, 80];   // any number of thumbs`,
      },
      {
        name: "Vertical",
        render: () => html`<div class="flex h-44 justify-center"><shad-slider orientation="vertical" .value=${[40]}></shad-slider></div>`,
        code: `<shad-slider orientation="vertical"></shad-slider>`,
      },
      {
        name: "Controlled",
        render: () => html`<div class="mx-auto grid w-full max-w-xs gap-3">
          <div class="flex items-center justify-between gap-2">
            <shad-label for="slider-temp">Temperature</shad-label>
            <span data-out class="text-sm text-muted-foreground">0.3, 0.7</span>
          </div>
          <shad-slider
            id="slider-temp"
            .value=${[0.3, 0.7]}
            min="0"
            max="1"
            step="0.1"
            @change=${(e: Event) => {
              const out = (e.currentTarget as Element).closest("[class*=grid]")!.querySelector("[data-out]")!;
              out.textContent = (e as CustomEvent<number[]>).detail.map((n) => n.toFixed(1)).join(", ");
            }}
          ></shad-slider>
        </div>`,
        code: [
          `<shad-slider id="t" min="0" max="1" step="0.1"></shad-slider>`,
          ``,
          `slider.value = [0.3, 0.7];`,
          `slider.addEventListener("change", (e) => {`,
          `  label.textContent = e.detail.join(", ");   // e.g. "0.3, 0.7"`,
          `});`,
        ].join("\n"),
      },
      {
        name: "Disabled",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[40]} disabled></shad-slider></div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-xs"><shad-slider .value=${[30]} max="100"></shad-slider></div>`,
      },
    ],
    api: {
      props: [
        { name: "value", type: "number[]", default: "[50]", description: "Thumb values; one entry per thumb (reflected via change)." },
        { name: "min / max / step", type: "number", default: "0 / 100 / 1", description: "Range bounds and snap increment." },
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Slider direction." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables interaction and dims it." },
      ],
      events: [{ name: "change", detail: "number[]", description: "Fires on drag / arrow keys; detail is the new value array." }],
      extend: [
        `import { ShadSlider } from "@youneed/dom-ui-shad";`,
        ``,
        `const slider = document.querySelector("shad-slider");`,
        `slider.value = [25, 75];                          // range`,
        `slider.addEventListener("change", (e) => console.log(e.detail));`,
      ].join("\n"),
    },
  },
  spinner: {
    title: "Spinner",
    description: "An indicator that can be used to show a loading state.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex w-full max-w-xs flex-col gap-4">
          <shad-item variant="muted">
            <shad-item-media><shad-spinner></shad-spinner></shad-item-media>
            <shad-item-content><shad-item-title>Processing payment…</shad-item-title></shad-item-content>
            <shad-item-actions><span class="text-sm tabular-nums">$100.00</span></shad-item-actions>
          </shad-item>
        </div>`,
        code: [
          `<shad-item variant="muted">`,
          `  <shad-item-media><shad-spinner></shad-spinner></shad-item-media>`,
          `  <shad-item-content><shad-item-title>Processing payment…</shad-item-title></shad-item-content>`,
          `</shad-item>`,
        ].join("\n"),
      },
      {
        name: "Size",
        render: () => html`<div class="flex items-center gap-6 text-foreground">
          <shad-spinner class="size-4"></shad-spinner>
          <shad-spinner class="size-6"></shad-spinner>
          <shad-spinner class="size-8"></shad-spinner>
          <shad-spinner class="size-10 text-primary"></shad-spinner>
        </div>`,
        code: `<shad-spinner class="size-8"></shad-spinner>  <!-- size + color via classes -->`,
      },
      {
        name: "Button",
        render: () => html`<div class="flex gap-3">
          <shad-button disabled><shad-spinner></shad-spinner> Loading…</shad-button>
          <shad-button variant="outline" disabled><shad-spinner></shad-spinner> Please wait</shad-button>
        </div>`,
        code: `<shad-button disabled><shad-spinner></shad-spinner> Loading…</shad-button>`,
      },
      {
        name: "Badge",
        render: () => html`<shad-badge variant="secondary"><shad-spinner class="size-3"></shad-spinner> Syncing</shad-badge>`,
        code: `<shad-badge><shad-spinner class="size-3"></shad-spinner> Syncing</shad-badge>`,
      },
      {
        name: "Input Group",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Checking…" value="my-username"></shad-input-group-input>
            <shad-input-group-addon align="inline-end"><shad-spinner></shad-spinner></shad-input-group-addon>
          </shad-input-group>
        </div>`,
      },
      {
        name: "Empty",
        render: () => html`<div class="flex h-56 w-full">
          <shad-empty variant="outline">
            <shad-empty-header>
              <shad-empty-media variant="icon"><shad-spinner></shad-spinner></shad-empty-media>
              <shad-empty-title>Loading projects…</shad-empty-title>
              <shad-empty-description>This may take a few seconds.</shad-empty-description>
            </shad-empty-header>
          </shad-empty>
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-button disabled><shad-spinner></shad-spinner> جارٍ التحميل…</shad-button></div>`,
      },
    ],
    api: {
      slots: [{ name: "(default)", description: "None — size the host (size-4 default) and color via currentColor." }],
      extend: [
        `import { ShadSpinner } from "@youneed/dom-ui-shad";`,
        ``,
        `<shad-spinner></shad-spinner>                <!-- 1rem, inherits color -->`,
        `<shad-spinner class="size-8 text-primary"></shad-spinner>`,
      ].join("\n"),
    },
  },
  sonner: {
    title: "Toast (Sonner)",
    description: "An opinionated toast component — call toast() from anywhere.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div>
          <shad-toaster></shad-toaster>
          <shad-button
            variant="outline"
            @click=${() =>
              toast("Event has been created", {
                description: "Sunday, December 03, 2023 at 9:00 AM",
                action: { label: "Undo", onClick: () => {} },
              })}
            >Show Toast</shad-button
          >
        </div>`,
        code: [
          `import { toast } from "@youneed/dom-ui-shad";`,
          ``,
          `<shad-toaster></shad-toaster>   <!-- once on the page -->`,
          ``,
          `toast("Event has been created", {`,
          `  description: "Sunday, December 03, 2023 at 9:00 AM",`,
          `  action: { label: "Undo", onClick: () => undo() },`,
          `});`,
        ].join("\n"),
      },
      {
        name: "Types",
        render: () => html`<div class="flex flex-wrap gap-2">
          <shad-button variant="outline" size="sm" @click=${() => toast("Event created")}>Default</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.success("Changes saved")}>Success</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.error("Something went wrong")}>Error</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.warning("Low on storage")}>Warning</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.info("New update available")}>Info</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.loading("Uploading…", { duration: 2500 })}>Loading</shad-button>
        </div>`,
        code: `toast.success("Saved"); toast.error("Failed"); toast.loading("Working…");`,
      },
      {
        name: "Description",
        render: () => html`<shad-button
          variant="outline"
          @click=${() => toast("Scheduled: Catch up", { description: "Friday, February 10, 2023 at 5:57 PM" })}
          >Show Toast</shad-button
        >`,
        code: `toast("Scheduled: Catch up", { description: "Friday, February 10, 2023 at 5:57 PM" });`,
      },
      {
        name: "Position",
        render: () => html`<div class="flex flex-wrap gap-2">
          ${map(
            ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"],
            (pos) => html`<shad-button variant="outline" size="sm" @click=${() => toast(pos, { position: pos })}>${pos}</shad-button>`,
          )}
        </div>`,
        code: [
          `// Per-toast position (only the new toast moves):`,
          `toast("Saved", { position: "top-center" });`,
          ``,
          `// Or set the default for all toasts on the toaster:`,
          `<shad-toaster position="top-center"></shad-toaster>`,
        ].join("\n"),
      },
    ],
    api: {
      props: [
        { name: "Toaster · position", type: `"top|bottom"-"left|center|right"`, default: `"bottom-right"`, description: "Corner the toast stack anchors to." },
        { name: "toast(msg, opts)", type: "fn", default: "—", description: "opts: description, action {label,onClick}, type, duration. Plus toast.success/error/warning/info/loading/message/dismiss." },
      ],
      slots: [{ name: "shad-toaster", description: "Place one on the page; toast() renders into it." }],
      extend: [
        `import { toast } from "@youneed/dom-ui-shad";`,
        ``,
        `const id = toast.loading("Saving…");`,
        `await save();`,
        `toast.dismiss(id);`,
        `toast.success("Saved");`,
      ].join("\n"),
    },
  },
  separator: {
    title: "Separator",
    description: "Visually or semantically separates content.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex max-w-sm flex-col gap-4 rounded-lg border border-border bg-background p-6 text-sm">
          <div class="flex flex-col gap-1.5">
            <div class="font-medium leading-none">youneed/shad</div>
            <div class="text-muted-foreground">The Foundation for your Design System</div>
          </div>
          <shad-separator></shad-separator>
          <div>A set of beautifully designed components that you can customize, extend, and build on.</div>
        </div>`,
        code: [
          `<div class="flex flex-col gap-4">`,
          `  <div>…</div>`,
          `  <shad-separator></shad-separator>`,
          `  <div>…</div>`,
          `</div>`,
        ].join("\n"),
      },
      {
        name: "Vertical",
        render: () => html`<div class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-sm">
          <span>Blog</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>Docs</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>Source</span>
        </div>`,
        code: `<shad-separator orientation="vertical"></shad-separator>`,
      },
      {
        name: "Menu",
        render: () => html`<div class="flex items-center gap-3 rounded-lg border border-border p-1.5 text-sm">
          <button class="rounded-md px-2 py-1 hover:bg-muted">File</button>
          <shad-separator orientation="vertical" class="!h-4"></shad-separator>
          <button class="rounded-md px-2 py-1 hover:bg-muted">Edit</button>
          <shad-separator orientation="vertical" class="!h-4"></shad-separator>
          <button class="rounded-md px-2 py-1 hover:bg-muted">View</button>
        </div>`,
      },
      {
        name: "List",
        render: () => html`<div class="w-full max-w-xs overflow-hidden rounded-lg border border-border">
          ${map(
            ["Inbox", "Drafts", "Sent", "Archive"],
            (label, i) => html`
              ${when(i > 0, () => html`<shad-separator></shad-separator>`)}
              <div class="px-3 py-2 text-sm hover:bg-muted">${label}</div>
            `,
          )}
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-sm">
          <span>المدونة</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>الوثائق</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>المصدر</span>
        </div>`,
      },
    ],
    api: {
      props: [
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Line direction. Vertical stretches to the flex row's height (self-stretch)." },
      ],
      extend: [
        `import { ShadSeparator } from "@youneed/dom-ui-shad";`,
        ``,
        `<shad-separator></shad-separator>                         <!-- horizontal -->`,
        `<shad-separator orientation="vertical"></shad-separator>  <!-- vertical (in a flex row) -->`,
      ].join("\n"),
    },
  },
  "scroll-area": {
    title: "Scroll Area",
    description: "Augments native scroll functionality for custom, cross-browser styling.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-scroll-area class="h-72 w-48 rounded-md border border-border">
          <div class="p-4">
            <h4 class="mb-4 text-sm font-medium leading-none">Tags</h4>
            ${map(
              Array.from({ length: 50 }, (_, i) => `v1.2.0-beta.${50 - i}`),
              (tag) => html`<div class="text-sm">${tag}</div><shad-separator class="my-2"></shad-separator>`,
            )}
          </div>
        </shad-scroll-area>`,
        code: [
          `<shad-scroll-area class="h-72 w-48 rounded-md border">`,
          `  <div class="p-4">`,
          `    <h4 class="mb-4 text-sm font-medium">Tags</h4>`,
          `    <div class="text-sm">v1.2.0-beta.50</div>`,
          `    <shad-separator class="my-2"></shad-separator>`,
          `    …`,
          `  </div>`,
          `</shad-scroll-area>`,
        ].join("\n"),
      },
      {
        name: "Horizontal",
        render: () => html`<shad-scroll-area orientation="horizontal" class="w-96 max-w-full rounded-md border border-border">
          <div class="flex w-max gap-4 p-4">
            ${map(
              Array.from({ length: 12 }, (_, i) => i + 1),
              (n) => html`<figure class="shrink-0">
                <div class="flex h-32 w-32 items-center justify-center rounded-md bg-muted text-3xl font-semibold">${n}</div>
                <figcaption class="pt-2 text-xs text-muted-foreground">Photo ${n}</figcaption>
              </figure>`,
            )}
          </div>
        </shad-scroll-area>`,
        code: `<shad-scroll-area orientation="horizontal" class="rounded-md border"><div class="flex w-max gap-4 p-4">…</div></shad-scroll-area>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-scroll-area class="h-56 w-48 rounded-md border border-border">
          <div class="p-4">
            <h4 class="mb-4 text-sm font-medium leading-none">العلامات</h4>
            ${map(
              Array.from({ length: 30 }, (_, i) => `الإصدار ${30 - i}`),
              (t) => html`<div class="text-sm">${t}</div><shad-separator class="my-2"></shad-separator>`,
            )}
          </div>
        </shad-scroll-area></div>`,
      },
    ],
    api: {
      props: [
        { name: "orientation", type: `"vertical" | "horizontal" | "both"`, default: `"vertical"`, description: "Which axis scrolls (the scrollbar is themed and slim)." },
      ],
      slots: [{ name: "(default)", description: "The scrollable content. Set the host's height/width to bound it." }],
      extend: [
        `import { ShadScrollArea } from "@youneed/dom-ui-shad";`,
        ``,
        `// Bound it with size classes; the slim themed scrollbar is built in.`,
        `<shad-scroll-area class="h-72 w-48 rounded-md border"> … </shad-scroll-area>`,
        `<shad-scroll-area orientation="horizontal"> … </shad-scroll-area>`,
      ].join("\n"),
    },
  },
  sidebar: {
    title: "Sidebar",
    description: "A composable, themeable and customizable sidebar component.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="h-[460px] w-full overflow-hidden rounded-lg border border-border">
          <shad-sidebar-provider>
            <shad-sidebar>
              <shad-sidebar-header>
                <shad-sidebar-menu>
                  <shad-sidebar-menu-item>
                    <shad-sidebar-menu-button size="lg">
                      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">A</span>
                      <span class="flex flex-col leading-tight group-data-[state=collapsed]/sidebar:hidden"><span class="font-medium">Acme Inc</span><span class="text-xs text-muted-foreground">Enterprise</span></span>
                      ${sbUpDown}
                    </shad-sidebar-menu-button>
                  </shad-sidebar-menu-item>
                </shad-sidebar-menu>
              </shad-sidebar-header>
              <shad-sidebar-content>
                <shad-sidebar-group>
                  <shad-sidebar-group-label>Platform</shad-sidebar-group-label>
                  <shad-sidebar-menu>
                    <shad-sidebar-menu-item default-open>
                      <shad-sidebar-menu-button active>${sbTerminal}<span class="group-data-[state=collapsed]/sidebar:hidden">Playground</span>${sbChevron}</shad-sidebar-menu-button>
                      <shad-sidebar-menu-sub>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>History</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Starred</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Settings</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                      </shad-sidebar-menu-sub>
                    </shad-sidebar-menu-item>
                    <shad-sidebar-menu-item>
                      <shad-sidebar-menu-button>${sbBot}<span class="group-data-[state=collapsed]/sidebar:hidden">Models</span>${sbChevron}</shad-sidebar-menu-button>
                      <shad-sidebar-menu-sub>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Genesis</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Explorer</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Quantum</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                      </shad-sidebar-menu-sub>
                    </shad-sidebar-menu-item>
                    <shad-sidebar-menu-item><shad-sidebar-menu-button>${sbBook}<span class="group-data-[state=collapsed]/sidebar:hidden">Documentation</span></shad-sidebar-menu-button><shad-sidebar-menu-badge>3</shad-sidebar-menu-badge></shad-sidebar-menu-item>
                    <shad-sidebar-menu-item>
                      <shad-sidebar-menu-button>${sbSettings}<span class="group-data-[state=collapsed]/sidebar:hidden">Settings</span>${sbChevron}</shad-sidebar-menu-button>
                      <shad-sidebar-menu-sub>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>General</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Team</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Billing</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                      </shad-sidebar-menu-sub>
                    </shad-sidebar-menu-item>
                  </shad-sidebar-menu>
                </shad-sidebar-group>
              </shad-sidebar-content>
              <shad-sidebar-footer>
                <shad-sidebar-menu>
                  <shad-sidebar-menu-item>
                    <shad-dropdown-menu side="right" align="end" .items=${SB_USER_MENU} class="block">
                      <shad-sidebar-menu-button size="lg">
                        <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
                        <span class="flex flex-col leading-tight group-data-[state=collapsed]/sidebar:hidden"><span class="font-medium">shadcn</span><span class="text-xs text-muted-foreground">m@example.com</span></span>
                        ${sbUpDown}
                      </shad-sidebar-menu-button>
                    </shad-dropdown-menu>
                  </shad-sidebar-menu-item>
                </shad-sidebar-menu>
              </shad-sidebar-footer>
              <shad-sidebar-rail></shad-sidebar-rail>
            </shad-sidebar>
            <shad-sidebar-inset>
              <header class="flex h-12 items-center gap-2 border-b border-border px-3">
                <shad-sidebar-trigger></shad-sidebar-trigger>
                <shad-separator orientation="vertical" class="my-2"></shad-separator>
                <span class="text-sm text-muted-foreground">Dashboard</span>
              </header>
              <div class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">A sidebar that collapses to icons.</div>
            </shad-sidebar-inset>
          </shad-sidebar-provider>
        </div>`,
        code: [
          `<shad-sidebar-provider>`,
          `  <shad-sidebar>`,
          `    <shad-sidebar-header> … </shad-sidebar-header>`,
          `    <shad-sidebar-content>`,
          `      <shad-sidebar-group>`,
          `        <shad-sidebar-group-label>Platform</shad-sidebar-group-label>`,
          `        <shad-sidebar-menu>`,
          `          <shad-sidebar-menu-item>`,
          `            <shad-sidebar-menu-button active><svg/><span>Playground</span></shad-sidebar-menu-button>`,
          `          </shad-sidebar-menu-item>`,
          `        </shad-sidebar-menu>`,
          `      </shad-sidebar-group>`,
          `    </shad-sidebar-content>`,
          `    <shad-sidebar-footer> … </shad-sidebar-footer>`,
          `    <shad-sidebar-rail></shad-sidebar-rail>`,
          `  </shad-sidebar>`,
          `  <shad-sidebar-inset><shad-sidebar-trigger></shad-sidebar-trigger> … </shad-sidebar-inset>`,
          `</shad-sidebar-provider>`,
        ].join("\n"),
      },
    ],
    api: {
      props: [
        { name: "SidebarProvider · open", type: "boolean", default: "true", description: "Expanded/collapsed state (reflected as data-state; toggled by trigger, rail, or ⌘/Ctrl+B)." },
        { name: "SidebarMenuButton · active / size / href", type: "boolean / \"default\"|\"lg\" / string", default: "—", description: "Highlight, row height, and render as a link." },
      ],
      slots: [
        { name: "shad-sidebar-provider", description: "Wraps the sidebar + inset; owns the open state." },
        { name: "shad-sidebar", description: "The panel (header / content / footer / rail). Collapses to an icon rail." },
        { name: "shad-sidebar-group + -label / -menu / -menu-item / -menu-button", description: "Sections and navigation rows (button with icon + <span> label)." },
        { name: "shad-sidebar-menu-sub / -sub-item / -sub-button", description: "Nested sub-navigation." },
        { name: "shad-sidebar-menu-action / -menu-badge", description: "Trailing action button / count badge on a row." },
        { name: "shad-sidebar-trigger / -rail / -inset", description: "Toggle button, draggable edge, and the main content area." },
      ],
      extend: [
        `import { ShadSidebarProvider } from "@youneed/dom-ui-shad";`,
        ``,
        `const provider = document.querySelector("shad-sidebar-provider");`,
        `provider.toggle();        // or set provider.open = false`,
        `// ⌘/Ctrl+B toggles it too. The provider is a Tailwind group: hide labels`,
        `// on collapse with class="group-data-[state=collapsed]/sidebar:hidden".`,
      ].join("\n"),
    },
  },
  textarea: {
    title: "Textarea",
    description: "Displays a multi-line form text field.",
    examples: [
      { render: () => html`<div class="max-w-md"><shad-textarea placeholder="Type your message here." rows="4"></shad-textarea></div>` },
    ],
  },
  alert: {
    title: "Alert",
    description: "Displays a callout for user attention.",
    examples: [
      {
        name: "Default",
        render: () => html`<div class="w-full max-w-md"><shad-alert><span slot="title">Heads up!</span>You can add components to your app using the CLI.</shad-alert></div>`,
      },
      {
        name: "With Icon",
        render: () => html`
          <div class="w-full max-w-md">
            <shad-alert>
              <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>
              </svg>
              <span slot="title">Payment successful</span>
              Your payment of $29.99 has been processed. A receipt was sent to your email.
            </shad-alert>
          </div>
        `,
      },
      {
        name: "Destructive",
        render: () => html`
          <div class="w-full max-w-md">
            <shad-alert variant="destructive">
              <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>
              </svg>
              <span slot="title">Unable to process payment</span>
              Your card was declined. Please try a different payment method.
            </shad-alert>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "variant", type: `"default" | "destructive"`, default: `"default"`, description: "Visual tone of the callout." },
      ],
      slots: [
        { name: "icon", description: "Optional leading icon (e.g. an <svg>); adds the icon column when present." },
        { name: "title", description: "The alert heading." },
        { name: "(default)", description: "The alert description / body." },
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadAlert } from "@youneed/dom-ui-shad";`,
        ``,
        `// A success alert that ships its own icon + default title.`,
        `@Component.define()`,
        `export class SuccessAlert extends ShadAlert {`,
        `  static tagName = "success-alert";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      <svg slot="icon" viewBox="0 0 24 24"><!-- check --></svg>`,
        `      <span slot="title">Success</span>`,
        `      \${super.render()}\`;`,
        `  }`,
        `}`,
      ].join("\n"),
    },
  },
  "aspect-ratio": {
    title: "Aspect Ratio",
    description: "Displays content within a desired ratio.",
    examples: [
      {
        name: "Default",
        render: () => html`
          <div class="w-full max-w-md">
            <shad-aspect-ratio class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">16 / 9</div>
            </shad-aspect-ratio>
          </div>
        `,
      },
      {
        name: "Square",
        render: () => html`
          <div class="w-full max-w-[16rem]">
            <shad-aspect-ratio ratio="1" class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">1 / 1</div>
            </shad-aspect-ratio>
          </div>
        `,
      },
      {
        name: "Portrait",
        render: () => html`
          <div class="w-full max-w-[14rem]">
            <shad-aspect-ratio ratio="0.75" class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">3 / 4</div>
            </shad-aspect-ratio>
          </div>
        `,
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl" class="w-full max-w-md">
            <shad-aspect-ratio class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">16 / 9</div>
            </shad-aspect-ratio>
          </div>
        `,
      },
    ],
    api: {
      props: [
        { name: "ratio", type: "number", default: "16 / 9", description: "Width ÷ height — e.g. 1 (square), 0.75 (3/4 portrait), 1.7777 (16/9)." },
      ],
      slots: [{ name: "(default)", description: "The content to constrain — an <img>, <video>, or any box (it fills the frame)." }],
      extend: [
        `import { Component } from "@youneed/dom";`,
        `import { ShadAspectRatio } from "@youneed/dom-ui-shad";`,
        ``,
        `// A poster that locks every instance to a 2:3 movie ratio.`,
        `@Component.define()`,
        `export class Poster extends ShadAspectRatio {`,
        `  static tagName = "movie-poster";`,
        ``,
        `  override ratio = 2 / 3;`,
        `}`,
        ``,
        `// <movie-poster><img src="…" /></movie-poster>`,
      ].join("\n"),
    },
  },
  tabs: {
    title: "Tabs",
    description: "A set of layered sections of content shown one at a time.",
    examples: [
      {
        render: () => html`
          <shad-tabs value="account" class="max-w-md">
            <shad-tab value="account" title="Account">Make changes to your account here.</shad-tab>
            <shad-tab value="password" title="Password">Change your password here.</shad-tab>
          </shad-tabs>
        `,
      },
    ],
  },
  accordion: {
    title: "Accordion",
    description: "A vertically stacked set of interactive headings that each reveal a section of content.",
    examples: [
      {
        name: "Single",
        render: () => html`
          <shad-accordion type="single" class="w-full max-w-md">
            <shad-accordion-item title="What are your shipping options?" open
              >We offer standard (5–7 days), express (2–3 days), and overnight shipping.</shad-accordion-item
            >
            <shad-accordion-item title="What is your return policy?"
              >Returns are accepted within 30 days of delivery, no questions asked.</shad-accordion-item
            >
            <shad-accordion-item title="How can I contact customer support?"
              >Reach us 24/7 by email at support@example.com or via live chat.</shad-accordion-item
            >
          </shad-accordion>
        `,
      },
      {
        name: "Multiple",
        render: () => html`
          <shad-accordion type="multiple" class="w-full max-w-md">
            <shad-accordion-item title="Is it accessible?" open
              >Yes — proper roles, aria-expanded/controls and keyboard support.</shad-accordion-item
            >
            <shad-accordion-item title="Is it animated?"
              >Yes — the height animates via a CSS grid track, the chevron rotates.</shad-accordion-item
            >
            <shad-accordion-item title="Can several be open at once?"
              >With <code>type="multiple"</code>, yes — each toggles independently.</shad-accordion-item
            >
          </shad-accordion>
        `,
      },
    ],
    api: {
      props: [
        { name: "type", type: `"single" | "multiple"`, default: `"single"`, description: "On <shad-accordion>: single closes siblings when one opens; multiple is independent." },
        { name: "title", type: "string", default: `""`, description: "On <shad-accordion-item>: the trigger heading text." },
        { name: "open", type: "boolean", default: "false", description: "On <shad-accordion-item>: whether the section starts expanded." },
      ],
      events: [
        { name: "toggle", detail: "boolean", description: "<shad-accordion-item> fires on expand/collapse; detail is the new open state." },
      ],
      slots: [{ name: "(default)", description: "On <shad-accordion-item>: the collapsible content." }],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadAccordionItem } from "@youneed/dom-ui-shad";`,
        ``,
        `// An item that starts open and logs every expand/collapse.`,
        `@Component.define()`,
        `export class FaqItem extends ShadAccordionItem {`,
        `  static tagName = "faq-item";`,
        ``,
        `  override open = true;`,
        ``,
        `  override toggle() {`,
        `    super.toggle();`,
        `    console.log("faq toggled:", this.title, this.open);`,
        `  }`,
        `}`,
      ].join("\n"),
    },
  },
  select: {
    title: "Select",
    description: "Displays a list of options for the user to pick from—triggered by a button.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-48">
          <shad-select placeholder="Select a fruit">
            <shad-option value="apple" group="Fruits">Apple</shad-option>
            <shad-option value="banana" group="Fruits">Banana</shad-option>
            <shad-option value="blueberry" group="Fruits">Blueberry</shad-option>
            <shad-option value="grapes" group="Fruits">Grapes</shad-option>
            <shad-option value="pineapple" group="Fruits">Pineapple</shad-option>
          </shad-select>
        </div>`,
        code: [
          `<shad-select placeholder="Select a fruit">`,
          `  <shad-option value="apple" group="Fruits">Apple</shad-option>`,
          `  <shad-option value="banana" group="Fruits">Banana</shad-option>`,
          `</shad-select>`,
          ``,
          `select.addEventListener("change", (e) => console.log(e.detail));`,
        ].join("\n"),
      },
      {
        name: "Align Item With Trigger",
        render: () => html`<div class="w-full max-w-48">
          <shad-select position="item" value="banana">
            <shad-option value="apple">Apple</shad-option>
            <shad-option value="banana">Banana</shad-option>
            <shad-option value="blueberry">Blueberry</shad-option>
            <shad-option value="grapes">Grapes</shad-option>
          </shad-select>
        </div>`,
        code: `<shad-select position="item"> … </shad-select>  <!-- selected item opens over the trigger -->`,
      },
      {
        name: "Groups",
        render: () => html`<div class="w-full max-w-48">
          <shad-select placeholder="Select a timezone">
            <shad-option value="est" group="North America">Eastern</shad-option>
            <shad-option value="cst" group="North America">Central</shad-option>
            <shad-option value="pst" group="North America">Pacific</shad-option>
            <shad-option value="gmt" group="Europe">GMT</shad-option>
            <shad-option value="cet" group="Europe">Central European</shad-option>
            <shad-option value="jst" group="Asia">Japan</shad-option>
            <shad-option value="ist" group="Asia">India</shad-option>
          </shad-select>
        </div>`,
        code: `<shad-option value="est" group="North America">Eastern</shad-option>  <!-- group → section label -->`,
      },
      {
        name: "Scrollable",
        render: () => html`<div class="w-full max-w-48">
          <shad-select placeholder="Select a number">
            ${map(Array.from({ length: 40 }, (_, i) => i + 1), (n) => html`<shad-option value=${String(n)}>Item ${n}</shad-option>`)}
          </shad-select>
        </div>`,
      },
      {
        name: "Disabled",
        render: () => html`<div class="flex flex-col gap-3">
          <div class="w-full max-w-48"><shad-select placeholder="Whole select disabled" disabled></shad-select></div>
          <div class="w-full max-w-48">
            <shad-select placeholder="Some options disabled">
              <shad-option value="apple">Apple</shad-option>
              <shad-option value="banana" disabled>Banana (out of stock)</shad-option>
              <shad-option value="grapes">Grapes</shad-option>
            </shad-select>
          </div>
        </div>`,
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col gap-2">
          <div class="w-full max-w-48">
            <shad-select placeholder="Select a fruit" invalid>
              <shad-option value="apple">Apple</shad-option>
              <shad-option value="banana">Banana</shad-option>
            </shad-select>
          </div>
          <p class="text-sm text-destructive">Please select a fruit.</p>
        </div>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-48">
          <shad-select placeholder="اختر فاكهة">
            <shad-option value="apple" group="الفواكه">تفاحة</shad-option>
            <shad-option value="banana" group="الفواكه">موز</shad-option>
            <shad-option value="grapes" group="الفواكه">عنب</shad-option>
          </shad-select>
        </div>`,
      },
    ],
    api: {
      props: [
        { name: "Select · value", type: "string", default: `""`, description: "The selected option's value; mirrored to the attribute." },
        { name: "Select · placeholder", type: "string", default: `"Select…"`, description: "Trigger text shown when nothing is selected." },
        { name: "Select · position", type: `"popper" | "item"`, default: `"popper"`, description: "Open below the trigger, or align the selected item over it." },
        { name: "Select · disabled / invalid", type: "boolean", default: "false", description: "Disable the control / mark it invalid (destructive ring)." },
        { name: "Option · value / disabled / group", type: "string / boolean / string", default: "—", description: "Option value, per-option disable, and section label." },
      ],
      events: [{ name: "change", detail: "string", description: "Fires when an option is chosen; detail is its value." }],
      slots: [{ name: "(default)", description: "<shad-option> children (data-only: value, disabled, group)." }],
      extend: [
        `import { ShadSelect } from "@youneed/dom-ui-shad";`,
        ``,
        `const select = document.querySelector("shad-select");`,
        `select.value = "banana";                          // select programmatically`,
        `select.addEventListener("change", (e) => console.log(e.detail));`,
      ].join("\n"),
    },
  },
  tooltip: {
    title: "Tooltip",
    description: "A popup that displays information on hover or focus.",
    examples: [
      {
        render: () => html`
          <shad-tooltip text="Add to library">
            <shad-button variant="outline">Hover me</shad-button>
          </shad-tooltip>
        `,
      },
    ],
  },
  "hover-card": {
    title: "Hover Card",
    description: "For sighted users to preview content available behind a link.",
    examples: [
      {
        name: "Basic",
        render: () => hoverCardDemo(),
        code: [
          `<shad-hover-card>`,
          `  <shad-button variant="link">@nextjs</shad-button>`,
          `  <div slot="content" class="flex w-64 flex-col gap-0.5">`,
          `    <div class="font-semibold">@nextjs</div>`,
          `    <div>The React Framework – created and maintained by @vercel.</div>`,
          `    <div class="mt-1 text-xs text-muted-foreground">Joined December 2021</div>`,
          `  </div>`,
          `</shad-hover-card>`,
        ].join("\n"),
      },
      {
        name: "Trigger Delays",
        render: () => hoverCardDemo({ openDelay: 10, closeDelay: 100, label: "Hover Here (fast)" }),
        code: `<shad-hover-card open-delay="10" close-delay="100"> … </shad-hover-card>`,
      },
      {
        name: "Sides",
        render: () => html`<div class="flex flex-wrap gap-8">
          ${map(
            ["top", "right", "bottom", "left"] as const,
            (side) => hoverCardDemo({ side, label: side }),
          )}
        </div>`,
        code: `<shad-hover-card side="top | right | bottom | left"> … </shad-hover-card>`,
      },
      { name: "RTL", render: () => html`<div dir="rtl">${hoverCardDemo()}</div>` },
    ],
    api: {
      props: [
        { name: "openDelay", type: "number", default: "700", description: `Ms before opening on hover (attribute "open-delay").` },
        { name: "closeDelay", type: "number", default: "300", description: `Ms before closing after the pointer leaves (attribute "close-delay").` },
        { name: "side", type: `"top" | "right" | "bottom" | "left"`, default: `"bottom"`, description: "Which side of the trigger the card opens on." },
        { name: "align", type: `"start" | "center" | "end"`, default: `"center"`, description: "Alignment along the chosen side." },
      ],
      slots: [
        { name: "(default)", description: "The trigger — hovering (or focusing) it opens the card." },
        { name: "content", description: "The card body shown in the popover." },
      ],
      extend: [
        `import { ShadHoverCard } from "@youneed/dom-ui-shad";`,
        ``,
        `// Hovering the trigger opens the card after open-delay ms; it stays`,
        `// open while the pointer is over the trigger OR the card.`,
        `class ProfileCard extends ShadHoverCard {`,
        `  openDelay = 100;`,
        `  side = "top";`,
        `}`,
      ].join("\n"),
    },
  },
  popover: {
    title: "Popover",
    description: "Displays rich content in a portal, triggered by a button.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-popover width="w-80">
          <shad-button variant="outline">Open popover</shad-button>
          <div slot="content" class="grid gap-4">
            <div class="space-y-1.5">
              <h4 class="font-medium leading-none">Dimensions</h4>
              <p class="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
            </div>
            <div class="grid gap-2">
              ${map(
                [["Width", "100%"], ["Max. width", "300px"], ["Height", "25px"], ["Max. height", "none"]],
                ([label, val]) => html`<div class="grid grid-cols-3 items-center gap-4">
                  <shad-label>${label}</shad-label>
                  <shad-input class="col-span-2" value=${val}></shad-input>
                </div>`,
              )}
            </div>
          </div>
        </shad-popover>`,
        code: [
          `<shad-popover width="w-80">`,
          `  <shad-button variant="outline">Open popover</shad-button>`,
          `  <div slot="content" class="grid gap-4"> … </div>`,
          `</shad-popover>`,
        ].join("\n"),
      },
      {
        name: "Align",
        render: () => html`<div class="flex gap-3">
          ${map(
            ["start", "center", "end"] as const,
            (a) => html`<shad-popover align=${a}>
              <shad-button variant="outline" size="sm">${a}</shad-button>
              <div slot="content" class="text-sm">Aligned to <b>${a}</b>.</div>
            </shad-popover>`,
          )}
        </div>`,
        code: `<shad-popover align="start | center | end"> … </shad-popover>`,
      },
      {
        name: "With Form",
        render: () => html`<shad-popover width="w-80">
          <shad-button>Update profile</shad-button>
          <div slot="content" class="grid gap-3">
            <div class="flex flex-col gap-2">
              <shad-label for="pop-name">Name</shad-label>
              <shad-input id="pop-name" value="Pedro Duarte"></shad-input>
            </div>
            <div class="flex flex-col gap-2">
              <shad-label for="pop-user">Username</shad-label>
              <shad-input id="pop-user" value="@peduarte"></shad-input>
            </div>
            <shad-button
              size="sm"
              class="justify-self-end"
              @click=${(e: Event) => (e.currentTarget as Element).closest<HTMLElement & { close(): void }>("shad-popover")!.close()}
              >Save</shad-button
            >
          </div>
        </shad-popover>`,
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-popover align="start">
          <shad-button variant="outline">افتح</shad-button>
          <div slot="content" class="text-sm text-muted-foreground">محتوى منبثق بمحاذاة البداية.</div>
        </shad-popover></div>`,
      },
    ],
    api: {
      props: [
        { name: "side", type: `"top" | "right" | "bottom" | "left"`, default: `"bottom"`, description: "Which side of the trigger the popover opens on." },
        { name: "align", type: `"start" | "center" | "end"`, default: `"center"`, description: "Alignment along the chosen side." },
        { name: "width", type: "string", default: `"w-72"`, description: "Tailwind width utility for the panel (e.g. w-80)." },
      ],
      slots: [
        { name: "(default)", description: "The trigger — clicking it toggles the popover." },
        { name: "content", description: "The panel body." },
      ],
      extend: [
        `import { ShadPopover } from "@youneed/dom-ui-shad";`,
        ``,
        `// .show() / outside-click + Escape close it.`,
        `const pop = document.querySelector("shad-popover");`,
        `pop.show();`,
      ].join("\n"),
    },
  },
  dialog: {
    title: "Dialog",
    description: "A window overlaid on the page, disabling the rest until dismissed.",
    examples: [
      { name: "Basic", render: () => dialogDemo() },
      {
        name: "Custom Close Button",
        render: () => dialogDemo({ closeButton: false, custom: true }),
        code: [
          `<shad-dialog close-button="false">`,
          `  <span slot="title">Edit profile</span>`,
          `  …`,
          `  <!-- slot="close" replaces the default X (top-right) -->`,
          `  <shad-button slot="close" variant="outline" size="sm">Close</shad-button>`,
          `</shad-dialog>`,
        ].join("\n"),
      },
      {
        name: "No Close Button",
        render: () => dialogDemo({ closeButton: false }),
        code: `<shad-dialog close-button="false"> … </shad-dialog>`,
      },
      {
        name: "Sticky Footer",
        render: () => dialogDemo({ sticky: true, long: true }),
        code: `<shad-dialog sticky-footer="true"> … </shad-dialog>`,
      },
      { name: "Scrollable Content", render: () => dialogDemo({ long: true }) },
      { name: "RTL", render: () => dialogDemo({ rtl: true }) },
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the dialog is shown; mirrored to the attribute." },
        { name: "closeButton", type: "boolean", default: "true", description: `Show the default top-right X (attribute "close-button").` },
        { name: "stickyFooter", type: "boolean", default: "false", description: `Footer gets a top border + muted bg bleeding to the edges (attribute "sticky-footer").` },
      ],
      events: [
        { name: "close", detail: "void", description: "Fires when the dialog closes (Escape, overlay click, or .close())." },
      ],
      slots: [
        { name: "title", description: "The dialog heading (rendered in the header)." },
        { name: "description", description: "Supporting text under the title." },
        { name: "(default)", description: "The body; scrolls when taller than the viewport." },
        { name: "footer", description: "Action buttons; right-aligned on ≥sm screens." },
        { name: "close", description: "Replaces the default close button (top-right). Falls back to the X." },
      ],
      extend: [
        `import { ShadDialog } from "@youneed/dom-ui-shad";`,
        ``,
        `const d = document.querySelector("shad-dialog");`,
        `d.show();                                  // or set the open attribute`,
        `d.addEventListener("close", () => …);`,
        ``,
        `// Subclass for a preset:`,
        `class ProfileDialog extends ShadDialog {`,
        `  stickyFooter = true;`,
        `}`,
      ].join("\n"),
    },
  },
  drawer: {
    title: "Drawer",
    description: "A panel that slides in from an edge of the screen.",
    examples: [
      { name: "Basic", render: () => drawerDemo() },
      { name: "Scrollable Content", render: () => drawerDemo({ long: true }) },
      {
        name: "Sides",
        render: () => html`<div class="flex flex-wrap gap-3">
          ${map(
            ["top", "right", "bottom", "left"] as const,
            (dir) => html`<div class="inline-block">
              <shad-button
                variant="outline"
                @click=${(e: Event) =>
                  (e.currentTarget as Element).parentElement!.querySelector<HTMLElement & { show(): void }>("shad-drawer")!.show()}
                >${dir}</shad-button
              >
              <shad-drawer direction=${dir}>
                <span slot="title">${dir[0].toUpperCase() + dir.slice(1)} Drawer</span>
                <span slot="description">This drawer slides in from the ${dir}.</span>
                <p class="text-sm text-muted-foreground">Put any content here.</p>
                <shad-button
                  slot="footer"
                  variant="outline"
                  @click=${(e: Event) => (e.currentTarget as Element).closest<HTMLElement & { close(): void }>("shad-drawer")!.close()}
                  >Close</shad-button
                >
              </shad-drawer>
            </div>`,
          )}
        </div>`,
        code: `<shad-drawer direction="top | right | bottom | left"> … </shad-drawer>`,
      },
      {
        name: "Responsive Dialog",
        render: () => drawerDemo({ responsive: true }),
        code: [
          `<!-- A centered dialog on ≥md screens, an edge drawer below. -->`,
          `<shad-drawer responsive="true"> … </shad-drawer>`,
        ].join("\n"),
      },
      { name: "RTL", render: () => drawerDemo({ direction: "right", rtl: true }) },
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the drawer is shown; mirrored to the attribute." },
        { name: "direction", type: `"bottom" | "top" | "left" | "right"`, default: `"bottom"`, description: "Which edge the drawer slides in from." },
        { name: "responsive", type: "boolean", default: "false", description: "Centered dialog on ≥md screens, edge drawer below." },
      ],
      events: [
        { name: "close", detail: "void", description: "Fires when the drawer closes (Escape, overlay click, or .close())." },
      ],
      slots: [
        { name: "title", description: "The drawer heading (centered for top/bottom)." },
        { name: "description", description: "Supporting text under the title." },
        { name: "(default)", description: "The body; scrolls when its content overflows." },
        { name: "footer", description: "Action buttons, stacked at the bottom." },
      ],
      extend: [
        `import { ShadDrawer } from "@youneed/dom-ui-shad";`,
        ``,
        `const d = document.querySelector("shad-drawer");`,
        `d.show();                              // or set the open attribute`,
        `d.addEventListener("close", () => …);`,
        ``,
        `class SideSheet extends ShadDrawer {`,
        `  direction = "right";`,
        `}`,
      ].join("\n"),
    },
  },
  "alert-dialog": {
    title: "Alert Dialog",
    description: "A modal dialog that interrupts the user with important content and expects a response.",
    examples: [
      { name: "Basic", render: () => alertDialogDemo({}) },
      { name: "Small", render: () => alertDialogDemo({ size: "sm" }) },
      { name: "Media", render: () => alertDialogDemo({ media: true }) },
      { name: "Small with Media", render: () => alertDialogDemo({ size: "sm", media: true }) },
      { name: "Destructive", render: () => alertDialogDemo({ destructive: true }) },
      { name: "RTL", render: () => alertDialogDemo({ rtl: true }) },
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the dialog is shown; mirrored to the attribute." },
        { name: "size", type: `"default" | "sm"`, default: `"default"`, description: "Dialog width — default (max-w-lg) or sm (max-w-sm)." },
      ],
      events: [
        { name: "close", detail: "void", description: "Fires when the dialog closes (Escape or a footer action calling .close())." },
      ],
      slots: [
        { name: "media", description: "Optional illustration shown on top; centers the dialog content when present." },
        { name: "title", description: "The dialog heading (announced via aria-labelledby)." },
        { name: "description", description: "Supporting text (announced via aria-describedby)." },
        { name: "footer", description: "Action buttons — typically Cancel + a confirm action." },
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadAlertDialog } from "@youneed/dom-ui-shad";`,
        ``,
        `// A confirm dialog that resolves a promise on the chosen action.`,
        `@Component.define()`,
        `export class ConfirmDialog extends ShadAlertDialog {`,
        `  static tagName = "confirm-dialog";`,
        ``,
        `  #resolve?: (ok: boolean) => void;`,
        `  ask() { this.show(); return new Promise<boolean>((r) => (this.#resolve = r)); }`,
        `  answer(ok: boolean) { this.#resolve?.(ok); this.close(); }`,
        `}`,
      ].join("\n"),
    },
  },
  calendar: {
    title: "Calendar",
    description: "A date field component for selecting dates.",
    examples: [
      { name: "Basic", render: () => html`<shad-calendar value="2026-06-19"></shad-calendar>` },
      { name: "Range Calendar", render: () => html`<shad-calendar mode="range" start="2026-06-09" end="2026-06-16"></shad-calendar>` },
      { name: "Month and Year Selector", render: () => html`<shad-calendar dropdown value="2026-06-19"></shad-calendar>` },
      {
        name: "Booked Dates",
        render: () => html`<shad-calendar
          value="2026-06-19"
          .booked=${["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-24", "2026-06-25"]}
        ></shad-calendar>`,
        code: [
          `<shad-calendar value="2026-06-19"></shad-calendar>`,
          ``,
          `calendar.booked = [   // disabled / unavailable dates`,
          `  "2026-06-10", "2026-06-11", "2026-06-12",`,
          `  "2026-06-24", "2026-06-25",`,
          `];`,
        ].join("\n"),
      },
      { name: "Custom Cell Size", render: () => html`<shad-calendar cellsize="44" value="2026-06-19"></shad-calendar>` },
      { name: "Week Numbers", render: () => html`<shad-calendar weeknumbers value="2026-06-19"></shad-calendar>` },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-calendar value="2026-06-19"></shad-calendar></div>` },
    ],
    api: {
      props: [
        { name: "mode", type: `"single" | "range"`, default: `"single"`, description: "Select one date (value) or a date range (start/end)." },
        { name: "value", type: "string", default: `""`, description: "Selected ISO date (single mode), mirrored to the attribute." },
        { name: "start / end", type: "string", default: `""`, description: "Range endpoints (ISO) in range mode." },
        { name: "booked", type: "string[]", default: "[]", description: "ISO dates that are disabled / unavailable." },
        { name: "weeknumbers", type: "boolean", default: "false", description: "Show an ISO week-number column." },
        { name: "dropdown", type: "boolean", default: "false", description: "Render month/year as <select> jump menus." },
        { name: "cellsize", type: "number", default: "0", description: "Day-cell size in px (0 → default 2rem; sets the --cell var)." },
      ],
      events: [
        { name: "change", detail: "string | { start, end }", description: "Fires on selection; ISO string (single) or a range object." },
      ],
      extend: [
        `import { ShadCalendar } from "@youneed/dom-ui-shad";`,
        ``,
        `const cal = document.querySelector("shad-calendar");`,
        `cal.addEventListener("change", (e) => console.log(e.detail));`,
        `cal.booked = ["2026-06-10", "2026-06-11"];   // disable dates`,
      ].join("\n"),
    },
  },
  "date-picker": {
    title: "Date Picker",
    description: "A date picker built by composing a trigger with a <shad-calendar> in a popover.",
    examples: [
      { name: "Basic", render: () => html`<shad-date-picker></shad-date-picker>` },
      { name: "Range Picker", render: () => html`<shad-date-picker mode="range" placeholder="Pick a date range"></shad-date-picker>` },
      { name: "Date of Birth", render: () => html`<shad-date-picker dropdown placeholder="Select your birthday"></shad-date-picker>` },
      { name: "Input", render: () => html`<shad-date-picker variant="input" placeholder="June 23, 2026"></shad-date-picker>` },
      {
        name: "Time Picker",
        render: () => html`<div class="flex items-end gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="px-1 text-sm font-medium">Date</label>
            <shad-date-picker></shad-date-picker>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="px-1 text-sm font-medium">Time</label>
            <input type="time" value="10:30" class="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>`,
        code: [
          `<shad-date-picker></shad-date-picker>`,
          `<input type="time" value="10:30" />`,
        ].join("\n"),
      },
      {
        name: "Natural Language Picker",
        render: () => html`<shad-date-picker variant="input" natural></shad-date-picker>`,
        code: [
          `<shad-date-picker variant="input" natural></shad-date-picker>`,
          ``,
          `// Type "tomorrow", "next monday", "in 3 days", "2 days ago"…`,
          `// or any Date.parse-able string; it resolves + emits change.`,
        ].join("\n"),
      },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-date-picker placeholder="اختر تاريخًا"></shad-date-picker></div>` },
    ],
    api: {
      props: [
        { name: "mode", type: `"single" | "range"`, default: `"single"`, description: "Pick one date (value) or a range (start/end)." },
        { name: "value", type: "string", default: `""`, description: "Selected ISO date in single mode (reflected)." },
        { name: "start / end", type: "string", default: `""`, description: "Range endpoints (ISO) in range mode." },
        { name: "placeholder", type: "string", default: `"Pick a date"`, description: "Trigger text shown when nothing is selected." },
        { name: "dropdown", type: "boolean", default: "false", description: "Calendar uses month/year <select> menus (good for birthdays)." },
        { name: "variant", type: `"button" | "input"`, default: `"button"`, description: "Trigger style: a button, or a text input with a calendar button." },
        { name: "natural", type: "boolean", default: "false", description: "Input variant: parse free text (today, tomorrow, next monday, in N days…)." },
      ],
      events: [
        { name: "change", detail: "string | { start, end }", description: "Fires on selection; ISO string (single) or a range object." },
      ],
      slots: [],
      extend: [
        `import { ShadDatePicker } from "@youneed/dom-ui-shad";`,
        ``,
        `const dp = document.querySelector("shad-date-picker");`,
        `dp.addEventListener("change", (e) => console.log(e.detail)); // ISO or {start,end}`,
        ``,
        `// Or compose it yourself: a trigger + <shad-calendar> in a popover.`,
        `class BirthdayPicker extends ShadDatePicker {`,
        `  dropdown = true;`,
        `  placeholder = "Select your birthday";`,
        `}`,
      ].join("\n"),
    },
  },
};

export const NAV: NavGroup[] = [
  {
    group: "Components",
    items: Object.entries(DEMOS).map(([slug, d]) => ({ slug, title: d.title })),
  },
];
