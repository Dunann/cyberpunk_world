import sys, os, glob
import numpy as np
from PIL import Image

# usage: count.py <dbg dir> <base dir> [mask_out_dir]
dd, bd = sys.argv[1], sys.argv[2]
mo = sys.argv[3] if len(sys.argv) > 3 else None
def green(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (g >= 35) & (g > 1.5 * np.maximum(r, b) + 10)
rows = []
for f in sorted(glob.glob(os.path.join(dd, '*.png'))):
    n = os.path.basename(f)
    bf = os.path.join(bd, n)
    a = np.asarray(Image.open(f).convert('RGB'))
    m = green(a)
    if os.path.exists(bf):
        m &= ~green(np.asarray(Image.open(bf).convert('RGB')))
    pct = 100.0 * m.mean()
    rows.append((n.split('-')[0], pct))
    if mo:
        os.makedirs(mo, exist_ok=True)
        Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(mo, n))
print(' '.join(f'{k}:{v:.1f}' for k, v in rows))
