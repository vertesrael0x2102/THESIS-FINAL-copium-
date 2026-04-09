import L from "leaflet";

/* ---------- SAME HELPERS (copied from networkUtils) ---------- */

const edgeWeightFromFeature = (f) => {
  const w = Number(f.properties?.weight);
  if (Number.isFinite(w) && w > 0) return w;

  const c = Number(f.properties?.cost_m);
  if (Number.isFinite(c) && c > 0) return c;

  const coords = f.geometry.coordinates.map((c) => [c[1], c[0]]);
  let dist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    dist += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
  }
  return dist;
};

const buildAdj = (geojson) => {
  const adj = new Map();

  geojson.features
    .filter((f) => f.geometry?.type === "LineString")
    .forEach((f) => {
      const u = String(f.properties?.u);
      const v = String(f.properties?.v);
      if (!u || !v) return;
      
      const coords = f.geometry.coordinates.map((c) => [c[1], c[0]]);
      const weight = edgeWeightFromFeature(f);

      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);

      adj.get(u).push({ to: v, weight, coords });
      adj.get(v).push({ to: u, weight, coords: [...coords].reverse() });
    });

  return adj;
};

const dijkstraAll = (start, adj) => {
  const dist = new Map();
  const prev = new Map();
  const pq = [];

  dist.set(start, 0);
  pq.push({ node: start, dist: 0 });

  while (pq.length) {
    pq.sort((a, b) => a.dist - b.dist);
    const { node } = pq.shift();

    const currDist = dist.get(node);
    for (const edge of adj.get(node) || []) {
      const alt = currDist + edge.weight;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, { from: node, edge });
        pq.push({ node: edge.to, dist: alt });
      }
    }
  }

  return { dist, prev };
};

const reconstructPathFromPrev = (start, end, prev) => {
  if (start === end)
    return { nodePath: [start], coords: [], steps: [] };

  const nodePath = [end];
  const coordSegments = [];
  const steps = [];
  let curr = end;

  while (curr !== start) {
    const step = prev.get(curr);
    if (!step) return null;

    coordSegments.unshift(step.edge.coords);
    steps.unshift({
      from: step.from,
      to: curr,
      coords: step.edge.coords,
      distance: step.edge.weight,
    });
    curr = step.from;
    nodePath.unshift(curr);
  }

  return { nodePath, coords: coordSegments.flat(), steps };
};

/* ---------- SEQUENTIAL VERSION ---------- */

const isPoleId = (id) => /^\d+$/.test(String(id));

const getPoles = (blockGraph) => {
  return blockGraph.features
    .filter(
      (f) =>
        f.geometry?.type === "Point" &&
        f.properties?.type === "pole"
    )
    .map((f) => String(f.properties.id))
    .filter(isPoleId)
    .sort((a, b) => Number(a) - Number(b));
};

export const runSequentialRoute = (blockGraph) => {
  if (!blockGraph) return null;

  const adj = buildAdj(blockGraph);
  const poles = getPoles(blockGraph);
  if (poles.length < 2) return null;

  const allFrom = new Map();
  for (const p of poles) {
    allFrom.set(p, dijkstraAll(p, adj));
  }

  const nodeSequence = [];
  const fullCoords = [];
  let totalDistance = 0;
  const pathSteps = [];
  const pointLookup = new Map(
    blockGraph.features
      .filter((f) => f.geometry?.type === "Point" && f.properties?.id != null)
      .map((f) => [
        String(f.properties.id),
        {
          coord: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
          type: f.properties?.type,
        },
      ])
  );

  const order = poles; // ðŸ”¹ fixed numeric order

  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i];
    const b = order[i + 1];

    const { dist, prev } = allFrom.get(a);
    const d = dist.get(b);
    if (!Number.isFinite(d)) return null;

    const recon = reconstructPathFromPrev(a, b, prev);
    if (!recon) return null;

    totalDistance += d;

    if (nodeSequence.length === 0) {
      nodeSequence.push(...recon.nodePath);
    } else {
      nodeSequence.push(...recon.nodePath.slice(1));
    }

    if (fullCoords.length === 0) {
      fullCoords.push(...recon.coords);
    } else if (recon.coords.length) {
      fullCoords.push(...recon.coords.slice(1));
    }

    for (const step of recon.steps) {
      pathSteps.push(step);
    }
  }

  const nodeVisits = [];
  if (nodeSequence.length > 0) {
    nodeVisits.push({
      id: String(nodeSequence[0]),
      coord:
        pointLookup.get(String(nodeSequence[0]))?.coord || fullCoords[0] || null,
      type: pointLookup.get(String(nodeSequence[0]))?.type || null,
      cumulativeDistance: 0,
    });
  }

  let cumulativeDistance = 0;
  for (const step of pathSteps) {
    cumulativeDistance += step.distance;
    nodeVisits.push({
      id: String(step.to),
      coord:
        pointLookup.get(String(step.to))?.coord ||
        step.coords?.[step.coords.length - 1] ||
        null,
      type: pointLookup.get(String(step.to))?.type || null,
      cumulativeDistance,
    });
  }

  return {
    poleOrder: order,
    nodeSequence,
    coords: fullCoords,
    pathSteps,
    nodeVisits,
    distance: totalDistance,
  };
};
