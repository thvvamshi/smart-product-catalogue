type Props = { value: string; onChange: (value: string) => void };
export function SortSelect({ value, onChange }: Props) {
  return (
    <label className="sort">
      Sort by
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="newest">Newest</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="rating_desc">Highest rated</option>
        <option value="name_asc">Name: A–Z</option>
      </select>
    </label>
  );
}
