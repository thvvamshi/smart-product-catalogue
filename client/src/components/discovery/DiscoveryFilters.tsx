import type { DiscoveryFilters as Options } from "../../types/discovery";
export type FilterState = {
  brand: string;
  gender: string;
  size: string;
  sizeSystem: string;
  color: string;
  material: string;
  minPrice: string;
  maxPrice: string;
  availability: boolean;
};
const Select = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) => (
  <label>
    {label}
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  </label>
);
export function DiscoveryFilters({
  value,
  options,
  onChange,
  onClear,
}: {
  value: FilterState;
  options: Options;
  onChange: (next: FilterState) => void;
  onClear: () => void;
}) {
  const set = (key: keyof FilterState, next: string | boolean) =>
    onChange({ ...value, [key]: next });
  return (
    <section className="discovery-controls" aria-label="Discovery filters">
      <Select
        label="Brand"
        value={value.brand}
        options={options.brands}
        onChange={(v) => set("brand", v)}
      />
      <Select
        label="Gender"
        value={value.gender}
        options={options.genders}
        onChange={(v) => set("gender", v)}
      />
      {options.sizes.length ? (
        <Select
          label="Size"
          value={value.size}
          options={options.sizes}
          onChange={(v) => set("size", v)}
        />
      ) : null}
      {options.sizeSystems.length ? (
        <Select
          label="Size system"
          value={value.sizeSystem}
          options={options.sizeSystems}
          onChange={(v) => set("sizeSystem", v)}
        />
      ) : null}
      <Select
        label="Colour"
        value={value.color}
        options={options.colors}
        onChange={(v) => set("color", v)}
      />
      <Select
        label="Material"
        value={value.material}
        options={options.materials}
        onChange={(v) => set("material", v)}
      />
      <label>
        Minimum price
        <input
          aria-label="Minimum price"
          type="number"
          min="0"
          value={value.minPrice}
          onChange={(e) => set("minPrice", e.target.value)}
        />
      </label>
      <label>
        Maximum price
        <input
          aria-label="Maximum price"
          type="number"
          min="0"
          value={value.maxPrice}
          onChange={(e) => set("maxPrice", e.target.value)}
        />
      </label>
      <label className="checkbox-filter">
        <input
          type="checkbox"
          checked={value.availability}
          onChange={(e) => set("availability", e.target.checked)}
        />{" "}
        In stock nearby
      </label>
      <button className="clear-button" onClick={onClear}>
        Clear all
      </button>
    </section>
  );
}
