type Props = { value: string; onChange: (value: string) => void };
export function SearchBar({ value, onChange }: Props) {
  return (
    <label className="search">
      <span className="sr-only">Search products</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search name, description, brand, category or SKU…"
      />
    </label>
  );
}
