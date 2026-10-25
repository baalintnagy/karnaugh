export const names = (n) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
export const popcount = (x) => {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
};
export const matches = (cube, i) => (i & ~cube.mask) === cube.bits;
export const orderNumber = (values) =>
  values.includes('X')
    ? null
    : values
        .reduce((sum, v, i) => (v === 1 ? sum + (1n << BigInt(i)) : sum), 0n)
        .toString();
export const gray = (bits) =>
  Array.from({ length: 2 ** bits }, (_, i) => i ^ (i >> 1));
