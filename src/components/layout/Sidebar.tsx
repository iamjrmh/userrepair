import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeft, Wrench, ChevronDown } from "lucide-react";
import { NAV_ITEMS, NAV_GROUP_ORDER } from "@/lib/nav";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useBrandStore } from "@/stores/brand";
import { hasAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const collapsedGroups = useUiStore((s) => s.collapsedGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);
  const role = useAuthStore((s) => s.user?.role);
  const logo = useBrandStore((s) => s.logo);
  const shopName = useBrandStore((s) => s.name);

  const allowed = NAV_ITEMS.filter((i) => !role || hasAccess(role, i.path));
  const groups = NAV_GROUP_ORDER.map((group) => ({
    group,
    items: allowed.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 border-b border-border", collapsed ? "justify-center px-0" : "px-3")}>
        <img src={logo} alt={shopName} className="h-9 w-9 shrink-0 rounded-md" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{shopName}</div>
            <div className="truncate text-xs text-muted-foreground">Bench management</div>
          </div>
        )}
      </div>

      <TooltipProvider delayDuration={0}>
        <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "space-y-3 px-2")}>
          {groups.map(({ group, items }, gi) => {
            const groupCollapsed = collapsedGroups.includes(group);

            if (collapsed) {
              // Icon rail: no headers, thin dividers between groups, centered icons.
              return (
                <div key={group}>
                  {gi > 0 && <div className="mx-auto my-2 h-px w-8 bg-border/60" />}
                  <div className="space-y-1">
                    {items.map((item) => (
                      <CollapsedItem key={item.path} path={item.path} label={item.label} icon={item.icon} />
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={group}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground cursor-pointer"
                >
                  <span>{group}</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", groupCollapsed && "-rotate-90")} />
                </button>
                {!groupCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === "/"}
                          className={({ isActive }) =>
                            cn(
                              "relative flex items-center gap-3 rounded-md py-2 pl-3 pr-2 text-sm font-medium transition-colors",
                              isActive
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
                              )}
                              <Icon className="h-[18px] w-[18px] shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </TooltipProvider>

      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center border-t border-border py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer",
          collapsed ? "justify-center px-0" : "gap-2 px-3",
        )}
      >
        {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}

function CollapsedItem({
  path,
  label,
  icon: Icon,
}: {
  path: string;
  label: string;
  icon: typeof Wrench;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={path}
          end={path === "/"}
          className={({ isActive }) =>
            cn(
              "mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )
          }
        >
          <Icon className="h-5 w-5" />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
