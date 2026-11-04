// Groups are stored as 'g1', 'g2', ... so they can never collide with a Firebase uid in the quiz/score paths.
export const groupNumber = (g) => Number(String(g).slice(1));
export const groupLabel = (g) => `Group ${groupNumber(g)}`;
export const isGroupId = (id) => /^g\d{1,2}$/.test(id);

export const GROUP_COLORS = ['#ff7eb6', '#4fc3f7', '#ffca28', '#81c784', '#b39ddb', '#ff8a65', '#4db6ac', '#f06292'];
export const groupColor = (g) => GROUP_COLORS[(groupNumber(g) - 1) % GROUP_COLORS.length];

// Shuffle everyone and deal them out round-robin into ceil(n / size) groups, so sizes never differ by more than one.
export function formGroups(uids, size, rand = Math.random) {
  if (!uids.length) return {};
  const count = Math.max(1, Math.ceil(uids.length / Math.max(1, size)));
  const order = uids.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const assignment = {};
  order.forEach((uid, i) => {
    assignment[uid] = `g${(i % count) + 1}`;
  });
  return assignment;
}

// Latecomers join the emptiest group (lowest number wins a tie). Null while no groups exist.
export function smallestGroup(assignment) {
  const groups = Object.values(assignment);
  if (!groups.length) return null;
  const count = Math.max(...groups.map(groupNumber));
  const sizes = new Map(Array.from({ length: count }, (_, i) => [`g${i + 1}`, 0]));
  for (const g of groups) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  return [...sizes].sort((a, b) => a[1] - b[1] || groupNumber(a[0]) - groupNumber(b[0]))[0][0];
}
