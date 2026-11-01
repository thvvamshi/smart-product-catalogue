import { useEffect, useRef, useState } from "react";
import { fetchDiscoverySuggestions } from "../lib/api";
import type { DiscoverySuggestion } from "../types/discovery";

type Props = { value: string; onChange: (value: string) => void };
export function SearchBar({ value, onChange }: Props) {
  const [items, setItems] = useState<DiscoverySuggestion[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [open, setOpen] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) { setItems([]); setState("idle"); setOpen(false); return; }
    const current = ++generation.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading"); setOpen(true);
      void fetchDiscoverySuggestions(new URLSearchParams({ search: query }), controller.signal)
        .then((result) => { if (current !== generation.current) return; setItems(result.data); setState(result.data.length ? "idle" : "empty"); })
        .catch((error) => { if (current === generation.current && error?.name !== "AbortError") setState("error"); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);
  return <div className="search" role="search">
    <label><span className="sr-only">Search products</span><input type="search" aria-expanded={open} aria-controls="catalogue-suggestions" value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => value.trim().length >= 2 && setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter") setOpen(false); }} placeholder="Search name, description, brand, category or SKU…" /></label>
    {open ? <div id="catalogue-suggestions" className="suggestions" role="listbox">{state === "loading" ? <p role="status">Finding suggestions…</p> : state === "empty" ? <p>No suggestions found.</p> : state === "error" ? <p role="alert">Suggestions unavailable.</p> : items.map((item) => <button type="button" role="option" aria-selected="false" key={item.id} onClick={() => { onChange(item.name); setOpen(false); }}><strong>{item.name}</strong><span>{item.brand}</span></button>)}</div> : null}
  </div>;
}
