export default function PriceLoadingSkeleton() {
  return (
    <span className="catalog-price-skeleton" role="status" aria-label="Завантажуємо ціну">
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </span>
  );
}
