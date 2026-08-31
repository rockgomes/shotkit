#!/usr/bin/env bash
# Generates test/golden/ground.json from the original ground.py.
# Run ONCE. After this, Python is never needed again.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .venv-goldens
.venv-goldens/bin/pip install --quiet pillow

mkdir -p test/golden
.venv-goldens/bin/python - <<'PY' > test/golden/ground.json
import json, os, sys
sys.path.insert(0, ".")
from ground import ground_for

out = {}
for name in sorted(os.listdir("samples")):
    if name.endswith(".png"):
        out[name] = ground_for(["samples/" + name])
print(json.dumps(out, indent=1))
PY

rm -rf .venv-goldens
echo "wrote test/golden/ground.json"
