import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  ZoomControl,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";

// Styles
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "../styles/mapView.css";
import "../styles/modal.css";

// Utils
import { runBlockDijkstra, runBlockDijkstraFromNode } from "../utils/networkUtils";
import { runSequentialRoute } from "../utils/sequentialUtils";
import Modal from "../components/Modal";

// ---------------- ICON ----------------
const meterIcon = new L.Icon({
  iconUrl: "/meter.png",
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

const createBlockCountIcon = (blockId, poleCount, isSpotlighted = false) => {
  return L.divIcon({
    html: `
      <div class="block-count-badge ${isSpotlighted ? "is-spotlighted" : ""}">
        <span class="block-count-label">Block ${blockId}</span>
        <span class="block-count-total">${poleCount}</span>
      </div>
    `,
    className: "block-count-icon",
    iconSize: L.point(64, 64, true),
    iconAnchor: [32, 32],
  });
};

const createBarangaySummaryIcon = () =>
  L.divIcon({
    html: `
      <div class="barangay-summary-badge">
        <span class="barangay-summary-kicker">Barangay Saray</span>
        <span class="barangay-summary-title">11 Blocks</span>
      </div>
    `,
    className: "barangay-summary-icon",
    iconSize: L.point(180, 68, true),
    iconAnchor: [90, 34],
  });

const BLOCK_COLORS = [
  "#d95f5f",
  "#4ea67b",
  "#4f8edb",
  "#d4a63c",
  "#8e69c1",
  "#2f9f9d",
  "#d97941",
  "#c85d86",
  "#6c8a43",
  "#4b7fb8",
  "#b56a4b",
];

// ---------------- HELPERS ----------------
function getLatLngFromFeature(f) {
  try {
    if (f.geometry.type === "Polygon") {
      const coords = f.geometry.coordinates[0];

      let lat = 0;
      let lng = 0;

      coords.forEach(([x, y]) => {
        lng += x;
        lat += y;
      });

      return [lat / coords.length, lng / coords.length];
    }

    if (f.geometry.type === "Point") {
      const [lng, lat] = f.geometry.coordinates;
      return [lat, lng];
    }
  } catch (e) {
    console.warn("Invalid geometry:", f.properties?.id);
  }

  return null;
}

function isValidLatLng(latlng) {
  return (
    latlng &&
    Array.isArray(latlng) &&
    !isNaN(latlng[0]) &&
    !isNaN(latlng[1])
  );
}

function getFeatureCollectionCenter(featureCollection) {
  if (!featureCollection?.features?.length) return null;

  const validPoints = featureCollection.features
    .map(getLatLngFromFeature)
    .filter(isValidLatLng);

  if (!validPoints.length) return null;

  const totals = validPoints.reduce(
    (acc, [lat, lng]) => {
      acc.lat += lat;
      acc.lng += lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return [totals.lat / validPoints.length, totals.lng / validPoints.length];
}

// ---------------- ZOOM HANDLER ----------------
function ZoomHandler({ setZoom }) {
  useMapEvents({
    zoomend: (e) => {
      setZoom(e.target.getZoom());
    },
  });
  return null;
}

// ---------------- LAYERS ----------------
function GlobalLayer({ geojson }) {
  if (!geojson) return null;

  return (
    <GeoJSON
      data={geojson}
      style={(f) => {
        const t = f.properties?.type;
        if (t === "pole") return { color: "#ff0000", weight: 3 };
        if (t === "pole_connection")
          return { color: "#ff7800", weight: 2, dashArray: "5,5" };
        if (t === "edge") return { color: "#3388ff", weight: 3 };
        return { color: "#777", weight: 1 };
      }}
      pointToLayer={(f, latlng) =>
        f.properties?.type === "pole"
          ? L.marker(latlng, { icon: meterIcon })
          : L.circleMarker(latlng, {
              radius: 3,
              fillColor: "#3498db",
              color: "#fff",
              weight: 1,
              fillOpacity: 0.8,
            })
      }
    />
  );
}

function BlockCountLayer({
  blockings,
  poleCounts,
  hoveredBlockId,
  onHoverBlockChange,
  onSelect,
}) {
  if (!blockings) return null;

  return (
    <>
      {blockings.features.map((f, i) => {
        const latlng = getLatLngFromFeature(f);
        const blockId = Number(f.properties?.id);

        if (!isValidLatLng(latlng)) return null;

        return (
          <Marker
            key={`block-${f.properties?.id || i}`}
            position={latlng}
            icon={createBlockCountIcon(
              blockId,
              poleCounts[blockId] || 0,
              hoveredBlockId === blockId
            )}
            eventHandlers={{
              mouseover: () => onHoverBlockChange?.(blockId),
              mouseout: () => onHoverBlockChange?.(null),
              click: () => onSelect(f),
            }}
          />
        );
      })}
    </>
  );
}

function BarangaySummaryLayer({ blockings }) {
  const center = getFeatureCollectionCenter(blockings);

  if (!isValidLatLng(center)) return null;

  return <Marker position={center} icon={createBarangaySummaryIcon()} />;
}

function BlockPolygonLayer({
  blockings,
  hoveredBlockId,
  selectedBlockId,
  onHoverBlockChange,
  onSelect,
}) {
  if (!blockings) return null;

  return (
    <GeoJSON
      data={blockings}
      style={(feature) => {
        const id = Number(feature.properties?.id);
        const color = BLOCK_COLORS[(id - 1) % BLOCK_COLORS.length] || "#34495e";
        const isHovered = hoveredBlockId === id;
        const isSelected = selectedBlockId === id;

        return {
          className: "map-block-polygon",
          color,
          weight: isHovered || isSelected ? 4 : 2,
          fillColor: color,
          fillOpacity: isHovered ? 0.46 : isSelected ? 0.36 : 0.24,
          opacity: isHovered || isSelected ? 1 : 0.8,
          dashArray: isHovered || isSelected ? undefined : "2 4",
        };
      }}
      onEachFeature={(f, layer) => {
        const blockId = Number(f.properties?.id);
        layer.on("mouseover", () => onHoverBlockChange?.(blockId));
        layer.on("mouseout", () => onHoverBlockChange?.(null));
        layer.on("click", () => onSelect(f));
      }}
    />
  );
}

// ---------------- MAIN ----------------
export default function MapView({
  blockings,
  externalSelectedId,
  hoveredBlockId,
  onHoverBlockChange,
  onCloseModal,
}) {
  const [geojson, setGeojson] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [blockGraph, setBlockGraph] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [routeMode, setRouteMode] = useState("optimized");
  const [blockedEdges, setBlockedEdges] = useState(new Set());
  const [zoom, setZoom] = useState(15);
  const [poleCounts, setPoleCounts] = useState({});
  const [baseMapMode, setBaseMapMode] = useState("night");
  const [customStartNode, setCustomStartNode] = useState("");
  const orderedBlocks = useMemo(() => {
    if (!blockings?.features?.length) return [];

    return [...blockings.features].sort(
      (a, b) => Number(a.properties?.id) - Number(b.properties?.id)
    );
  }, [blockings]);
  const selectedBlockIndex = useMemo(() => {
    if (!selectedBlock) return -1;

    return orderedBlocks.findIndex(
      (feature) =>
        Number(feature.properties?.id) === Number(selectedBlock.properties?.id)
    );
  }, [orderedBlocks, selectedBlock]);

  // -------- ROUTE --------
  const activeRoute = useMemo(() => {
    if (!blockGraph) return null;
    if (routeMode === "custom") {
      return runBlockDijkstraFromNode(
        blockGraph,
        customStartNode,
        blockedEdges
      );
    }
    return routeMode === "actual"
      ? runSequentialRoute(blockGraph, blockedEdges)
      : runBlockDijkstra(blockGraph, blockedEdges);
  }, [blockGraph, routeMode, blockedEdges, customStartNode]);

  // -------- LOAD GLOBAL --------
  useEffect(() => {
    fetch("/output/graph_full.geojson")
      .then((r) => r.json())
      .then(setGeojson)
      .catch((e) => console.error("Failed to load graph_full.geojson", e));
  }, []);

  // -------- EXTERNAL SELECT --------
  useEffect(() => {
    if (!externalSelectedId || !blockings) return;
    const target = blockings.features.find(
      (f) => f.properties.id === externalSelectedId
    );
    if (target) setSelectedBlock(target);
  }, [externalSelectedId, blockings]);

  useEffect(() => {
    if (!blockings?.features?.length) return;

    let cancelled = false;

    Promise.all(
      blockings.features.map(async (feature) => {
        const blockId = Number(feature.properties?.id);
        const response = await fetch(`/output/block${blockId}_full_graph.geojson`);
        const data = await response.json();
        const poleCount = data.features.filter(
          (item) =>
            item.geometry?.type === "Point" && item.properties?.type === "pole"
        ).length;

        return [blockId, poleCount];
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setPoleCounts(Object.fromEntries(entries));
      })
      .catch((error) => {
        console.error("Failed to load pole counts for clusters", error);
        if (!cancelled) setPoleCounts({});
      });

    return () => {
      cancelled = true;
    };
  }, [blockings]);

  // -------- LOAD BLOCK GRAPH --------
  useEffect(() => {
    if (!selectedBlock) return;

    const blockId = Number(selectedBlock.properties.id);
    const url = `/output/block${blockId}_full_graph.geojson`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setBlockedEdges(new Set());
        setCustomStartNode("");
        setRouteMode("optimized");
        setBlockGraph(data);
        setIsModalOpen(true);
      })
      .catch((err) => {
        console.error("Error loading block graph:", err);
        setBlockGraph(null);
        setIsModalOpen(true);
      });
  }, [selectedBlock]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedBlock(null);
    setBlockGraph(null);
    setCustomStartNode("");
    setRouteMode("optimized");
    onCloseModal?.();
  };

  const handleSelectPreviousBlock = () => {
    if (!orderedBlocks.length || selectedBlockIndex < 0) return;

    const previousIndex =
      selectedBlockIndex === 0
        ? orderedBlocks.length - 1
        : selectedBlockIndex - 1;

    setSelectedBlock(orderedBlocks[previousIndex]);
  };

  const handleSelectNextBlock = () => {
    if (!orderedBlocks.length || selectedBlockIndex < 0) return;

    const nextIndex =
      selectedBlockIndex === orderedBlocks.length - 1
        ? 0
        : selectedBlockIndex + 1;

    setSelectedBlock(orderedBlocks[nextIndex]);
  };

  // -------- RENDER --------
  return (
    <div className="map-wrapper">
      <MapContainer
        center={[8.2335, 124.237]}
        zoom={15}
        className="main-map"
        zoomControl={false}
      >
        <ZoomHandler setZoom={setZoom} />

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
          opacity={baseMapMode === "night" ? 0.92 : 0.7}
        />

        <ZoomControl position="bottomright" />

        {/* FAR ZOOMED OUT VIEW */}
        {zoom < 17 && <BarangaySummaryLayer blockings={blockings} />}

        {/* ZOOMED OUT VIEW */}
        {zoom >= 17 && zoom < 18 && (
          <>
            <BlockCountLayer
              blockings={blockings}
              poleCounts={poleCounts}
              hoveredBlockId={hoveredBlockId}
              onHoverBlockChange={onHoverBlockChange}
              onSelect={setSelectedBlock}
            />
            <BlockPolygonLayer
              blockings={blockings}
              hoveredBlockId={hoveredBlockId}
              selectedBlockId={selectedBlock?.properties?.id ?? externalSelectedId}
              onHoverBlockChange={onHoverBlockChange}
              onSelect={setSelectedBlock}
            />
          </>
        )}

        {/* ZOOMED IN VIEW */}
        {zoom >= 18 && (
          <>
            <GlobalLayer geojson={geojson} />
            <BlockPolygonLayer
              blockings={blockings}
              hoveredBlockId={hoveredBlockId}
              selectedBlockId={selectedBlock?.properties?.id ?? externalSelectedId}
              onHoverBlockChange={onHoverBlockChange}
              onSelect={setSelectedBlock}
            />
          </>
        )}
      </MapContainer>

      <div className="map-layer-toggle">
        <div className="map-layer-toggle-title">Base Map</div>
        <button
          className={`map-layer-btn ${baseMapMode === "standard" ? "active" : ""}`}
          onClick={() => setBaseMapMode("standard")}
          type="button"
        >
          Standard
        </button>
        <button
          className={`map-layer-btn ${baseMapMode === "night" ? "active" : ""}`}
          onClick={() => setBaseMapMode("night")}
          type="button"
        >
          Black / Night
        </button>
      </div>

      <div className="map-legend">
        <div className="map-legend-title">Legend</div>
        <div className="map-legend-item">
          <span className="map-legend-swatch pole" />
          <span>Pole</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-swatch block" />
          <span>Block</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-swatch edge" />
          <span>Edge</span>
        </div>
      </div>

      <Modal
        isModalOpen={isModalOpen}
        blockGraph={blockGraph}
        selectedBlock={selectedBlock}
        activeRoute={activeRoute}
        routeMode={routeMode}
        setRouteMode={setRouteMode}
        closeModal={closeModal}
        blockedEdges={blockedEdges}
        setBlockedEdges={setBlockedEdges}
        customStartNode={customStartNode}
        setCustomStartNode={setCustomStartNode}
        onPrevBlock={handleSelectPreviousBlock}
        onNextBlock={handleSelectNextBlock}
        hasPrevBlock={orderedBlocks.length > 1 && selectedBlockIndex >= 0}
        hasNextBlock={orderedBlocks.length > 1 && selectedBlockIndex >= 0}
      />
    </div>
  );
}
