"""Quick verification of the built graph.
Checks that every node of type 'pole' has a 'pole_connection' edge to a 'snap' node.
Also computes a sample shortest path between the first two poles (if available).
"""
import pickle
import networkx as nx
from pathlib import Path

G_path = Path('thesis') / 'output' / 'graph.gpickle'
if not G_path.exists():
    print('graph.gpickle not found at', G_path)
    raise SystemExit(1)

with open(G_path, 'rb') as f:
    G = pickle.load(f)

poles = [n for n,d in G.nodes(data=True) if d.get('type') == 'pole']
print(f'Total pole nodes found: {len(poles)}')

unconnected = []
for p in poles:
    has_connection = False
    for nb in G[p]:
        edata = G.edges[p, nb]
        if edata.get('type') == 'pole_connection':
            has_connection = True
            break
    if not has_connection:
        unconnected.append(p)

if not unconnected:
    print('All pole nodes have a pole_connection to the graph.')
else:
    print('Unconnected poles (no pole_connection edge):')
    for u in unconnected:
        print(' -', u)

# sample shortest path between first two poles
if len(poles) >= 2:
    a, b = poles[0], poles[1]
    try:
        length = nx.shortest_path_length(G, a, b, weight='weight')
        path = nx.shortest_path(G, a, b, weight='weight')
        print(f"Sample shortest path between {a} and {b}: distance {length:.2f} meters, path length {len(path)} nodes")
    except Exception as e:
        print('Could not compute shortest path between first two poles:', e)
else:
    print('Not enough pole nodes to compute a sample shortest path.')
