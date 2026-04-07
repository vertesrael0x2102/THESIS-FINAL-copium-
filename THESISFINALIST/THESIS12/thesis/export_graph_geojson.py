"""Export the graph saved at thesis/output/graph.gpickle into a single GeoJSON
containing Point features for nodes and LineString features for edges.

Run:
C:/.../python.exe thesis\export_graph_geojson.py

Output: thesis/output/graph_full.geojson
"""
import pickle
import json
from pathlib import Path

G_path = Path('thesis') / 'output' / 'graph.gpickle'
out_path = Path('thesis') / 'output' / 'graph_full.geojson'

if not G_path.exists():
    print('Graph file not found:', G_path)
    raise SystemExit(1)

with open(G_path, 'rb') as f:
    G = pickle.load(f)

features = []

# Nodes -> Point features
for nid, data in G.nodes(data=True):
    lon = data.get('lon')
    lat = data.get('lat')
    if lon is None or lat is None:
        # skip nodes without geographic coords
        continue
    prop = {'id': nid, 'type': data.get('type')}
    # include extra attrs (x,y) if present
    if 'x' in data and 'y' in data:
        prop['x'] = data.get('x')
        prop['y'] = data.get('y')
    features.append({
        'type': 'Feature',
        'properties': prop,
        'geometry': { 'type': 'Point', 'coordinates': [lon, lat] }
    })

# Edges -> LineString features
for u, v, ed in G.edges(data=True):
    nu = G.nodes.get(u)
    nv = G.nodes.get(v)
    if not nu or not nv:
        continue
    lon1 = nu.get('lon')
    lat1 = nu.get('lat')
    lon2 = nv.get('lon')
    lat2 = nv.get('lat')
    if None in (lon1, lat1, lon2, lat2):
        continue
    prop = {'u': u, 'v': v, 'type': ed.get('type'), 'weight': ed.get('weight')}
    geom = { 'type': 'LineString', 'coordinates': [ [lon1, lat1], [lon2, lat2] ] }
    features.append({ 'type': 'Feature', 'properties': prop, 'geometry': geom })

geo = { 'type': 'FeatureCollection', 'features': features }
out_path.write_text(json.dumps(geo))
print('Wrote', out_path)
