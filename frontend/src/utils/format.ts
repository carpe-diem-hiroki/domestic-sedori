export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "-";
  return `${price.toLocaleString()}円`;
}
