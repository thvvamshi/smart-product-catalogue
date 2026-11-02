import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProductCard } from "../components/products/ProductCard";

describe("ProductCard", () => {
  it("renders the approved seeded placeholder image without introducing another external fallback", () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ id: "1", sku: "SKU-1", name: "Sample Tote", description: "A demo product", brand: "Demo", category: "Bags", price: 100, rating: 4, inStock: true, createdAt: "2026-01-01T00:00:00.000Z", imageUrl: "https://placehold.co/600x400" }} />
      </MemoryRouter>,
    );

    expect(document.querySelector(".image-wrap img")).toHaveAttribute("src", "https://placehold.co/600x400");
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });
});
