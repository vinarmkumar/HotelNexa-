export const MAX_CHILDREN = 6;
export const MAX_GUESTS = 20;

export function calculateRequiredBeds(adults, childAges) {
  const adultsCount = Number(adults);
  if (!Number.isInteger(adultsCount) || adultsCount < 1) return 0;
  if (!Array.isArray(childAges) || childAges.some((age) => !Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 17)) {
    return 0;
  }

  const ages = childAges.map(Number);
  const olderChildren = ages.filter((age) => age >= 10).length;
  const youngerChildren = ages.filter((age) => age < 10).length;
  return adultsCount + olderChildren + Math.max(0, youngerChildren - 1);
}
