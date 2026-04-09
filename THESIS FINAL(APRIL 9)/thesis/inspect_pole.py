import pickle
from pathlib import Path

G_path = Path('thesis') / 'output' / 'graph.gpickle'
if not G_path.exists():
    print('graph.gpickle not found at', G_path)
    raise SystemExit(1)

with open(G_path, 'rb') as f:
    G = pickle.load(f)

pole_id = 'pole_poleblock9_9h'
snap_id = 'snap_pole_poleblock9_9h'

print('Pole node:', pole_id)
if pole_id in G.nodes:
    print(G.nodes[pole_id])
else:
    print('  NOT FOUND')

print('\nSnap node:', snap_id)
if snap_id in G.nodes:
    print(G.nodes[snap_id])
else:
    print('  NOT FOUND')

print('\nEdges involving the pole:')
if pole_id in G.nodes:
    for nb in G[pole_id]:
        print(' -', pole_id, '<->', nb, G.edges[pole_id, nb])

print('\nEdges involving the snap:')
if snap_id in G.nodes:
    for nb in G[snap_id]:
        print(' -', snap_id, '<->', nb, G.edges[snap_id, nb])
