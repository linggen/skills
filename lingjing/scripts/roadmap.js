// roadmap.js — a province drawn from its roads alone: rows by how many roads
// a place lies from the start, each row ordered under the places it is
// reached from. Nobody writes coordinates; the page lays them out.

/// `places`: Look's `place.places` ({id, roads}). Returns every place at
/// {x, y} in 0..1, and each road once as a pair of ids.
export function layoutRoads(places, start) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const root = byId.has(start) ? start : places[0]?.id;
  const depth = new Map(root ? [[root, 0]] : []);
  const queue = root ? [root] : [];
  while (queue.length) {
    const id = queue.shift();
    for (const next of byId.get(id).roads ?? []) {
      if (byId.has(next) && !depth.has(next)) {
        depth.set(next, depth.get(id) + 1);
        queue.push(next);
      }
    }
  }
  // A place no road reaches from the start still belongs on the map.
  const last = Math.max(-1, ...depth.values());
  for (const p of places) if (!depth.has(p.id)) depth.set(p.id, last + 1);

  const rows = [];
  for (const p of places) (rows[depth.get(p.id)] ??= []).push(p.id);
  const col = new Map();
  rows.forEach((row, r) => {
    if (r > 0) {
      const above = (id) => {
        const up = (byId.get(id).roads ?? []).filter((n) => depth.get(n) === r - 1).map((n) => col.get(n));
        return up.length ? up.reduce((a, b) => a + b, 0) / up.length : Infinity;
      };
      row.sort((a, b) => above(a) - above(b));
    }
    row.forEach((id, i) => col.set(id, i));
  });

  const at = {};
  rows.forEach((row, r) => row.forEach((id, i) => {
    at[id] = { x: (i + 1) / (row.length + 1), y: (r + 0.5) / rows.length, row: r, col: i };
  }));
  const roads = [];
  for (const p of places) {
    for (const n of p.roads ?? []) if (byId.has(n) && p.id < n) roads.push([p.id, n]);
  }
  return { at, roads, rows: rows.length, widest: Math.max(1, ...rows.map((row) => row.length)) };
}
