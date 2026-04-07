import L from "leaflet";

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

const buildAdj = (geojson, blockedEdges = new Set()) => {
  const adj = new Map();

  geojson.features
    .filter((f) => f.geometry?.type === "LineString")
    .forEach((f) => {
      const u = String(f.properties?.u);
      const v = String(f.properties?.v);
      if (!u || !v) return;

      const key = `${u}-${v}`;
      const reverse = `${v}-${u}`;
      if (blockedEdges.has(key) || blockedEdges.has(reverse)) return;

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
  if (start === end) {
    return { nodePath: [start], coords: [], steps: [] };
  }

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

const isPoleId = (id) => /^\d+$/.test(String(id));

const getPoles = (blockGraph) => {
  return blockGraph.features
    .filter((f) => f.geometry?.type === "Point" && f.properties?.type === "pole")
    .map((f) => String(f.properties?.id))
    .filter(isPoleId)
    .sort((a, b) => Number(a) - Number(b));
};

export const getTraversableNodeIds = (blockGraph) => {
  if (!blockGraph?.features) return [];

  return blockGraph.features
    .filter((f) => f.geometry?.type === "Point" && f.properties?.id != null)
    .map((f) => String(f.properties.id))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
};

const nearestNeighborOrder = (startPole, poles, poleDist) => {
  const unvisited = new Set(poles);
  unvisited.delete(startPole);

  const order = [startPole];
  let curr = startPole;

  while (unvisited.size) {
    let best = null;
    let bestD = Infinity;

    for (const cand of unvisited) {
      const d = poleDist(curr, cand);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }

    if (best == null || !Number.isFinite(bestD)) return null;
    order.push(best);
    unvisited.delete(best);
    curr = best;
  }

  return order;
};

const orderDistance = (order, poleDist) => {
  let sum = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const d = poleDist(order[i], order[i + 1]);
    if (!Number.isFinite(d)) return Infinity;
    sum += d;
  }
  return sum;
};

const twoOptOpen = (order, poleDist) => {
  let best = order.slice();
  let bestCost = orderDistance(best, poleDist);
  let improved = true;

  while (improved) {
    improved = false;

    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const candidate = best.slice();
        const segment = candidate.slice(i, k + 1).reverse();
        candidate.splice(i, k - i + 1, ...segment);

        const candCost = orderDistance(candidate, poleDist);
        if (candCost < bestCost) {
          best = candidate;
          bestCost = candCost;
          improved = true;
        }
      }
    }
  }

  return best;
};

const getPointLookup = (blockGraph) =>
  new Map(
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

const buildRouteResult = ({
  pointLookup,
  allFrom,
  bestOrder,
  prefixPath = null,
  prefixDistance = 0,
}) => {
  let totalDistance = 0;
  const fullCoords = [];
  const nodeSequence = [];
  const pathSteps = [];
  const nodeVisits = [];

  const mergeReconstructedPath = (recon) => {
    if (!recon) return;

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
  };

  if (prefixPath) {
    totalDistance += prefixDistance;
    mergeReconstructedPath(prefixPath);
  }

  for (let i = 0; i < bestOrder.length - 1; i++) {
    const a = bestOrder[i];
    const b = bestOrder[i + 1];
    const { dist, prev } = allFrom.get(a);
    const d = dist.get(b);
    if (!Number.isFinite(d)) return null;

    const recon = reconstructPathFromPrev(a, b, prev);
    if (!recon) return null;

    totalDistance += d;
    mergeReconstructedPath(recon);
  }

  const pushNodeVisit = (id, cumulativeDistance, fallbackCoord = null) => {
    const existing = pointLookup.get(String(id));
    nodeVisits.push({
      id: String(id),
      coord: existing?.coord || fallbackCoord,
      type: existing?.type || null,
      cumulativeDistance,
    });
  };

  if (nodeSequence.length > 0) {
    pushNodeVisit(nodeSequence[0], 0, fullCoords[0] || null);
  }

  let cumulativeDistance = 0;
  for (const step of pathSteps) {
    cumulativeDistance += step.distance;
    pushNodeVisit(
      step.to,
      cumulativeDistance,
      step.coords?.[step.coords.length - 1] || null
    );
  }

  return {
    poleOrder: bestOrder,
    nodeSequence,
    coords: fullCoords,
    pathSteps,
    nodeVisits,
    distance: totalDistance,
  };
};

export const runBlockDijkstra = (blockGraph, blockedEdges = new Set()) => {
  if (!blockGraph) return null;

  const adj = buildAdj(blockGraph, blockedEdges);
  const poles = getPoles(blockGraph);
  if (poles.length < 2) return null;

  const allFrom = new Map();
  for (const pole of poles) {
    allFrom.set(pole, dijkstraAll(pole, adj));
  }

  const poleDist = (a, b) => allFrom.get(a)?.dist.get(b);

  let bestOrder = null;
  let bestCost = Infinity;

  for (const start of poles) {
    const nn = nearestNeighborOrder(start, poles, poleDist);
    if (!nn) continue;

    const improved = twoOptOpen(nn, poleDist);
    const cost = orderDistance(improved, poleDist);

    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = improved;
    }
  }

  if (!bestOrder || !Number.isFinite(bestCost)) return null;

  return buildRouteResult({
    pointLookup: getPointLookup(blockGraph),
    allFrom,
    bestOrder,
  });
};

export const runBlockDijkstraFromNode = (
  blockGraph,
  startNode,
  blockedEdges = new Set()
) => {
  if (!blockGraph || startNode == null || startNode === "") return null;

  const adj = buildAdj(blockGraph, blockedEdges);
  const poles = getPoles(blockGraph);
  if (poles.length < 2) return null;

  const normalizedStartNode = String(startNode);
  const traversableNodes = getTraversableNodeIds(blockGraph);
  if (!traversableNodes.includes(normalizedStartNode)) return null;

  const allFrom = new Map();
  for (const pole of poles) {
    allFrom.set(pole, dijkstraAll(pole, adj));
  }
  if (!allFrom.has(normalizedStartNode)) {
    allFrom.set(normalizedStartNode, dijkstraAll(normalizedStartNode, adj));
  }

  const poleDist = (a, b) => allFrom.get(a)?.dist.get(b);
  const pointLookup = getPointLookup(blockGraph);

  let bestOrder = null;
  let bestCost = Infinity;
  let prefixPath = null;
  let prefixDistance = 0;

  if (poles.includes(normalizedStartNode)) {
    const nn = nearestNeighborOrder(normalizedStartNode, poles, poleDist);
    if (!nn) return null;

    bestOrder = twoOptOpen(nn, poleDist);
    bestCost = orderDistance(bestOrder, poleDist);
    if (!Number.isFinite(bestCost)) return null;
  } else {
    const { dist: startDist, prev: startPrev } = allFrom.get(normalizedStartNode);

    for (const firstPole of poles) {
      const approachDistance = startDist.get(firstPole);
      if (!Number.isFinite(approachDistance)) continue;

      const nn = nearestNeighborOrder(firstPole, poles, poleDist);
      if (!nn) continue;

      const improved = twoOptOpen(nn, poleDist);
      const poleOnlyCost = orderDistance(improved, poleDist);
      const totalCost = approachDistance + poleOnlyCost;

      if (totalCost < bestCost) {
        const recon = reconstructPathFromPrev(
          normalizedStartNode,
          firstPole,
          startPrev
        );
        if (!recon) continue;

        bestCost = totalCost;
        bestOrder = improved;
        prefixPath = recon;
        prefixDistance = approachDistance;
      }
    }
  }

  if (!bestOrder || !Number.isFinite(bestCost)) return null;

  return {
    ...buildRouteResult({
      pointLookup,
      allFrom,
      bestOrder,
      prefixPath,
      prefixDistance,
    }),
    startNode: normalizedStartNode,
  };
};
