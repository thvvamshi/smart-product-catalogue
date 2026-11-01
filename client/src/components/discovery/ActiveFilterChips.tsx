import type { FilterState } from "./DiscoveryFilters";
export function ActiveFilterChips({
  filters,
  category,
  onRemove,
}: {
  filters: FilterState;
  category: string;
  onRemove: (key: keyof FilterState | "category") => void;
}) {
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== "" && value !== false,
  ) as Array<[keyof FilterState, string | boolean]>;
  if (!category && !entries.length) return null;
  return (
    <div className="filter-chips" aria-label="Active filters">
      {category ? (
        <button onClick={() => onRemove("category")}>
          Category: {category} ×
        </button>
      ) : null}
      {entries.map(([key, value]) => (
        <button key={key} onClick={() => onRemove(key)}>
          {key}: {value === true ? "yes" : value} ×
        </button>
      ))}
    </div>
  );
}
