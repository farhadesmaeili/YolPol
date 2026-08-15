import Image from "next/image";

import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";

export function ProductGallery({images}: {images: ProductViewModel["images"]}) {
  const accessibleImages = images.filter((image) => image.alternativeText);

  if (accessibleImages.length === 0) return null;

  return (
    <section className="grid gap-4 sm:grid-cols-2" aria-label={accessibleImages[0].alternativeText}>
      {accessibleImages.map((image, index) => (
        <div
          key={image.id}
          className={`relative aspect-square overflow-hidden rounded-2xl bg-stone-100 ${
            index === 0 ? "sm:col-span-2" : ""
          }`}
        >
          <Image
            src={image.source}
            alt={image.alternativeText ?? ""}
            fill
            priority={index === 0}
            sizes={index === 0 ? "(min-width: 1024px) 55vw, 100vw" : "(min-width: 640px) 45vw, 100vw"}
            className="object-contain p-6"
          />
        </div>
      ))}
    </section>
  );
}
