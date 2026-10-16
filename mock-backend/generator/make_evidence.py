"""
Renders the evidence files listed in data/seed.json into evidence/<case>/...
  pod / bol / delivery_confirmation / claim -> PDF (drawn, with variants)
  asn_file                                  -> EDI 856 text
  carton_photo                              -> PNG placeholder (replace with real photos)
Every file is marked MOCK. Run after generate.py:  python3 generator/make_evidence.py
"""
import json
import os
import random
from datetime import datetime

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
W, H = 1275, 1650  # US letter at 150 dpi


def font(size, bold=False, mono=False):
    name = "DejaVuSansMono" if mono else "DejaVuSans"
    if bold:
        name += "-Bold"
    try:
        return ImageFont.truetype(os.path.join(FONT_DIR, name + ".ttf"), size)
    except OSError:
        return ImageFont.load_default()


INK = (30, 32, 38)
MUTED = (110, 114, 124)
RULE = (190, 194, 202)
RED = (196, 38, 46)
BLUE = (28, 70, 160)


def page():
    img = Image.new("RGB", (W, H), (252, 251, 247))
    return img, ImageDraw.Draw(img)


def mock_band(dr):
    dr.rectangle([0, H - 60, W, H], fill=(240, 236, 226))
    dr.text((60, H - 46), "MOCK DOCUMENT FOR HACKATHON DEMO. Fictional companies, people and numbers.",
            font=font(20), fill=MUTED)


def field(dr, x, y, label, value, w=520):
    dr.text((x, y), label.upper(), font=font(17, bold=True), fill=MUTED)
    dr.text((x, y + 24), str(value), font=font(26), fill=INK)
    dr.line([x, y + 62, x + w, y + 62], fill=RULE, width=2)


def stamp(dr, cx, cy, dc_label, date_s, rot_img=None):
    r = 120
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=RED, width=6)
    dr.ellipse([cx - r + 14, cy - r + 14, cx + r - 14, cy + r - 14], outline=RED, width=2)
    for i, t in enumerate(["RECEIVED", dc_label, date_s, "IN FULL"]):
        f = font(30 if i == 0 else 22, bold=(i == 0))
        tw = dr.textlength(t, font=f)
        dr.text((cx - tw / 2, cy - 72 + i * 38), t, font=f, fill=RED)


def signature(dr, x, y):
    random.seed(x + y)
    pts = []
    for i in range(40):
        pts.append((x + i * 9, y + 30 * __import__("math").sin(i / 2.3) + random.randint(-6, 6)))
    dr.line(pts, fill=BLUE, width=4, joint="curve")


def ctx_for(seed, ev):
    d = next(x for x in seed["deductions"] if x["id"] == ev["deduction_id"])
    po = next(x for x in seed["purchase_orders"] if x["po_number"] == d["po_number"])
    sh = next(x for x in seed["shipments"] if x["po_number"] == d["po_number"])
    carrier = next(c for c in seed["carriers"] if c["id"] == sh["carrier_id"])
    asn = next(a for a in seed["asns"] if a["po_number"] == d["po_number"])
    inv = next(i for i in seed["invoices"] if i["invoice_number"] == d["invoice_number"])
    return d, po, sh, carrier, asn, inv


def shipping_doc(seed, ev):
    d, po, sh, carrier, asn, inv = ctx_for(seed, ev)
    x = ev["extracted"]
    legible = x.get("legible", True)
    # illegible scans still need underlying values to draw
    po_shown = x.get("po_number") or po["po_number"]
    ship_to = x.get("ship_to") or po["ship_to"]
    is_bol = ev["doc_type"] == "bol"
    img, dr = page()

    dr.text((60, 50), carrier["name"].upper(), font=font(40, bold=True), fill=INK)
    title = "STRAIGHT BILL OF LADING" if is_bol else "DELIVERY RECEIPT / PROOF OF DELIVERY"
    dr.text((60, 104), title, font=font(28), fill=MUTED)
    dr.text((W - 360, 60), f"PRO {sh['pro_number']}", font=font(30, bold=True), fill=INK)
    dr.line([60, 160, W - 60, 160], fill=INK, width=3)

    field(dr, 60, 190, "Shipper", "Brightleaf Snacks Co., Fresno, CA")
    field(dr, 660, 190, "Consignee / ship-to", ship_to, w=555)
    field(dr, 60, 290, "Customer PO number", po_shown)
    field(dr, 660, 290, "Bill of lading no.", f"BOL-{sh['pro_number'][3:]}", w=555)
    field(dr, 60, 390, "Ship date", sh["ship_date"])
    field(dr, 660, 390, "Delivery date", sh["delivery_date"], w=555)
    field(dr, 60, 490, "Freight terms", sh["terms"].title())
    field(dr, 660, 490, "Handling units", f"{asn['carton_count']} cartons on 1 pallet", w=555)

    # line items
    y = 620
    dr.rectangle([60, y, W - 60, y + 50], fill=(232, 230, 222))
    for cx, t in [(80, "ITEM"), (300, "DESCRIPTION"), (900, "QTY"), (1040, "WEIGHT")]:
        dr.text((cx, y + 12), t, font=font(20, bold=True), fill=INK)
    dr.text((80, y + 70), po["item_sku"], font=font(22), fill=INK)
    dr.text((300, y + 70), po["item_description"][:42], font=font(22), fill=INK)
    dr.text((900, y + 70), str(po["quantity"]), font=font(22), fill=INK)
    dr.text((1040, y + 70), f"{po['quantity'] * 7} lb", font=font(22), fill=INK)
    dr.line([60, y + 120, W - 60, y + 120], fill=RULE, width=2)

    # receipt / signature block
    y = 900
    dr.rectangle([60, y, W - 60, y + 430], outline=INK, width=3)
    label = "CARRIER SIGNATURE (freight received in full)" if is_bol else "RECEIVER: DC STAMP OR STORE SIGNATURE"
    dr.text((80, y + 18), label, font=font(22, bold=True), fill=INK)
    dr.text((80, y + 360), "Exceptions / notes:", font=font(20), fill=MUTED)
    if x.get("stamp_or_signature") or (not legible):
        if is_bol:
            signature(dr, 120, y + 180)
            dr.text((120, y + 260), "Driver, " + carrier["name"], font=font(20), fill=MUTED)
        else:
            dc = ship_to.split(",")[0].replace("Walmart ", "").replace("Amazon ", "")
            stamp(dr, 900, y + 200, dc, sh["delivery_date"])
            signature(dr, 120, y + 170)
    else:
        dr.text((120, y + 160), "_" * 40, font=font(26), fill=RULE)
        dr.text((120, y + 210), "(no stamp or signature on file)", font=font(20), fill=MUTED)

    mock_band(dr)
    if not legible:
        img = img.rotate(1.6, fillcolor=(235, 233, 226)).filter(ImageFilter.GaussianBlur(5.5))
        img = Image.blend(img, Image.new("RGB", img.size, (205, 202, 192)), 0.45)
    return img


def delivery_confirmation(seed, ev):
    d, po, sh, carrier, asn, inv = ctx_for(seed, ev)
    x = ev["extracted"]
    img, dr = page()
    dr.text((60, 50), carrier["name"].upper(), font=font(40, bold=True), fill=INK)
    dr.text((60, 104), "SHIPMENT TRACKING: DELIVERY CONFIRMATION", font=font(28), fill=MUTED)
    dr.line([60, 160, W - 60, 160], fill=INK, width=3)
    ok = x.get("delivered")
    color = (24, 120, 70) if ok else RED
    status = "DELIVERED IN FULL" if ok else f"DELIVERED: SHORT ({x.get('cartons_delivered')} cartons)"
    dr.rectangle([60, 200, W - 60, 300], outline=color, width=4)
    dr.text((90, 228), status, font=font(40, bold=True), fill=color)
    field(dr, 60, 340, "Tracking / PRO", x.get("tracking"))
    field(dr, 660, 340, "Reference PO", x.get("po_number"), w=555)
    field(dr, 60, 440, "Delivered to", x.get("ship_to"), w=1155)
    field(dr, 60, 540, "Delivery date", sh["delivery_date"])
    field(dr, 660, 540, "Cartons tendered", asn["carton_count"], w=555)
    y = 680
    dr.text((60, y), "SCAN HISTORY", font=font(20, bold=True), fill=MUTED)
    events = [(sh["ship_date"], "Picked up, Fresno, CA"), (sh["ship_date"], "Departed origin terminal"),
              (sh["delivery_date"], "Arrived at destination terminal"),
              (sh["delivery_date"], "Delivered: " + ("all cartons received" if ok else "receiver signed for partial"))]
    for i, (dt, t) in enumerate(events):
        dr.text((60, y + 40 + i * 44), dt, font=font(22, mono=True), fill=INK)
        dr.text((280, y + 40 + i * 44), t, font=font(22), fill=INK)
    mock_band(dr)
    return img


def claim_doc(seed, ev):
    d, po, sh, carrier, asn, inv = ctx_for(seed, ev)
    x = ev["extracted"]
    img, dr = page()
    dr.text((60, 50), "RETAILER CLAIM DETAIL", font=font(40, bold=True), fill=INK)
    dr.text((60, 104), "Accounts payable deduction, Code 11: Pricing overcharge", font=font(26), fill=MUTED)
    dr.line([60, 160, W - 60, 160], fill=INK, width=3)
    field(dr, 60, 190, "Claim number", x.get("claim_number"))
    field(dr, 660, 190, "Supplier", "Brightleaf Snacks Co.", w=555)
    field(dr, 60, 290, "PO number", x.get("po_number"))
    field(dr, 660, 290, "Invoice number", inv["invoice_number"], w=555)
    field(dr, 60, 390, "Item", f"{po['item_sku']}  {po['item_description'][:30]}", w=1155)
    field(dr, 60, 490, "PO unit cost", f"${po['unit_price']:.2f}")
    field(dr, 660, 490, "Invoiced unit cost", f"${inv['unit_price']:.2f}", w=555)
    field(dr, 60, 590, "Quantity", po["quantity"])
    field(dr, 660, 590, "Claim amount", f"${x.get('amount'):.2f}", w=555)
    mock_band(dr)
    return img


def carton_photo(seed, ev):
    x = ev["extracted"]
    img = Image.new("RGB", (1600, 1200), (214, 210, 200))
    dr = ImageDraw.Draw(img)
    dr.polygon([(0, 900), (1600, 860), (1600, 1200), (0, 1200)], fill=(170, 160, 146))  # floor
    box = (420, 420, 1180, 980)
    cardboard, edge = (196, 150, 98), (150, 108, 64)
    dr.rectangle(box, fill=cardboard, outline=edge, width=6)
    if x.get("carton_opened"):
        dr.polygon([(420, 420), (300, 250), (760, 250), (800, 420)], fill=(206, 162, 110), outline=edge)
        dr.polygon([(800, 420), (840, 250), (1300, 250), (1180, 420)], fill=(206, 162, 110), outline=edge)
        dr.rectangle([440, 430, 1160, 520], fill=(120, 88, 52))
        if x.get("units_visible"):
            for i in range(6):
                bx = 460 + i * 115
                dr.rectangle([bx, 330, bx + 100, 520], fill=(236, 92, 60), outline=(150, 50, 30), width=3)
                dr.text((bx + 14, 400), "BLS", font=font(28, bold=True), fill=(255, 245, 230))
    else:
        dr.rectangle([780, 420, 820, 980], fill=(222, 200, 150))  # tape
    # carton label with barcode
    lab = (480, 620, 900, 900)
    dr.rectangle(lab, fill=(250, 250, 248), outline=(80, 80, 80), width=2)
    random.seed(ev["id"])
    bx = 510
    while bx < 870:
        w = random.choice([3, 3, 5, 7])
        dr.rectangle([bx, 650, bx + w, 800], fill=(20, 20, 20))
        bx += w + random.choice([3, 4, 6])
    dr.text((510, 815), "(00) 0 0850017 000012345 7", font=font(20, mono=True), fill=(20, 20, 20))
    dr.text((510, 850), "ASIN B0BLS10021  QTY 12", font=font(20, mono=True), fill=(20, 20, 20))
    if not x.get("barcode_legible"):
        region = img.crop(lab).filter(ImageFilter.GaussianBlur(9))
        img.paste(region, lab[:2])
        dr = ImageDraw.Draw(img)
    dr.rectangle([0, 0, 1600, 70], fill=(30, 32, 38))
    dr.text((24, 18), "PLACEHOLDER: replace with a real photo of an opened carton" if x.get("carton_opened")
            else "PLACEHOLDER: sealed carton (the 'bad evidence' example)", font=font(28, bold=True), fill=(255, 255, 255))
    return img


def edi_856(seed, ev):
    d, po, sh, carrier, asn, inv = ctx_for(seed, ev)
    x = ev["extracted"]
    sent = datetime.fromisoformat(x["sent_at"].replace("Z", ""))
    ymd, hm = sent.strftime("%Y%m%d"), sent.strftime("%H%M")
    seg = [
        f"ISA*00*          *00*          *ZZ*MOCKBRIGHTLEAF *ZZ*MOCKAMAZON     *{sent:%y%m%d}*{hm}*U*00401*000000417*0*T*>~",
        f"GS*SH*MOCKBRIGHTLEAF*MOCKAMAZON*{ymd}*{hm}*417*X*004010~",
        "ST*856*0001~",
        f"BSN*00*SHP{d['id'][-3:]}{ymd}*{ymd}*{hm}*0001~",
        "HL*1**S~",
        f"TD1*CTN25*{asn['carton_count']}****G*{po['quantity'] * 7}*LB~",
        f"TD5**2*{carrier['name'][:4].upper()}*M~",
        f"REF*BM*BOL-{sh['pro_number'][3:]}~",
        f"REF*CN*{sh['pro_number']}~",
        f"DTM*011*{sh['ship_date'].replace('-', '')}~",
        "HL*2*1*O~",
        f"PRF*{x['po_number']}~",
    ]
    hl = 3
    for c in range(asn["carton_count"]):
        seg.append(f"HL*{hl}*2*P~")
        if x.get("carton_ids_present"):
            seg.append(f"MAN*GM*00008500170000{12345 + c:05d}~")
        hl += 1
        seg.append(f"HL*{hl}*{hl - 1}*I~")
        seg.append(f"LIN**UP*850017{1000 + c}*VN*{po['item_sku']}~")
        seg.append(f"SN1**{po['quantity'] // asn['carton_count']}*EA~")
        hl += 1
    seg.append(f"CTT*{asn['carton_count']}~")
    seg.append(f"SE*{len(seg) - 1}*0001~")
    seg += ["GE*1*417~", "IEA*1*000000417~"]
    header = (f"# MOCK EDI 856 (ASN) for demo case {d['id']}. Fictional data.\n"
              f"# Sent {x['sent_at']}  |  Amazon received {asn['received_at']}\n")
    return header + "\n".join(seg) + "\n"


def main():
    seed = json.load(open(os.path.join(ROOT, "data", "seed.json")))
    made = 0
    for ev in seed["evidence"]:
        path = os.path.join(ROOT, ev["storage_path"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        t = ev["doc_type"]
        if t in ("pod", "bol"):
            shipping_doc(seed, ev).save(path, "PDF", resolution=150)
        elif t == "delivery_confirmation":
            delivery_confirmation(seed, ev).save(path, "PDF", resolution=150)
        elif t == "claim":
            claim_doc(seed, ev).save(path, "PDF", resolution=150)
        elif t == "carton_photo":
            carton_photo(seed, ev).save(path, "PNG")
        elif t == "asn_file":
            open(path, "w").write(edi_856(seed, ev))
        made += 1
    print(f"evidence files written: {made}")


if __name__ == "__main__":
    main()
