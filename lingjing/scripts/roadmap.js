// roadmap.js — a province drawn from its roads alone: rows by how many roads
// a place lies from the start, each row ordered under the places it is
// reached from. Nobody writes coordinates; the page lays them out. The same
// positions, said in words, tell the picture model where to paint each
// place, so a painted map sits under its names.

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

  // Spread across the frame the way a painter reads "left" and "top": two
  // in a row stand at a quarter and three quarters, three near the edges.
  const spread = (i, n, most, span) => (n > 1 ? 0.5 + (i - (n - 1) / 2) * Math.min(most, span / (n - 1)) : 0.5);
  const at = {};
  rows.forEach((row, r) => row.forEach((id, i) => {
    at[id] = { x: spread(i, row.length, 0.5, 0.64), y: spread(r, rows.length, 0.32, 0.64), row: r, col: i };
  }));
  const roads = [];
  for (const p of places) {
    for (const n of p.roads ?? []) if (byId.has(n) && p.id < n) roads.push([p.id, n]);
  }
  return { at, roads, rows: rows.length, widest: Math.max(1, ...rows.map((row) => row.length)) };
}

/// Where a place stands, in a painter's words: "Top center", "Lower left".
export function placeWords({ x, y }) {
  const v = y < 0.28 ? 'Top' : y < 0.43 ? 'Upper' : y <= 0.57 ? 'Middle' : y < 0.72 ? 'Lower' : 'Bottom';
  const h = x < 0.3 ? 'left' : x < 0.44 ? 'left of center' : x <= 0.56 ? 'center' : x < 0.7 ? 'right of center' : 'right';
  return `${v} ${h}`;
}
