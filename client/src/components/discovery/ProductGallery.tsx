import { useState } from "react";
export function ProductGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const safe = images.length ? images : [""];
  return (
    <div className="gallery">
      <div className="product-gallery">
        {safe[index] ? (
          <img
            src={safe[index]}
            alt={`${name}, image ${index + 1} of ${safe.length}`}
          />
        ) : (
          <span>Fashion</span>
        )}
      </div>
      {safe.length > 1 ? (
        <div className="gallery-controls">
          <button
            aria-label="Previous image"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            Previous
          </button>
          <span aria-live="polite">
            {index + 1} / {safe.length}
          </span>
          <button
            aria-label="Next image"
            disabled={index === safe.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
