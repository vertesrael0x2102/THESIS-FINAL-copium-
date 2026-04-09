import json

def convert_block_to_graph_structure(geojson_data, block_id_str):
    features = geojson_data.get('features', [])
    
    # Storage for our graph components
    vertices = {} # Using a dict to avoid duplicate coordinates
    edges = []
    
    # 1. First Pass: Find all nodes (Points) related to this block
    # We need to know their IDs and Coordinates to build the "Vertices"
    for f in features:
        props = f['properties']
        geom = f['geometry']
        f_id = props.get('id')
        
        # Only process Points that belong to this block or are network junctions
        if geom['type'] == 'Point':
            # Check if it's a pole/snap for this block or a general vertex
            if (f_id and block_id_str in f_id) or props.get('type') == 'vertex':
                vertices[f_id] = {
                    "id": f_id,
                    "type": props.get('type'),
                    "lat": geom['coordinates'][1],
                    "lng": geom['coordinates'][0]
                }

    # 2. Second Pass: Find Edges (Lines)
    for f in features:
        props = f['properties']
        u, v = props.get('u'), props.get('v')
        
        if u and v:
            # Only include edges where at least one side belongs to our block
            if block_id_str in u or block_id_str in v:
                # Ensure we actually have the coordinate data for both ends
                if u in vertices and v in vertices:
                    edges.append({
                        "source": u,
                        "target": v,
                        "type": props.get('type'),
                        "weight": props.get('weight')
                    })

    return {
        "block": block_id_str,
        "vertices": list(vertices.values()),
        "edges": edges
    }