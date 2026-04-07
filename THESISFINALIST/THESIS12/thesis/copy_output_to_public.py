from pathlib import Path
import shutil

src = Path('thesis') / 'output' / 'graph_full.geojson'
dst = Path('thesis') / 'public' / 'output' / 'graph_full.geojson'

if not src.exists():
    print('Source not found:', src)
    raise SystemExit(1)

dst.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(src, dst)
print('Copied', src, '->', dst)
