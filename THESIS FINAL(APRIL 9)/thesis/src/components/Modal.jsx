import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";

const PLAYBACK_SPEED_MPS = 50;
const ESTIMATED_WALK_SPEED_MPS = 1.4;

const formatEstimatedWalkTime = (distanceMeters = 0) => {
  const totalSeconds = Math.max(
    1,
    Math.round(distanceMeters / ESTIMATED_WALK_SPEED_MPS)
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} hr ${minutes} min ${seconds} sec`;
  }

  return `${minutes} min ${seconds} sec`;
};

function FitToGraph({ geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson) return;
    const layer = L.geoJSON(geojson);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [0, 0], maxZoom: 20 });
    }
  }, [geojson, map]);

  return null;
}

function ControlMapInteraction({ mode }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (mode === "block") {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
    } else {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
    }
  }, [mode, map]);

  return null;
}

const createRouteNodeIcon = (nodeId, kind = "visited") =>
  L.divIcon({
    className: `route-node-icon ${kind}`,
    html: `<div>${nodeId}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const blockedEdgeIcon = L.divIcon({
  className: "blocked-edge-icon",
  html: '<div class="blocked-edge-badge">!</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const getEdgeMidpoint = (coordinates = []) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  if (coordinates.length === 1) {
    return [coordinates[0][1], coordinates[0][0]];
  }

  const latLngs = coordinates.map((coord) => L.latLng(coord[1], coord[0]));
  const segments = [];
  let totalDistance = 0;

  for (let i = 0; i < latLngs.length - 1; i++) {
    const start = latLngs[i];
    const end = latLngs[i + 1];
    const distance = start.distanceTo(end);
    segments.push({ start, end, distance });
    totalDistance += distance;
  }

  if (totalDistance <= 0) {
    return [latLngs[0].lat, latLngs[0].lng];
  }

  const halfway = totalDistance / 2;
  let traversed = 0;

  for (const segment of segments) {
    if (traversed + segment.distance >= halfway) {
      const ratio = (halfway - traversed) / segment.distance;
      return [
        segment.start.lat + (segment.end.lat - segment.start.lat) * ratio,
        segment.start.lng + (segment.end.lng - segment.start.lng) * ratio,
      ];
    }
    traversed += segment.distance;
  }

  const last = latLngs[latLngs.length - 1];
  return [last.lat, last.lng];
};

export default function Modal({
  isModalOpen,
  blockGraph,
  selectedBlock,
  activeRoute,
  routeMode,
  setRouteMode,
  closeModal,
  blockedEdges,
  setBlockedEdges,
  customStartNode,
  setCustomStartNode,
  onPrevBlock,
  onNextBlock,
  hasPrevBlock,
  hasNextBlock,
}) {
  const [progressDistance, setProgressDistance] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [baseMapMode, setBaseMapMode] = useState("night");
  const [isRoadMenuOpen, setIsRoadMenuOpen] = useState(false);
  const [isCustomStartMenuOpen, setIsCustomStartMenuOpen] = useState(false);
  const [hoveredRoadKey, setHoveredRoadKey] = useState(null);
  const [hoveredCustomStartNode, setHoveredCustomStartNode] = useState(null);
  const roadMenuRef = useRef(null);
  const customStartMenuRef = useRef(null);

  const normalizeRoadKey = (u, v) =>
    [String(u), String(v)].sort((a, b) => a.localeCompare(b)).join("|");

  const allEdges = useMemo(() => {
    if (!blockGraph?.features) return [];

    return blockGraph.features
      .filter((f) => f.properties?.type === "edge")
      .map((f) => ({
        u: String(f.properties.u),
        v: String(f.properties.v),
        label: `Road: ${f.properties.u} ↔ ${f.properties.v} (${f.properties.cost_m || 0}m)`,
      }));
  }, [blockGraph]);
  const customStartNodeOptions = useMemo(() => {
    if (!blockGraph?.features) return [];

    return blockGraph.features
      .filter(
        (feature) =>
          feature.geometry?.type === "Point" &&
          feature.properties?.type === "pole" &&
          feature.properties?.id != null
      )
      .map((feature) => String(feature.properties.id))
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
  }, [blockGraph]);

  const safeBlockedEdges = blockedEdges || new Set();
  const blockedRoadCount = safeBlockedEdges.size / 2;
  const hasRouteFailure = blockedRoadCount > 0 && !activeRoute;
  const pathSteps = activeRoute?.pathSteps ?? [];
  const nodeVisits = activeRoute?.nodeVisits ?? [];

  const blockedEdgeMarkers = useMemo(() => {
    if (!blockGraph?.features?.length || safeBlockedEdges.size === 0) return [];

    const seen = new Set();

    return blockGraph.features
      .filter((feature) => feature.properties?.type === "edge")
      .map((feature) => {
        const u = String(feature.properties?.u);
        const v = String(feature.properties?.v);
        const roadKey = normalizeRoadKey(u, v);

        if (
          !safeBlockedEdges.has(`${u}-${v}`) &&
          !safeBlockedEdges.has(`${v}-${u}`)
        ) {
          return null;
        }

        if (seen.has(roadKey)) return null;
        seen.add(roadKey);

        const coords = feature.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length === 0) return null;

        const midpoint = getEdgeMidpoint(coords);
        if (!midpoint) return null;

        return {
          key: roadKey,
          position: midpoint,
        };
      })
      .filter(Boolean);
  }, [blockGraph, safeBlockedEdges]);

  useEffect(() => {
    document.body.style.cursor =
      routeMode === "block" ? "crosshair" : "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [routeMode]);

  useEffect(() => {
    setProgressDistance(0);
    setIsPlaying(false);
  }, [activeRoute]);

  useEffect(() => {
    if (!isRoadMenuOpen) return;

    const handlePointerDown = (event) => {
      if (!roadMenuRef.current?.contains(event.target)) {
        setIsRoadMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isRoadMenuOpen]);

  useEffect(() => {
    if (!isCustomStartMenuOpen) return;

    const handlePointerDown = (event) => {
      if (!customStartMenuRef.current?.contains(event.target)) {
        setIsCustomStartMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isCustomStartMenuOpen]);

  useEffect(() => {
    if (!isPlaying || !activeRoute?.distance) return;

    let frame;
    let lastTime = null;

    const animate = (timestamp) => {
      if (lastTime == null) {
        lastTime = timestamp;
      }

      const deltaSeconds = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      setProgressDistance((prev) => {
        const next = prev + PLAYBACK_SPEED_MPS * playbackSpeed * deltaSeconds;
        if (next >= activeRoute.distance) {
          setIsPlaying(false);
          return activeRoute.distance;
        }
        return next;
      });

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [activeRoute, isPlaying, playbackSpeed]);

  const animationState = useMemo(() => {
    if (!activeRoute) {
      return {
        accumulatedDistance: 0,
        currentPosition: null,
        visibleCoords: [],
        visitedNodeIndex: -1,
      };
    }

    if (!pathSteps.length) {
      return {
        accumulatedDistance: 0,
        currentPosition: activeRoute.coords?.[0] || null,
        visibleCoords: activeRoute.coords?.[0] ? [activeRoute.coords[0]] : [],
        visitedNodeIndex: nodeVisits.length ? 0 : -1,
      };
    }

    const cappedDistance = Math.max(
      0,
      Math.min(progressDistance, activeRoute.distance ?? 0)
    );

    let travelledDistance = 0;
    let currentPosition = pathSteps[0]?.coords?.[0] || null;
    const visibleCoords = [];

    for (const step of pathSteps) {
      const stepDistance = step.distance || 0;
      const segmentEndDistance = travelledDistance + stepDistance;

      if (cappedDistance >= segmentEndDistance) {
        if (visibleCoords.length === 0) {
          visibleCoords.push(...step.coords);
        } else {
          visibleCoords.push(...step.coords.slice(1));
        }

        currentPosition =
          step.coords?.[step.coords.length - 1] || currentPosition;
        travelledDistance = segmentEndDistance;
        continue;
      }

      const fraction =
        stepDistance > 0 ? (cappedDistance - travelledDistance) / stepDistance : 0;
      const boundedFraction = Math.max(0, Math.min(fraction, 1));
      const scaledIndex = boundedFraction * Math.max(step.coords.length - 1, 0);
      const coordIndex = Math.floor(scaledIndex);
      const localFraction = scaledIndex - coordIndex;
      const start = step.coords[coordIndex] || step.coords[0] || null;
      const end =
        step.coords[Math.min(coordIndex + 1, step.coords.length - 1)] || start;
      const partialCoords = step.coords.slice(0, coordIndex + 1);

      if (visibleCoords.length === 0) {
        visibleCoords.push(...partialCoords);
      } else {
        visibleCoords.push(...partialCoords.slice(1));
      }

      if (start && end) {
        currentPosition = [
          start[0] + (end[0] - start[0]) * localFraction,
          start[1] + (end[1] - start[1]) * localFraction,
        ];
        visibleCoords.push(currentPosition);
      }

      travelledDistance = cappedDistance;
      break;
    }

    if (
      cappedDistance >= (activeRoute.distance ?? 0) &&
      activeRoute.coords?.length
    ) {
      currentPosition = activeRoute.coords[activeRoute.coords.length - 1];
      if (visibleCoords.length === 0) {
        visibleCoords.push(...activeRoute.coords);
      }
    }

    let visitedNodeIndex = -1;
    for (let i = 0; i < nodeVisits.length; i++) {
      if (nodeVisits[i].cumulativeDistance <= cappedDistance + 0.001) {
        visitedNodeIndex = i;
      } else {
        break;
      }
    }

    return {
      accumulatedDistance: cappedDistance,
      currentPosition,
      visibleCoords: visibleCoords.filter(Boolean),
      visitedNodeIndex,
    };
  }, [activeRoute, nodeVisits, pathSteps, progressDistance]);

  const currentNode =
    animationState.visitedNodeIndex >= 0
      ? nodeVisits[animationState.visitedNodeIndex]
      : null;
  const visitedNodes = nodeVisits.filter(
    (_, index) => index <= animationState.visitedNodeIndex
  );
  const visitedNodeIds = new Set(visitedNodes.map((node) => String(node.id)));
  const estimatedWalkTime = formatEstimatedWalkTime(activeRoute?.distance ?? 0);

  const handleRoadToggle = (u, v) => {
    const key = `${u}-${v}`;
    const reverse = `${v}-${u}`;

    setBlockedEdges((prev) => {
      const copy = new Set(prev);
      if (copy.has(key) || copy.has(reverse)) {
        copy.delete(key);
        copy.delete(reverse);
      } else {
        copy.add(key);
        copy.add(reverse);
      }
      return copy;
    });
  };

  const handlePlaybackToggle = () => {
    if (!activeRoute?.distance) return;

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (progressDistance >= activeRoute.distance) {
      setProgressDistance(0);
    }

    setIsPlaying(true);
  };

  if (!isModalOpen || !blockGraph) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-shell">
        <button
          type="button"
          className="modal-nav-btn modal-nav-btn-prev"
          onClick={onPrevBlock}
          disabled={!hasPrevBlock}
          title="Previous block"
          aria-label="Previous block"
        >
          <span className="modal-nav-icon">‹</span>
        </button>

        <button
          type="button"
          className="modal-nav-btn modal-nav-btn-next"
          onClick={onNextBlock}
          disabled={!hasNextBlock}
          title="Next block"
          aria-label="Next block"
        >
          <span className="modal-nav-icon">›</span>
        </button>

        <div className="modal-content">
          <button
            onClick={() => {
              setBlockedEdges(new Set());
              setRouteMode("optimized");
              closeModal();
            }}
            className="modal-close-btn"
            title="Close modal"
            aria-label="Close modal"
          >
            x
          </button>

          <div className="modal-layout">
            <div className="modal-map">
              <div className="modal-map-layer-toggle">
                <span className="modal-map-layer-title">Base Map</span>
                <button
                  type="button"
                  className={`modal-map-layer-btn ${
                    baseMapMode === "standard" ? "active" : ""
                  }`}
                  onClick={() => setBaseMapMode("standard")}
                >
                  Standard
                </button>
                <button
                  type="button"
                  className={`modal-map-layer-btn ${
                    baseMapMode === "night" ? "active" : ""
                  }`}
                  onClick={() => setBaseMapMode("night")}
                >
                  Black / Night
                </button>
              </div>

              <MapContainer
                style={{ height: "100%" }}
                center={[8.233, 124.237]}
                zoom={18}
                zoomControl={true}
              >
                <ControlMapInteraction mode={routeMode} />
                <FitToGraph geojson={blockGraph} />
                <TileLayer
                  url={
                    baseMapMode === "night"
                      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  }
                  attribution={
                    baseMapMode === "night"
                      ? '&copy; OpenStreetMap contributors &copy; CARTO'
                      : '&copy; OpenStreetMap contributors'
                  }
                  opacity={baseMapMode === "night" ? 0.92 : 0.4}
                />

              <GeoJSON
                key={`modal-geojson-${currentNode?.id || "start"}-${animationState.visitedNodeIndex}-${hoveredRoadKey || "none"}-${hoveredCustomStartNode || "no-custom-hover"}`}
                data={blockGraph}
                style={(f) => {
                  const t = f.properties?.type;
                  if (t === "edge") {
                    const u = String(f.properties.u);
                    const v = String(f.properties.v);
                    const isSpotlighted =
                      hoveredRoadKey === normalizeRoadKey(u, v);
                    if (
                      safeBlockedEdges.has(`${u}-${v}`) ||
                      safeBlockedEdges.has(`${v}-${u}`)
                    ) {
                      return {
                        color: isSpotlighted ? "#ff8b7f" : "#e74c3c",
                        weight: isSpotlighted ? 8 : 6,
                        opacity: 0.98,
                      };
                    }
                    return {
                      color: isSpotlighted ? "#ff7366" : "#3388ff",
                      weight: isSpotlighted ? 6 : 3,
                      opacity: isSpotlighted ? 1 : 0.9,
                    };
                  }
                  if (t === "pole_connection") {
                    return {
                      color: "#ff7800",
                      weight: 2,
                      opacity: 0.9,
                      dashArray: "4,4",
                    };
                  }
                  if (f.geometry?.type === "LineString") {
                    return { color: "#666", weight: 2, opacity: 0.8 };
                  }
                  return { color: "#666", weight: 1, opacity: 0.6 };
                }}
                onEachFeature={(feature, layer) => {
                  if (feature.properties?.type !== "edge") return;
                  layer.setStyle({ interactive: false });
                }}
                pointToLayer={(f, latlng) => {
                  const t = f.properties?.type;
                  const nodeId = String(f.properties?.id ?? "");
                  const isCurrent = currentNode?.id === nodeId;
                  const isVisited = visitedNodeIds.has(nodeId);
                  const isCustomStartHovered = hoveredCustomStartNode === nodeId;

                  if (t === "pole") {
                    const labelIcon = L.divIcon({
                      className: `pole-number ${
                        isCurrent
                          ? "current"
                          : isCustomStartHovered
                            ? "custom-hover"
                            : isVisited
                              ? "visited"
                              : "pending"
                      }`,
                      html: `<div>${f.properties?.id}</div>`,
                      iconSize: [26, 26],
                      iconAnchor: [-6, 6],
                    });
                    const markerGroup = L.layerGroup();
                    markerGroup.addLayer(
                      L.circleMarker(latlng, {
                        radius: isCurrent ? 6 : isCustomStartHovered ? 6 : isVisited ? 5 : 4,
                        fillColor: isCurrent
                          ? "#f39c12"
                          : isCustomStartHovered
                            ? "#9b59b6"
                          : isVisited
                            ? "#2ecc71"
                            : "#000",
                        color: "#000",
                        weight: 1,
                        fillOpacity: 1,
                      })
                    );
                    markerGroup.addLayer(
                      L.marker(latlng, { icon: labelIcon, interactive: false })
                    );
                    return markerGroup;
                  }

                  if (t === "snap") {
                    return L.circleMarker(latlng, {
                      radius: 5,
                      fillColor: "orange",
                      color: "white",
                      weight: 1,
                      fillOpacity: 1,
                    });
                  }

                  if (t === "vertex" || t === "intersection") {
                    return L.circleMarker(latlng, {
                      radius: 3,
                      fillColor: isCurrent
                        ? "#f39c12"
                        : isVisited
                          ? "#2ecc71"
                          : "#111",
                      color: "#f5f7fa",
                      weight: 1,
                      fillOpacity: isVisited || isCurrent ? 1 : 0.85,
                    });
                  }

                  return null;
                }}
              />

              {visitedNodes
                .filter((node) => node.coord)
                .map((node, index) => {
                  const isCurrent = currentNode?.id === node.id;
                  const shouldRender =
                    !isCurrent &&
                    (node.type === "vertex" || node.type === "intersection");

                  if (!shouldRender) return null;

                  return (
                    <Marker
                      key={`route-node-${node.id}-${index}`}
                      position={node.coord}
                      icon={createRouteNodeIcon(
                        node.id,
                        isCurrent ? "current" : "visited"
                      )}
                      interactive={false}
                    />
                  );
                })}

              {animationState.visibleCoords.length > 1 && (
                <Polyline
                  positions={animationState.visibleCoords}
                  pathOptions={{ color: "#2ecc71", weight: 5 }}
                />
              )}

              {blockedEdgeMarkers.map((edge) => (
                <Marker
                  key={`blocked-edge-${edge.key}`}
                  position={edge.position}
                  icon={blockedEdgeIcon}
                  interactive={false}
                />
              ))}

              {animationState.currentPosition && (
                <Marker
                  position={animationState.currentPosition}
                  icon={L.divIcon({
                    className: "snake-head",
                    html: "<div></div>",
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                  })}
                />
              )}
              </MapContainer>
            </div>

            <div className="modal-sidebar">
              <div className="modal-toolbar">
                <div className="modal-sidebar-heading">
                  <span className="modal-block-kicker">Route Playback</span>
                  <h3 className="modal-block-title">Block {selectedBlock?.properties?.id}</h3>
                </div>

              <div className="modal-actions">
                <div className="road-picker" ref={roadMenuRef}>
                  <button
                    type="button"
                    className={`road-picker-trigger ${isRoadMenuOpen ? "is-open" : ""}`}
                    onClick={() => setIsRoadMenuOpen((prev) => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={isRoadMenuOpen}
                    title="Select a road to block or unblock"
                  >
                    <span className="road-picker-trigger-copy">
                      <span className="road-picker-label">Road Control</span>
                      <span className="road-picker-value">
                        Select road to block or unblock
                      </span>
                    </span>
                    <span className="road-picker-caret">
                      {isRoadMenuOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {isRoadMenuOpen && (
                    <div className="road-picker-menu" role="listbox">
                      {allEdges.map((edge, idx) => {
                        const isBlocked = safeBlockedEdges.has(`${edge.u}-${edge.v}`);
                        const roadKey = normalizeRoadKey(edge.u, edge.v);
                        const isSpotlighted = hoveredRoadKey === roadKey;

                        return (
                          <button
                            key={idx}
                            type="button"
                            className={`road-picker-option ${isBlocked ? "is-blocked" : ""} ${
                              isSpotlighted ? "is-spotlighted" : ""
                            }`}
                            onClick={() => handleRoadToggle(edge.u, edge.v)}
                            onMouseEnter={() => setHoveredRoadKey(roadKey)}
                            onMouseLeave={() => setHoveredRoadKey(null)}
                          >
                            <span
                              className={`road-picker-status ${
                                isBlocked ? "blocked" : "open"
                              }`}
                            >
                              {isBlocked ? "Blocked" : "Open"}
                            </span>
                            <span className="road-picker-option-label">
                              {edge.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="modal-controls-row">
                  <div
                    className="playback-speed-toggle"
                    role="group"
                    aria-label="Playback speed"
                  >
                    {[1, 2, 3].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        className={`playback-speed-option ${
                          playbackSpeed === speed ? "active" : ""
                        }`}
                        onClick={() => setPlaybackSpeed(speed)}
                        title={`Set playback speed to ${speed}x`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>

                  <div className="route-mode-toggle" role="tablist" aria-label="Route mode">
                    <button
                      onClick={() => setRouteMode("optimized")}
                      className={`route-mode-option ${
                        routeMode === "optimized" ? "active optimized" : ""
                      }`}
                      title="Show optimized route"
                    >
                      Optimized
                    </button>
                    <button
                      onClick={() => setRouteMode("actual")}
                      className={`route-mode-option ${
                        routeMode === "actual" ? "active actual" : ""
                      }`}
                      title="Show actual route"
                    >
                      Actual
                    </button>
                    <button
                      onClick={() => {
                        if (!customStartNode && customStartNodeOptions.length) {
                          setCustomStartNode(customStartNodeOptions[0]);
                        }
                        setRouteMode("custom");
                      }}
                      className={`route-mode-option ${
                        routeMode === "custom" ? "active custom" : ""
                      }`}
                      title="Show route from a chosen start node"
                    >
                      Custom Start
                    </button>
                  </div>

                  <button
                    onClick={handlePlaybackToggle}
                    className="modal-icon-btn action-play"
                    title={
                      isPlaying
                        ? "Pause playback"
                        : progressDistance > 0
                          ? "Resume playback"
                          : "Start playback"
                    }
                    aria-label={
                      isPlaying
                        ? "Pause playback"
                        : progressDistance > 0
                          ? "Resume playback"
                          : "Start playback"
                    }
                  >
                    <span className="modal-action-icon">
                      {isPlaying ? "❚❚" : "▶"}
                    </span>
                  </button>

                  <button
                    onClick={() => setBlockedEdges(new Set())}
                    className="modal-icon-btn action-reset"
                    title="Reset blocked roads"
                    aria-label="Reset blocked roads"
                  >
                    <span className="modal-action-icon">↺</span>
                  </button>
                </div>

                {routeMode === "custom" && (
                  <div className="custom-start-picker" ref={customStartMenuRef}>
                    <button
                      type="button"
                      className={`custom-start-trigger ${
                        isCustomStartMenuOpen ? "is-open" : ""
                      }`}
                      onClick={() =>
                        setIsCustomStartMenuOpen((prev) => !prev)
                      }
                      aria-haspopup="listbox"
                      aria-expanded={isCustomStartMenuOpen}
                      title="Choose the pole where traversal will begin"
                    >
                      <span className="custom-start-trigger-copy">
                        <span className="custom-start-label">Custom Start</span>
                        <span className="custom-start-value">
                          {customStartNode
                            ? `Start from Pole ${customStartNode}`
                            : "Select starting pole"}
                        </span>
                      </span>
                      <span className="custom-start-caret">
                        {isCustomStartMenuOpen ? "▲" : "▼"}
                      </span>
                    </button>

                    {isCustomStartMenuOpen && (
                      <div className="custom-start-menu" role="listbox">
                        {customStartNodeOptions.map((nodeId) => (
                            <button
                              key={nodeId}
                              type="button"
                              className={`custom-start-option ${
                                customStartNode === nodeId ? "is-selected" : ""
                              } ${
                                hoveredCustomStartNode === nodeId
                                  ? "is-spotlighted"
                                  : ""
                              }`}
                              onMouseEnter={() => setHoveredCustomStartNode(nodeId)}
                              onMouseLeave={() => setHoveredCustomStartNode(null)}
                              onClick={() => {
                                setCustomStartNode(nodeId);
                                setHoveredCustomStartNode(null);
                                setIsCustomStartMenuOpen(false);
                              }}
                          >
                            <span className="custom-start-option-kicker">
                              Pole
                            </span>
                            <span className="custom-start-option-label">
                              {nodeId}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-header-copy">
                {activeRoute && (
                  <>
                    <div className="modal-metrics">
                      <div className="modal-metric-card">
                        <span className="modal-metric-label">Distance</span>
                        <span className="modal-metric-value">
                          {Number(animationState.accumulatedDistance ?? 0).toFixed(2)} m
                        </span>
                      </div>
                      <div className="modal-metric-card">
                        <span className="modal-metric-label">Route Total</span>
                        <span className="modal-metric-value">
                          {Number(activeRoute.distance ?? 0).toFixed(2)} m
                        </span>
                      </div>
                      <div className="modal-metric-card">
                        <span className="modal-metric-label">Est. Walk Time</span>
                        <span className="modal-metric-value">{estimatedWalkTime}</span>
                      </div>
                      <div className="modal-metric-card">
                        <span className="modal-metric-label">Current Node</span>
                        <span className="modal-metric-value">
                          {currentNode?.id || "Waiting"}
                        </span>
                      </div>
                    </div>

                    <div className="route-node-strip">
                      {(activeRoute.nodeSequence ?? []).map((nodeId, index) => {
                        let stateClass = "pending";
                        if (index < animationState.visitedNodeIndex) {
                          stateClass = "visited";
                        } else if (index === animationState.visitedNodeIndex) {
                          stateClass = "current";
                        }

                        return (
                          <span
                            key={`${nodeId}-${index}`}
                            className={`route-node-chip ${stateClass}`}
                          >
                            {nodeId}
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}

                {hasRouteFailure && (
                  <div className="modal-route-warning" role="alert">
                    Route unavailable. Unblock one of the selected roads to continue.
                  </div>
                )}

                <div className="road-toggle-summary">
                  <span className="road-toggle-title">Road Toggle</span>
                  <span
                    className={`road-toggle-count ${
                      blockedRoadCount > 0 ? "has-blocks" : ""
                    }`}
                  >
                    {blockedRoadCount} blocked
                  </span>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
