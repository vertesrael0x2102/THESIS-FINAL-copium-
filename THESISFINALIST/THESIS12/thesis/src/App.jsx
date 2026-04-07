import { useState, useEffect, useMemo, useRef } from 'react'
import './App.css'
import MapView from './components/MapView'
import { runBlockDijkstra } from './utils/networkUtils'
import { runSequentialRoute } from './utils/sequentialUtils'

const BLOCK_COLORS = [
  '#d95f5f',
  '#4ea67b',
  '#4f8edb',
  '#d4a63c',
  '#8e69c1',
  '#2f9f9d',
  '#d97941',
  '#c85d86',
  '#6c8a43',
  '#4b7fb8',
  '#b56a4b'
]

const ESTIMATED_WALK_SPEED_MPS = 2.8

const formatEstimatedWalkTime = (distanceMeters = 0) => {
  const totalSeconds = Math.max(
    1,
    Math.round(distanceMeters / ESTIMATED_WALK_SPEED_MPS)
  )
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours} hr ${minutes} min ${seconds} sec`
  }

  return `${minutes} min ${seconds} sec`
}

const getNiceAxisStep = (maxValue) => {
  if (maxValue <= 0) return 1
  return 50
}

function RouteComparisonChart({ chartData, hoveredBlockId }) {
  const [tooltip, setTooltip] = useState(null)
  const tooltipRef = useRef(null)
  const chartWrapRef = useRef(null)

  const updateTooltip = (event, row) => {
    const wrapRect = chartWrapRef.current?.getBoundingClientRect()
    if (!wrapRect) return

    const tooltipWidth = tooltipRef.current?.offsetWidth || 196
    const tooltipHeight = tooltipRef.current?.offsetHeight || 124
    const gap = 40
    const localX = event.clientX - wrapRect.left
    const localY = event.clientY - wrapRect.top
    const wouldOverflowRight = localX + gap + tooltipWidth > wrapRect.width - 12
    const wouldOverflowBottom = localY + gap + tooltipHeight > wrapRect.height - 12
    const unclampedLeft = wouldOverflowRight
      ? localX - tooltipWidth - gap
      : localX + gap
    const unclampedTop = wouldOverflowBottom
      ? localY - tooltipHeight - gap
      : localY + gap
    const nextLeft = Math.min(
      Math.max(unclampedLeft, 12),
      Math.max(12, wrapRect.width - tooltipWidth - 12)
    )
    const nextTop = Math.min(
      Math.max(unclampedTop, 12),
      Math.max(12, wrapRect.height - tooltipHeight - 12)
    )

    setTooltip({
      blockId: row.blockId,
      optimized: row.optimized,
      actual: row.actual,
      leftPx: nextLeft,
      topPx: nextTop,
    })
  }

  if (!chartData) {
    return <div className="sidebar-chart-empty">Loading route comparison...</div>
  }

    return (
    <>
      <div className="sidebar-chart-wrap" ref={chartWrapRef}>
        <svg
          className="sidebar-chart modal"
          viewBox={`0 0 ${chartData.width} ${chartData.height}`}
          role="img"
          aria-label="Line graph comparing optimized and actual route distances by block"
        >
          {chartData.gridLines.map((line) => (
            <g key={line.value}>
              <line
                x1="18"
                x2={chartData.width - 18}
                y1={line.y}
                y2={line.y}
                className="sidebar-chart-grid"
              />
              <text
                x={chartData.width - 22}
                y={line.y - 4}
                textAnchor="start"
                className="sidebar-chart-axis-label"
              >
                {line.value} m
              </text>
            </g>
          ))}

          <path d={chartData.actualPath} className="sidebar-chart-line actual" />
          <path d={chartData.optimizedPath} className="sidebar-chart-line optimized" />

          {chartData.rows.map((row) => (
            <g
              key={row.blockId}
              className="sidebar-chart-hit-area"
              onMouseEnter={(event) => updateTooltip(event, row)}
              onMouseMove={(event) => updateTooltip(event, row)}
              onMouseLeave={() => setTooltip(null)}
            >
              <line
                x1={row.x}
                x2={row.x}
                y1="18"
                y2={chartData.height - 18}
                className="sidebar-chart-hover-column"
              />
              <circle
                cx={row.x}
                cy={row.actualY}
                r="4"
                className={`sidebar-chart-point actual ${hoveredBlockId === row.blockId ? 'is-focus' : ''}`}
              />
              <circle
                cx={row.x}
                cy={row.optimizedY}
                r="4"
                className={`sidebar-chart-point optimized ${hoveredBlockId === row.blockId ? 'is-focus' : ''}`}
              />
              <circle
                cx={row.x}
                cy={(row.actualY + row.optimizedY) / 2}
                r="14"
                className="sidebar-chart-hit-circle"
              />
              <text
                x={row.x}
                y={chartData.height - 8}
                textAnchor="middle"
                className="sidebar-chart-axis-label block"
              >
                {row.blockId}
              </text>
            </g>
          ))}
        </svg>

        {tooltip && (
          <div
            ref={tooltipRef}
            className="sidebar-chart-tooltip"
            style={{
              left: `${tooltip.leftPx}px`,
              top: `${tooltip.topPx}px`,
            }}
          >
            <strong>Block {tooltip.blockId}</strong>
            <span>Actual: {tooltip.actual.toFixed(2)} m</span>
            <span>Actual Time: {formatEstimatedWalkTime(tooltip.actual)}</span>
            <span>Optimized: {tooltip.optimized.toFixed(2)} m</span>
            <span>Optimized Time: {formatEstimatedWalkTime(tooltip.optimized)}</span>
          </div>
        )}
      </div>

      <div className="sidebar-chart-legend modal">
        <span className="sidebar-chart-legend-item">
          <span className="sidebar-chart-legend-swatch optimized" />
          Optimized
        </span>
        <span className="sidebar-chart-legend-item">
          <span className="sidebar-chart-legend-swatch actual" />
          Actual
        </span>
      </div>
    </>
  )
}

function App() {
  const [blockings, setBlockings] = useState(null)
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [hoveredBlockId, setHoveredBlockId] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [routeComparison, setRouteComparison] = useState([])
  const [isChartModalOpen, setIsChartModalOpen] = useState(false)
  const [isChartModalVisible, setIsChartModalVisible] = useState(false)
  const blockButtonRefs = useRef({})

  useEffect(() => {
    fetch('/output/blockings.geojson')
      .then((r) => r.json())
      .then((data) => {
        const mapping = {
          0: 2, 1: 3, 2: 10, 3: 9, 4: 8, 5: 7,
          6: 5, 7: 4, 8: 6, 9: 1, 10: 11
        }
        data.features.forEach((f, i) => {
          f.properties.id = mapping[i] || (i + 1)
        })
        data.features.sort((a, b) => a.properties.id - b.properties.id)
        setBlockings(data)
      })
  }, [])

  useEffect(() => {
    if (!hoveredBlockId) return
    const targetButton = blockButtonRefs.current[hoveredBlockId]
    targetButton?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    })
  }, [hoveredBlockId])

  useEffect(() => {
    if (!blockings?.features?.length) return

    let cancelled = false

    Promise.all(
      blockings.features.map(async (feature) => {
        const blockId = Number(feature.properties.id)
        const response = await fetch(`/output/block${blockId}_full_graph.geojson`)
        const graph = await response.json()
        const optimized = runBlockDijkstra(graph)
        const actual = runSequentialRoute(graph)

        return {
          blockId,
          optimized: optimized?.distance ?? 0,
          actual: actual?.distance ?? 0,
        }
      })
    )
      .then((rows) => {
        if (cancelled) return
        rows.sort((a, b) => a.blockId - b.blockId)
        setRouteComparison(rows)
      })
      .catch((error) => {
        console.error('Failed to build sidebar route comparison', error)
        if (!cancelled) setRouteComparison([])
      })

    return () => {
      cancelled = true
    }
  }, [blockings])

  const chartData = useMemo(() => {
    if (!routeComparison.length) return null

    const width = 252
    const height = 136
    const padding = { top: 18, right: 18, bottom: 26, left: 18 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const values = routeComparison.flatMap((row) => [row.optimized, row.actual])
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values, 1)
    const range = Math.max(rawMax - rawMin, 1)
    const paddedMin = Math.max(0, rawMin - range * 0.18)
    const paddedMax = rawMax + range * 0.18
    const axisStep = getNiceAxisStep((paddedMax - paddedMin) || rawMax || 1)
    const axisMin = Math.max(0, Math.floor(paddedMin / axisStep) * axisStep)
    const axisMax = Math.min(
      1400,
      Math.max(axisStep, Math.ceil(paddedMax / axisStep) * axisStep)
    )
    const axisRange = Math.max(axisMax - axisMin, axisStep)

    const getX = (index) =>
      padding.left + (routeComparison.length === 1 ? plotWidth / 2 : (index / (routeComparison.length - 1)) * plotWidth)
    const getY = (value) =>
      padding.top + (1 - (value - axisMin) / axisRange) * plotHeight
    const toPath = (seriesValues) =>
      seriesValues
        .map((value, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(value)}`)
        .join(' ')

    return {
      width,
      height,
      rows: routeComparison.map((row, index) => ({
        ...row,
        index,
        x: getX(index),
        optimizedY: getY(row.optimized),
        actualY: getY(row.actual),
      })),
      optimizedPath: toPath(routeComparison.map((row) => row.optimized)),
      actualPath: toPath(routeComparison.map((row) => row.actual)),
      gridLines: Array.from(
        { length: Math.floor((axisMax - axisMin) / axisStep) + 1 },
        (_, index) => {
          const value = axisMin + axisStep * index
          return {
            y: getY(value),
            value,
          }
        }
      ),
    }
  }, [routeComparison])

  const openChartModal = () => {
    setIsChartModalOpen(true)
    requestAnimationFrame(() => setIsChartModalVisible(true))
  }

  const closeChartModal = () => {
    setIsChartModalVisible(false)
    window.setTimeout(() => {
      setIsChartModalOpen(false)
    }, 180)
  }

  return (
    <div className="app-grid-root">
        <section className="layout">
          <header className="layout-header">
            <div className="layout-header-copy">
              <h1>Route Optimization</h1>
              <p className="layout-header-subtitle">
                Barangay Saray electrical route analysis dashboard
              </p>
            </div>
          </header>

        <div className="sidebar">
          <div style={{ padding: '1rem' }}>
            <p className="read-the-docs" style={{ fontWeight: 'bold', marginBottom: '10px' }}>Blocks</p>
            <div className="block-button-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {blockings?.features.map((f) => {
                const blockColor = BLOCK_COLORS[(f.properties.id - 1) % BLOCK_COLORS.length]

                return (
                  <button
                    key={f.properties.id}
                    ref={(element) => {
                      if (element) {
                        blockButtonRefs.current[f.properties.id] = element
                      } else {
                        delete blockButtonRefs.current[f.properties.id]
                      }
                    }}
                    className={`sidebar-btn ${selectedBlockId === f.properties.id ? 'active' : ''} ${hoveredBlockId === f.properties.id ? 'hovered' : ''}`}
                    onClick={() => setSelectedBlockId(f.properties.id)}
                    onMouseEnter={() => setHoveredBlockId(f.properties.id)}
                    onMouseLeave={() => setHoveredBlockId(null)}
                    onMouseMove={(event) =>
                      setTooltipPosition({
                        x: event.clientX + 16,
                        y: event.clientY + 16
                      })
                    }
                    style={{
                      borderLeft: `5px solid ${blockColor}`,
                      textAlign: 'left',
                      paddingLeft: '12px'
                    }}
                  >
                    Block {f.properties.id}
                  </button>
                )
              })}
            </div>

            <div className="sidebar-chart-card">
              <div className="sidebar-chart-header">
                <div>
                  <p className="sidebar-chart-title">Route Comparison</p>
                  <small className="sidebar-chart-subtitle">Optimized vs Actual</small>
                </div>
                <button
                  className="sidebar-chart-maximize"
                  onClick={openChartModal}
                  disabled={!chartData}
                  title="Open larger chart"
                  aria-label="Open larger chart"
                >
                  ⛶
                </button>
              </div>

              <RouteComparisonChart chartData={chartData} hoveredBlockId={hoveredBlockId} />
            </div>
          </div>

          {hoveredBlockId && (
            <div
              className="sidebar-tooltip"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`
              }}
            >
              Block {hoveredBlockId}
            </div>
          )}
        </div>

        <div className="body">
          <MapView
            blockings={blockings}
            externalSelectedId={selectedBlockId}
            hoveredBlockId={hoveredBlockId}
            onHoverBlockChange={setHoveredBlockId}
            onCloseModal={() => setSelectedBlockId(null)}
          />
        </div>
      </section>

      {isChartModalOpen && (
        <div
          className={`chart-modal-overlay ${isChartModalVisible ? 'is-visible' : ''}`}
          onClick={closeChartModal}
        >
          <div className="chart-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              className="chart-modal-close"
              onClick={closeChartModal}
              aria-label="Close route comparison modal"
              title="Close"
            >
              x
            </button>

            <div className="sidebar-chart-header modal">
              <div className="sidebar-chart-title-row">
                <p className="sidebar-chart-title">Route Comparison</p>
                <small className="sidebar-chart-subtitle inline">
                  <span className="optimized">Optimized</span>
                  <span className="vs">vs</span>
                  <span className="actual">Actual</span>
                </small>
              </div>
            </div>

            <RouteComparisonChart chartData={chartData} hoveredBlockId={hoveredBlockId} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
