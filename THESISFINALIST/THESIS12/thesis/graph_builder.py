"""Graph builder: convert GeoJSON LineString/MultiLineString edges into a weighted graph,
and connect pole points (from CSV blocks) to the nearest edge by projecting them onto the
closest line and adding weighted edges (distance in meters).

Usage: python graph_builder.py --geojson ../saray-map.geojson --poles ../METERPOLES --outdir output

Outputs saved to `thesis/output/` by default:
 - graph.gpickle (NetworkX graph)
 - pole_connections.geojson (connections from pole to snapped point)
 - graph_nodes.csv / graph_edges.csv (optional CSV exports)

Dependencies: shapely, pyproj, networkx, geopy
"""
from pathlib import Path
import json
import argparse
import csv
import math

import networkx as nx
from shapely.geometry import LineString, Point, mapping
from shapely.ops import transform
from pyproj import Transformer
import pickle

# small helper: parse "lat, lon" (note CSV uses lat, lon) -> return (lon, lat)
def parse_pole_loc(s: str):
    s = s.strip().strip('"')
    parts = [p.strip() for p in s.split(',')]
    if len(parts) < 2:
        raise ValueError(f"Unexpected POLE_LOC format: {s}")
    lat = float(parts[0])
    lon = float(parts[1])
    return (lon, lat)


def build_graph(geojson_path: Path, poles_folder: Path, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)

    # Transformer for metric distances (Web Mercator meters)
    transformer = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
    project = lambda x, y: transformer.transform(x, y)
    inverse_transformer = Transformer.from_crs('EPSG:3857', 'EPSG:4326', always_xy=True)
    inv_project = lambda x, y: inverse_transformer.transform(x, y)

    # load geojson
    gj = json.loads(geojson_path.read_text())

    G = nx.Graph()

    # We'll keep a mapping from lines index to its projected shapely LineString
    lines = []

    # Add nodes for vertices of each line and edges between consecutive vertices
    node_id_counter = 0
    coord_to_node = {}  # map (x,y) in projected coords to node id

    def get_or_create_node(coord_proj, coord_geo):
        # coord_proj: (x,y) in meters; coord_geo: (lon,lat)
        key = (round(coord_proj[0], 3), round(coord_proj[1], 3))
        if key in coord_to_node:
            return coord_to_node[key]
        nonlocal node_id_counter
        nid = f"v{node_id_counter}"
        node_id_counter += 1
        coord_to_node[key] = nid
        G.add_node(nid, x=coord_proj[0], y=coord_proj[1], lon=coord_geo[0], lat=coord_geo[1], type='vertex')
        return nid

    for fi, feat in enumerate(gj.get('features', [])):
        geom = feat.get('geometry')
        if not geom:
            continue
        gtype = geom.get('type')
        coords_list = []
        if gtype == 'LineString':
            coords_list = [geom['coordinates']]
        elif gtype == 'MultiLineString':
            coords_list = geom['coordinates']
        else:
            continue

        for coords in coords_list:
            # coords: list of [lon, lat]
            # build projected line
            proj_coords = [project(c[0], c[1]) for c in coords]
            linestring = LineString(proj_coords)
            lines.append({'line': linestring, 'orig_coords': coords, 'feat_index': fi})

            # add vertices and edges
            prev_nid = None
            for i, (lon, lat) in enumerate(coords):
                cp = project(lon, lat)
                nid = get_or_create_node(cp, (lon, lat))
                if prev_nid is not None:
                    # weight = Euclidean distance in projected (meters)
                    dx = G.nodes[prev_nid]['x'] - G.nodes[nid]['x']
                    dy = G.nodes[prev_nid]['y'] - G.nodes[nid]['y']
                    dist = math.hypot(dx, dy)
                    G.add_edge(prev_nid, nid, weight=dist, type='edge', feat_index=fi)
                prev_nid = nid

    # Read poles from CSV files in poles_folder
    poles = []  # list of dicts with id, lon, lat, block, number
    for csvfile in sorted(poles_folder.glob('*.csv')):
        with csvfile.open('r', encoding='utf-8') as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                loc = row.get('POLE_LOC') or row.get('pole_loc')
                if not loc:
                    continue
                lon, lat = parse_pole_loc(loc)
                pid = f"pole_{csvfile.stem}_{row.get('NUMBER') or row.get('Number') or ''}"
                poles.append({'id': pid, 'lon': lon, 'lat': lat, 'csv': csvfile.name, 'row': row})

    # For each pole, find nearest line and project
    pole_connections = []
    for p in poles:
        p_proj = project(p['lon'], p['lat'])
        p_point = Point(p_proj)
        best = None
        best_dist = float('inf')
        best_line_idx = None
        for idx, l in enumerate(lines):
            d = p_point.distance(l['line'])
            if d < best_dist:
                best_dist = d
                best = l
                best_line_idx = idx
        if best is None:
            continue
        # compute snapped point on the line
        line = best['line']
        proj_distance_along = line.project(p_point)
        snapped_point = line.interpolate(proj_distance_along)
        # create a node for the pole and for snapped point
        pole_nid = p['id']
        G.add_node(pole_nid, x=p_proj[0], y=p_proj[1], lon=p['lon'], lat=p['lat'], type='pole')

        # snapped node id
        sn_key = (round(snapped_point.x, 3), round(snapped_point.y, 3))
        sn_nid = coord_to_node.get(sn_key)
        if not sn_nid:
            # create snapped node
            sn_nid = f"snap_{pole_nid}"
            # convert back to lon/lat for attributes
            lonlat = inv_project(snapped_point.x, snapped_point.y)
            G.add_node(sn_nid, x=snapped_point.x, y=snapped_point.y, lon=lonlat[0], lat=lonlat[1], type='snap')
            # connect snapped node into the graph by connecting to the two nearest existing vertices on that line
            # find nearest segment endpoints in original line coords
            min_seg_dist = float('inf')
            seg_pair = None
            # evaluate pairwise consecutive vertices of the line
            for i in range(len(best['orig_coords']) - 1):
                a = project(best['orig_coords'][i][0], best['orig_coords'][i][1])
                b = project(best['orig_coords'][i + 1][0], best['orig_coords'][i + 1][1])
                seg = LineString([a, b])
                d = seg.distance(snapped_point)
                if d < min_seg_dist:
                    min_seg_dist = d
                    seg_pair = (a, b)
            if seg_pair is None:
                # fallback: connect to nearest existing vertex
                nearest_key = min(coord_to_node.keys(), key=lambda k: math.hypot(k[0]-snapped_point.x, k[1]-snapped_point.y))
                nearest_vid = coord_to_node[nearest_key]
                dx = G.nodes[nearest_vid]['x'] - snapped_point.x
                dy = G.nodes[nearest_vid]['y'] - snapped_point.y
                dist = math.hypot(dx, dy)
                G.add_edge(sn_nid, nearest_vid, weight=dist, type='edge')
            else:
                a, b = seg_pair
                # get node ids for a and b (they should exist)
                key_a = (round(a[0], 3), round(a[1], 3))
                key_b = (round(b[0], 3), round(b[1], 3))
                nid_a = coord_to_node.get(key_a)
                nid_b = coord_to_node.get(key_b)
                # add edges from snap to a and b
                if nid_a:
                    dist_a = math.hypot(G.nodes[nid_a]['x'] - snapped_point.x, G.nodes[nid_a]['y'] - snapped_point.y)
                    G.add_edge(sn_nid, nid_a, weight=dist_a, type='edge')
                if nid_b:
                    dist_b = math.hypot(G.nodes[nid_b]['x'] - snapped_point.x, G.nodes[nid_b]['y'] - snapped_point.y)
                    G.add_edge(sn_nid, nid_b, weight=dist_b, type='edge')

        # connect pole to snap node
        dx = G.nodes[sn_nid]['x'] - p_proj[0]
        dy = G.nodes[sn_nid]['y'] - p_proj[1]
        dist_pole_snap = math.hypot(dx, dy)
        G.add_edge(pole_nid, sn_nid, weight=dist_pole_snap, type='pole_connection')

        # store connection for geojson output
        pole_connections.append({
            'pole_id': pole_nid,
            'pole_lon': p['lon'],
            'pole_lat': p['lat'],
            'snap_x': G.nodes[sn_nid]['x'],
            'snap_y': G.nodes[sn_nid]['y'],
            'snap_lon': G.nodes[sn_nid]['lon'],
            'snap_lat': G.nodes[sn_nid]['lat'],
            'distance_m': dist_pole_snap
        })

    # save graph
    out_graph = outdir / 'graph.gpickle'
    # Write graph using Python pickle for compatibility
    with open(str(out_graph), 'wb') as gf:
        pickle.dump(G, gf)

    # save pole connections as GeoJSON (LineStrings)
    features = []
    for pc in pole_connections:
        coords = [ [pc['pole_lon'], pc['pole_lat']], [pc['snap_lon'], pc['snap_lat']] ]
        feat = { 'type': 'Feature', 'properties': {'pole_id': pc['pole_id'], 'distance_m': pc['distance_m']}, 'geometry': { 'type': 'LineString', 'coordinates': coords } }
        features.append(feat)
    geo = { 'type': 'FeatureCollection', 'features': features }
    (outdir / 'pole_connections.geojson').write_text(json.dumps(geo))

    # optional CSVs
    with (outdir / 'graph_nodes.csv').open('w', encoding='utf-8') as fh:
        fh.write('node_id,type,lon,lat,x,y\n')
        for nid, data in G.nodes(data=True):
            fh.write(f"{nid},{data.get('type')},{data.get('lon')},{data.get('lat')},{data.get('x')},{data.get('y')}\n")

    with (outdir / 'graph_edges.csv').open('w', encoding='utf-8') as fh:
        fh.write('u,v,weight,type\n')
        for u,v,data in G.edges(data=True):
            fh.write(f"{u},{v},{data.get('weight')},{data.get('type')}\n")

    print(f"Saved graph to: {out_graph}\nSaved pole connections GeoJSON to: {(outdir / 'pole_connections.geojson')}\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--geojson', required=True, help='Path to GeoJSON of edges')
    parser.add_argument('--poles', required=True, help='Path to folder containing pole CSVs')
    parser.add_argument('--outdir', default='thesis/output', help='Output folder')
    args = parser.parse_args()
    gpath = Path(args.geojson)
    ppath = Path(args.poles)
    outdir = Path(args.outdir)
    build_graph(gpath, ppath, outdir)
