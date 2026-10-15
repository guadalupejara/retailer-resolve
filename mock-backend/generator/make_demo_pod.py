"""
Makes the stamped POD that the "Use demo file" shortcut attaches to WMT-001.

Uses the same drawing code as make_evidence.py, with WMT-001's own PO, ship-to, PRO number and delivery
date from data/seed.json, a DC stamp and a signature, and the MOCK marking. seed.json is read, never written.

Output: public/evidence/demo/WMT-001-pod-stamped.pdf
Run:    python3 generator/make_demo_pod.py
"""
import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_evidence as me  # noqa: E402
from PIL import ImageFont  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The app serves public/ from the repo root, one level above mock-backend/.
APP = os.path.dirname(ROOT)
OUT = os.path.join(APP, "public", "evidence", "demo", "WMT-001-pod-stamped.pdf")

# Fonts that exist on macOS. make_evidence.py looks for DejaVu, which isn't installed here.
FONTS = {
    "regular": ["/Library/Fonts/Arial Unicode.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"],
    "bold": ["/Library/Fonts/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"],
    "mono": ["/System/Library/Fonts/Supplemental/Courier New.ttf", "/Library/Fonts/Courier New.ttf"],
}


def _font(size, bold=False, mono=False):
    kind = "mono" if mono else "bold" if bold else "regular"
    for path in FONTS[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise RuntimeError(f"No {kind} font found; looked in {FONTS[kind]}")


me.font = _font  # the drawing helpers call me.font(), so every label uses the font above


def main():
    seed = json.load(open(os.path.join(ROOT, "data", "seed.json")))
    base = next(e for e in seed["evidence"] if e["deduction_id"] == "WMT-001" and e["doc_type"] == "pod")
    ev = copy.deepcopy(base)  # never touch the seed record
    ev["extracted"]["stamp_or_signature"] = True
    ev["extracted"]["legible"] = True

    img = me.shipping_doc(seed, ev)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PDF", resolution=150)

    d = next(x for x in seed["deductions"] if x["id"] == "WMT-001")
    sh = next(x for x in seed["shipments"] if x["po_number"] == d["po_number"])
    po = next(x for x in seed["purchase_orders"] if x["po_number"] == d["po_number"])
    print(f"wrote {os.path.relpath(OUT, APP)}")
    print(f"  PO:            {d['po_number']}")
    print(f"  Ship-to:       {po['ship_to']}")
    print(f"  PRO number:    {sh['pro_number']}")
    print(f"  Delivery date: {sh['delivery_date']}")
    print(f"  Stamp: RECEIVED / DC 6012 / {sh['delivery_date']} / IN FULL; signature; MOCK band at the foot")


if __name__ == "__main__":
    main()
