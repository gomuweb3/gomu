export function filterEmpty(o: {}): {} {
  return Object.fromEntries(Object.entries(o).filter(([_, v]) => v));
}
