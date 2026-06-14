import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  UserPlus,
  Ticket,
  Users,
  Package,
  BookOpen,
  Library,
  Microscope,
} from "lucide-react";
import { useUiStore } from "@/stores/ui";
import { NAV_ITEMS } from "@/lib/nav";
import { globalSearch, type SearchHit } from "@/lib/repos/search";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

const HIT_ICON = {
  ticket: Ticket,
  customer: Users,
  inventory: Package,
  knowledge: BookOpen,
  reference: Library,
  measurement: Microscope,
} as const;

/** Global Ctrl+K palette: live full-text search plus navigation and actions. */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Reset the query each time the palette opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Debounced full-text search as the user types.
  useEffect(() => {
    if (query.trim() === "") {
      setHits([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      globalSearch(query)
        .then((results) => {
          if (active) setHits(results);
        })
        .catch(() => {
          if (active) setHits([]);
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const term = query.trim().toLowerCase();
  const navMatches = NAV_ITEMS.filter((i) => term === "" || i.label.toLowerCase().includes(term));

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput placeholder="Search tickets, customers, parts, articles..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {hits.length > 0 && (
          <CommandGroup heading="Results">
            {hits.map((hit) => {
              const Icon = HIT_ICON[hit.type];
              return (
                <CommandItem key={`${hit.type}-${hit.id}`} value={`${hit.title} ${hit.subtitle} ${hit.type}`} onSelect={() => go(hit.path)}>
                  <Icon />
                  <span className="flex-1">{hit.title}</span>
                  <span className="text-xs text-muted-foreground">{hit.subtitle}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {term === "" && (
          <CommandGroup heading="Quick actions">
            <CommandItem onSelect={() => go("/tickets?new=1")}>
              <Plus /> New ticket
            </CommandItem>
            <CommandItem onSelect={() => go("/customers?new=1")}>
              <UserPlus /> New customer
            </CommandItem>
          </CommandGroup>
        )}

        {navMatches.length > 0 && (
          <CommandGroup heading="Go to">
            {navMatches.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.path} value={`goto ${item.label}`} onSelect={() => go(item.path)}>
                  <Icon /> {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
