import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Suggestion {
  label: string;
  value: string;
}

/**
 * A multi-line address field with free autocomplete (OpenStreetMap Nominatim via
 * the native `geocode_address` command). Typing fetches suggestions; picking one
 * fills the field with a clean single-line address.
 */
export function AddressAutocomplete({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const justPicked = useRef(false);

  // Reflect external changes (e.g. settings finished loading).
  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  function handleChange(v: string) {
    setQuery(v);
    onChange(v);
    if (timer.current) window.clearTimeout(timer.current);
    if (justPicked.current) { justPicked.current = false; return; }
    if (v.trim().length < 4) { setSuggestions([]); setOpen(false); return; }
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await invoke<Suggestion[]>("geocode_address", { query: v });
        setSuggestions(res);
        setOpen(res.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 450);
  }

  function pick(s: Suggestion) {
    justPicked.current = true;
    setQuery(s.value);
    onChange(s.value);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="relative">
        <Textarea
          value={query}
          rows={2}
          placeholder={placeholder ?? "Start typing an address..."}
          className="resize-none"
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        {open && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {suggestions.map((s, i) => (
              <button
                type="button"
                key={i}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-accent"
                title={s.label}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{loading ? "Searching addresses..." : "Suggestions via OpenStreetMap"}</p>
    </div>
  );
}
