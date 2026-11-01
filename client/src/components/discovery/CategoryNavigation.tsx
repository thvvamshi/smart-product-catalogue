import type { DiscoveryCategory } from "../../types/discovery";
export function CategoryNavigation({
  categories,
  selected,
  onSelect,
}: {
  categories: DiscoveryCategory[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <nav className="category-browser" aria-label="Fashion categories">
      <button
        className={!selected ? "selected" : ""}
        onClick={() => onSelect("")}
      >
        All fashion
      </button>
      {categories.map((root) => (
        <div className="category-group" key={root.id}>
          <button
            className={selected === root.slug ? "selected" : ""}
            onClick={() => onSelect(root.slug)}
          >
            {root.name}
          </button>
          {root.children.length ? (
            <div className="subcategory-list">
              {root.children.map((child) => (
                <button
                  className={selected === child.slug ? "selected" : ""}
                  onClick={() => onSelect(child.slug)}
                  key={child.id}
                >
                  {child.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
