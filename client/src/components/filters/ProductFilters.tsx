import type { Filters } from "../../types/product";

const categories = [
  "Electronics",
  "Home",
  "Books",
  "Sports",
  "Fashion",
  "Beauty",
  "Toys",
  "Garden",
];
const brands = [
  "NovaTech",
  "Aster",
  "BluePeak",
  "Cedar & Co",
  "Drift",
  "Everwell",
  "Flux",
  "GreenLeaf",
];
type Props = {
  filters: Filters;
  onChange: (name: keyof Filters, value: string | number) => void;
  onClear: () => void;
};

export function ProductFilters({ filters, onChange, onClear }: Props) {
  return (
    <aside className="filters">
      <div className="filter-heading">
        <h2>Filters</h2>
        <button className="link-button" onClick={onClear}>
          Clear all
        </button>
      </div>
      <label>
        Category
        <select
          value={filters.category}
          onChange={(e) => onChange("category", e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Brand
        <select
          value={filters.brand}
          onChange={(e) => onChange("brand", e.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <div className="price-row">
        <label>
          Min price
          <input
            aria-label="Minimum price"
            type="number"
            min="0"
            step="0.01"
            value={filters.minPrice}
            onChange={(e) => onChange("minPrice", e.target.value)}
          />
        </label>
        <label>
          Max price
          <input
            aria-label="Maximum price"
            type="number"
            min="0"
            step="0.01"
            value={filters.maxPrice}
            onChange={(e) => onChange("maxPrice", e.target.value)}
          />
        </label>
      </div>
      <label>
        Minimum rating
        <select
          value={filters.minRating}
          onChange={(e) => onChange("minRating", e.target.value)}
        >
          <option value="">Any rating</option>
          {[4.5, 4, 3, 2].map((x) => (
            <option key={x} value={x}>
              {x}+ stars
            </option>
          ))}
        </select>
      </label>
      <label>
        Availability
        <select
          value={filters.inStock}
          onChange={(e) => onChange("inStock", e.target.value)}
        >
          <option value="">Any</option>
          <option value="true">In stock</option>
          <option value="false">Out of stock</option>
        </select>
      </label>
    </aside>
  );
}
