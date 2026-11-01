import { useEffect, useRef, useState } from "react";
import { fetchDiscoverySuggestions } from "../../lib/api";
import type { CustomerLocation } from "../../types/location";
import type { DiscoverySuggestion } from "../../types/discovery";
export function DiscoverySearch({
  value,
  onChange,
  onSubmit,
  location,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  location: CustomerLocation | null;
}) {
  const [suggestions, setSuggestions] = useState<DiscoverySuggestion[]>([]),
    [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">(
      "idle",
    ),
    [open, setOpen] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setStatus("idle");
      setOpen(false);
      return;
    }
    const current = ++generation.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("loading");
      setOpen(true);
      fetchDiscoverySuggestions(
        (() => {
          const params = new URLSearchParams({ search: trimmed });
          if (location) {
            params.set("latitude", String(location.latitude));
            params.set("longitude", String(location.longitude));
          }
          return params;
        })(),
        controller.signal,
      )
        .then((response) => {
          if (current !== generation.current) return;
          setSuggestions(response.data);
          setStatus(response.data.length ? "idle" : "empty");
        })
        .catch((reason) => {
          if (current === generation.current && reason?.name !== "AbortError")
            setStatus("error");
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, location]);
  return (
    <form className="discovery-search" onSubmit={(event) => { event.preventDefault(); setOpen(false); onSubmit(); }}>
      <label htmlFor="fashion-search">Search fashion</label>
      <input
        id="fashion-search"
        role="combobox"
        aria-expanded={open}
        aria-controls="fashion-suggestions"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Product, brand or SKU"
      />
      <button className="search-submit" type="submit">Search</button>
      {open ? (
        <div id="fashion-suggestions" className="suggestions" role="listbox">
          {status === "loading" ? (
            <p role="status">Finding suggestions…</p>
          ) : status === "empty" ? (
            <p>No suggestions found.</p>
          ) : status === "error" ? (
            <p role="alert">Suggestions unavailable.</p>
          ) : (
            suggestions.map((item) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={item.id}
                onClick={() => {
                  onChange(item.name);
                  setOpen(false);
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.brand}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </form>
  );
}
