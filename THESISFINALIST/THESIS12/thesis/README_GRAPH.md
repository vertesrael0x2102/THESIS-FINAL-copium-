Graph builder

This script converts LineString/MultiLineString features from a GeoJSON into a weighted graph
and snaps pole points (from CSV files) to their nearest edge.

Usage:

python thesis\graph_builder.py --geojson saray-map.geojson --poles METERPOLES --outdir thesis/output

Outputs:
- thesis/output/graph.gpickle  (NetworkX graph)
- thesis/output/pole_connections.geojson  (GeoJSON lines from pole to snapped point)
- thesis/output/graph_nodes.csv, graph_edges.csv

Dependencies are listed in `thesis/requirements.txt`.
