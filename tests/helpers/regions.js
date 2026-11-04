import { WORLD, isFree } from '../../js/world.js';

const CELL = 8; // flood-fill resolution in map units

// Label every walkable cell (one where an avatar's centre may stand) with the connected region it belongs to.
export function regions(map) {
  const cols = Math.floor(WORLD.w / CELL);
  const rows = Math.floor(WORLD.h / CELL);
  const label = new Int32Array(cols * rows).fill(-2); // -2 blocked, -1 walkable but not yet visited
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isFree({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }, map)) label[r * cols + c] = -1;
    }
  }
  const sizes = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const c = i % cols;
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (j >= 0 && j < label.length && label[j] === -1) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
  }
  const at = (p) => label[Math.floor(p.y / CELL) * cols + Math.floor(p.x / CELL)];
  return { sizes, at };
}
