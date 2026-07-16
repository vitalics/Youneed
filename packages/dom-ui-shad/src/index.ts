// @youneed/dom-ui-shad — shadcn-style component library on @youneed/dom.
//
// Two ways to use it:
//   1. Import directly:   import { ShadButton } from "@youneed/dom-ui-shad";
//   2. Own the source:    npx shad add button   (copies it into your project)
//
// Either way, call registerTailwind(yourCompiledTailwindCss) once at startup so
// utilities work inside the components' shadow roots.

export { cn, tw, base, variants, registerTailwind, tailwindProperties } from "./lib/shad.ts";
export { ShadButton } from "./ui/button.ts";
export { ShadButtonGroup, ShadButtonGroupSeparator, ShadButtonGroupText } from "./ui/button-group.ts";
export { ShadBadge } from "./ui/badge.ts";
export { ShadBreadcrumb } from "./ui/breadcrumb.ts";
export { ShadCard } from "./ui/card.ts";
export { ShadCarousel, autoplay, type CarouselPlugin } from "./ui/carousel.ts";
export { ShadChart, type ChartConfig } from "./ui/chart.ts";
export { ShadInput } from "./ui/input.ts";
export { ShadInputOtp } from "./ui/input-otp.ts";
export { ShadKbd, ShadKbdGroup } from "./ui/kbd.ts";
export {
  ShadItem,
  ShadItemGroup,
  ShadItemSeparator,
  ShadItemMedia,
  ShadItemContent,
  ShadItemTitle,
  ShadItemDescription,
  ShadItemActions,
  ShadItemHeader,
  ShadItemFooter,
} from "./ui/item.ts";
export {
  ShadInputGroup,
  ShadInputGroupInput,
  ShadInputGroupTextarea,
  ShadInputGroupAddon,
  ShadInputGroupButton,
} from "./ui/input-group.ts";
export { ShadLabel } from "./ui/label.ts";
export { ShadSeparator } from "./ui/separator.ts";
export { ShadScrollArea } from "./ui/scroll-area.ts";
export {
  ShadSidebarProvider,
  ShadSidebar,
  ShadSidebarHeader,
  ShadSidebarFooter,
  ShadSidebarContent,
  ShadSidebarGroup,
  ShadSidebarGroupLabel,
  ShadSidebarGroupContent,
  ShadSidebarMenu,
  ShadSidebarMenuItem,
  ShadSidebarMenuButton,
  ShadSidebarMenuSubButton,
  ShadSidebarMenuAction,
  ShadSidebarMenuBadge,
  ShadSidebarMenuSub,
  ShadSidebarMenuSubItem,
  ShadSidebarTrigger,
  ShadSidebarRail,
  ShadSidebarInset,
} from "./ui/sidebar.ts";
export { ShadSkeleton } from "./ui/skeleton.ts";
export { ShadSlider } from "./ui/slider.ts";
export { ShadSpinner } from "./ui/spinner.ts";
export { ShadToaster, toast, type ToastOptions } from "./ui/toast.ts";
export { ShadAvatar, ShadAvatarGroup } from "./ui/avatar.ts";
export { ShadAlert } from "./ui/alert.ts";
export { ShadAspectRatio } from "./ui/aspect-ratio.ts";
export { ShadSwitch } from "./ui/switch.ts";
export { ShadCheckbox } from "./ui/checkbox.ts";
export { ShadCollapsible } from "./ui/collapsible.ts";
export { ShadCombobox, type ComboOption } from "./ui/combobox.ts";
export { ShadCommand, type CommandItem } from "./ui/command.ts";
export { ShadContextMenu, type MenuEntry } from "./ui/context-menu.ts";
export { ShadDropdownMenu } from "./ui/dropdown-menu.ts";
export { ShadMenubar, type MenubarMenu } from "./ui/menubar.ts";
export { ShadNavigationMenu, type NavItem, type NavLink } from "./ui/navigation-menu.ts";
export { ShadTextarea } from "./ui/textarea.ts";
export { ShadProgress } from "./ui/progress.ts";
export { ShadResizablePanelGroup, ShadResizablePanel, ShadResizableHandle } from "./ui/resizable.ts";
export { ShadRadioGroup, ShadRadioGroupItem } from "./ui/radio-group.ts";
export { ShadPagination } from "./ui/pagination.ts";
export { ShadToggle } from "./ui/toggle.ts";
export { ShadTabs, ShadTab } from "./ui/tabs.ts";
export { ShadDialog } from "./ui/dialog.ts";
export { ShadDrawer } from "./ui/drawer.ts";
export {
  ShadEmpty,
  ShadEmptyHeader,
  ShadEmptyMedia,
  ShadEmptyTitle,
  ShadEmptyDescription,
  ShadEmptyContent,
} from "./ui/empty.ts";
export { ShadAlertDialog } from "./ui/alert-dialog.ts";
export { ShadTooltip } from "./ui/tooltip.ts";
export { ShadHoverCard } from "./ui/hover-card.ts";
export { ShadPopover } from "./ui/popover.ts";
export { ShadSelect, ShadOption } from "./ui/select.ts";
export { ShadAccordion, ShadAccordionItem } from "./ui/accordion.ts";
export { ShadCalendar } from "./ui/calendar.ts";
export { ShadDatePicker } from "./ui/date-picker.ts";
export {
  ShadTable,
  ShadTableHeader,
  ShadTableBody,
  ShadTableFooter,
  ShadTableRow,
  ShadTableHead,
  ShadTableCell,
  ShadTableCaption,
} from "./ui/table.ts";
export { ShadDataTable, type DataTableColumn, type RowAction } from "./ui/data-table.ts";
