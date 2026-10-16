"""
Mock data generator for the Dispute Readiness + Claim Alert prototype.

Single source of truth: the CASES list below. Everything else (rule pack,
linked records, evidence files, SQL, CSV, expected results) is derived from it.

All companies, people, addresses, PO numbers and amounts are fictional.
Retailer rules are from public supplier-education sources (see rule pack
`source` fields); anything not sourced is marked verified = false.

Run:  python3 generator/generate.py
"""
import csv
import json
import os
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DATA = os.path.join(ROOT, "data")
OUT_SQL = os.path.join(ROOT, "supabase")
OUT_CSV = os.path.join(ROOT, "data", "csv")

DEMO_DATE = date(2026, 10, 16)  # frozen "today": presentation day


def d(days_from_demo: int) -> date:
    return DEMO_DATE + timedelta(days=days_from_demo)


# ----------------------------------------------------------------------------
# Reference data
# ----------------------------------------------------------------------------
SUPPLIER = {"name": "Brightleaf Snacks Co.", "note": "Fictional supplier used for the demo"}

RETAILERS = [
    {"id": "walmart", "name": "Walmart", "portal": "Retail Link (APDP)"},
    {"id": "amazon", "name": "Amazon", "portal": "Vendor Central"},
]

CARRIERS = [
    # retention_days = how long the carrier keeps signed delivery paperwork (mock values;
    # one source cites ~90 days as typical, so carriers vary around it)
    {"id": "ridgeline", "name": "Ridgeline Freight", "pod_retention_days": 90},
    {"id": "bluewater", "name": "Bluewater Logistics", "pod_retention_days": 120},
    {"id": "summit", "name": "Summit LTL", "pod_retention_days": 60},
]

USERS = [
    {"id": "u_priya", "name": "Priya Shah", "role": "deductions_analyst"},
    {"id": "u_marcus", "name": "Marcus Lee", "role": "ar_manager"},
    {"id": "u_dana", "name": "Dana Ortiz", "role": "logistics"},
    {"id": "u_sam", "name": "Sam Patel", "role": "sales"},
]

SETTINGS = {
    "demo_today": DEMO_DATE.isoformat(),
    "write_off_threshold": 250,      # below this: Low priority, consider writing off
    "high_value_threshold": 2500,    # at or above this: at least High priority
    "critical_days": 7,              # days left <= this: Critical
    "high_days": 30,                 # days left <= this: High
    "cap_score": 40,                 # displayed score when a fatal defect exists
    "band_ready_min": 80,
    "band_needs_work_min": 50,
    "manager_approval_write_off_above": 1000,
}

SRC = {
    "missing_docs": "https://www.spscommerce.com/community/articles/why-deduction-documents-get-rejected-fixes",
    "pod_stamp": "https://help.supplypike.com/en/articles/4993182-example-shipping-documents",
    "amount": "https://www.emagia.com/blog/walmart-deduction-dispute-process-guide/",
    "wmt_docs": "https://help.supplypike.com/en/articles/4988093-recommended-proof-documentation-for-wal-mart-disputing",
    "wmt_window": "https://www.spscommerce.com/community/articles/walmart-apdp-portal-explained-best-practices",
    "wmt_supplier_action": "https://www.spscommerce.com/community/articles/walmarts-apdp-a-clear-guide-to-the-accounts-payable-dispute-portal",
    "wmt_otif": "https://www.spscommerce.com/community/articles/walmart-otif-dispute-process",
    "amz_asn": "https://www.spscommerce.com/community/articles/chargeback-recovery",
    "amz_carton": "https://wiki.amazowl.com/sop/vendor-central/dispute-chargeback-ASN",
    "amz_window": "https://www.amalytix.com/en/glossary/chargebacks/",
    "amz_shortage_window": "https://www.spscommerce.com/community/articles/updated-dispute-timeline-for-1p-amazon-suppliers",
    "amz_shortage_docs": "https://www.channelengine.com/en/blog/disputing-shortage-claims-on-amazon-vendor",
    "pricing": "https://www.spscommerce.com/community/articles/why-deduction-documents-get-rejected-fixes",
    "pod_retention": "https://knowledge.govividly.com/how-to-dispute-and-recover-invalid-deductions",
}

# ----------------------------------------------------------------------------
# Rule pack: templates (8 lines each, always 35/8/8/9/20/5/5/10 = 100)
# ----------------------------------------------------------------------------
def line(n, bucket, label, points, check, fatal=False, fatal_verified=False,
         why="", fix="", owner="analyst", source=None):
    return {"line_no": n, "bucket": bucket, "label": label, "points": points,
            "check_key": check, "fatal": fatal, "fatal_verified": fatal_verified,
            "why": why, "fix": fix, "fix_owner": owner, "source": source}

B1, B2, B3, B4, B5 = "Evidence present", "Evidence content", "Amounts", "Procedural", "History"

TEMPLATES = [
    {
        "id": "shortage_wmt", "name": "Shortage (Walmart)",
        "required_docs": [
            {"doc": "pod", "points": 12, "when_terms": "prepaid"},
            {"doc": "bol", "points": 12, "when_terms": "collect"},
            {"doc": "po", "points": 12},
            {"doc": "invoice", "points": 11},
        ],
        "lines": [
            line(1, B1, "Required documents present", 35, "docs_present", True, True,
                 "A dispute without its required documents is denied.",
                 "Attach the missing document.", "analyst", SRC["missing_docs"]),
            line(2, B2, "PO number matches", 8, "po_matches",
                 why="Every document must point to the PO being disputed.",
                 fix="Get a corrected copy showing the right PO number.", owner="logistics", source=SRC["pod_stamp"]),
            line(3, B2, "Ship-to matches", 8, "shipto_matches",
                 why="The delivery address must match the PO's ship-to location.",
                 fix="Confirm the delivery location with the carrier and get a corrected copy.", owner="logistics", source=SRC["pod_stamp"]),
            line(4, B2, "Stamp or signature present", 9, "proof_signed", True, True,
                 "Walmart treats a POD without a DC stamp or store signature (or a BOL without a carrier signature) as invalid for shortages.",
                 "Request the stamped or signed copy from the carrier using the PRO number.", "logistics", SRC["pod_stamp"]),
            line(5, B3, "Amounts reconcile exactly", 20, "amount_matches", True, True,
                 "A dispute amount that doesn't match its backup is rejected even when the claim is valid.",
                 "Set the dispute amount to the documented shortage, to the cent.", "analyst", SRC["amount"]),
            line(6, B4, "Proof type fits prepaid or collect", 5, "proof_type_fits",
                 why="Prepaid shipments need a POD; collect shipments need a carrier-signed BOL.",
                 fix="Attach the proof type that matches the shipment terms.", owner="logistics", source=SRC["pod_stamp"]),
            line(7, B4, "Deduction settled", 5, "settled",
                 why="Disputing before a deduction settles can produce approvals that are later reversed.",
                 fix="Wait until the deduction shows as posted, then submit.", owner="analyst", source=SRC["missing_docs"]),
            line(8, B5, "Prior denial addressed", 10, "prior_denial_addressed",
                 why="A re-dispute must fix what the last denial said was wrong.",
                 fix="Add the evidence the previous denial asked for.", owner="analyst"),
        ],
    },
    {
        "id": "shortage_amz", "name": "Shortage (Amazon)",
        "required_docs": [
            {"doc": "delivery_confirmation", "points": 18},
            {"doc": "invoice", "points": 17},
        ],
        "lines": [
            line(1, B1, "Required documents present", 35, "docs_present", True, True,
                 "A dispute without its required documents is denied.",
                 "Attach the missing document.", "analyst", SRC["amz_shortage_docs"]),
            line(2, B2, "PO number matches", 8, "po_matches",
                 why="Every document must point to the PO being disputed.",
                 fix="Get a corrected delivery confirmation showing the right PO.", owner="logistics"),
            line(3, B2, "Ship-to matches", 8, "shipto_matches",
                 why="The delivery must be to the fulfillment center on the PO.",
                 fix="Confirm the delivery FC with the carrier.", owner="logistics"),
            line(4, B2, "Delivery confirmed by carrier", 9, "delivery_confirmed", True, False,
                 "Amazon needs proof the shipment reached the fulfillment center.",
                 "Get the carrier's delivery confirmation with tracking.", "logistics", SRC["amz_shortage_docs"]),
            line(5, B3, "Amounts reconcile exactly", 20, "amount_matches", True, True,
                 "A dispute amount that doesn't match its backup is rejected.",
                 "Set the dispute amount to the documented shortage, to the cent.", "analyst", SRC["amount"]),
            line(6, B4, "Related claims grouped", 5, "grouped",
                 why="Claims for the same PO should be disputed together.",
                 fix="Group this claim with the other claims on the same PO.", owner="analyst"),
            line(7, B4, "Dispute summary written", 5, "summary_written",
                 why="Amazon asks for a written explanation of why the claim is wrong.",
                 fix="Write or accept the AI-drafted summary.", owner="analyst", source=SRC["amz_asn"]),
            line(8, B5, "Prior denial addressed", 10, "prior_denial_addressed",
                 why="A re-dispute must fix what the last denial said was wrong.",
                 fix="Add the evidence the previous denial asked for.", owner="analyst"),
        ],
    },
    {
        "id": "pricing_wmt", "name": "Pricing (Walmart)",
        "required_docs": [
            {"doc": "invoice", "points": 12},
            {"doc": "claim", "points": 12},
            {"doc": "po", "points": 11},
        ],
        "lines": [
            line(1, B1, "Required documents present", 35, "docs_present", True, True,
                 "Pricing disputes need the invoice, the claim and the PO.",
                 "Download the claim from APDP/APIS and attach it.", "analyst", SRC["wmt_docs"]),
            line(2, B2, "PO number matches", 8, "po_matches",
                 why="The claim and invoice must reference the PO being disputed.",
                 fix="Check the claim's PO reference; correct the dispute if it was filed against the wrong PO.", owner="analyst"),
            line(3, B2, "Item number matches PO", 8, "item_matches",
                 why="An item mismatch suggests a substitution, which is a different code.",
                 fix="Confirm the item shipped; if substituted, this may be Code 13, not 11.", owner="sales"),
            line(4, B2, "Invoice price matches PO price", 9, "price_matches", True, True,
                 "If you invoiced above the PO price, Walmart's deduction is probably valid.",
                 "Review with sales. If the PO price was right, accept and write off; fix the price file.", "sales", SRC["pricing"]),
            line(5, B3, "Amounts reconcile exactly", 20, "amount_matches", True, True,
                 "A dispute amount that doesn't match its backup is rejected.",
                 "Set the dispute amount to the documented difference.", "analyst", SRC["amount"]),
            line(6, B4, "Deduction settled", 5, "settled",
                 why="Disputing before a deduction settles can produce reversed approvals.",
                 fix="Wait until the deduction shows as posted.", owner="analyst"),
            line(7, B4, "Dispute summary written", 5, "summary_written",
                 why="An explanation helps the reviewer see the price agreement.",
                 fix="Write or accept the AI-drafted summary.", owner="analyst"),
            line(8, B5, "Prior denial addressed", 10, "prior_denial_addressed",
                 why="A re-dispute must fix what the last denial said was wrong.",
                 fix="Add the evidence the previous denial asked for.", owner="analyst"),
        ],
    },
    {
        "id": "asn_amz", "name": "ASN compliance (Amazon)",
        "required_docs": [{"doc": "asn_file", "points": 35}],
        "lines": [
            line(1, B1, "Required documents present", 35, "docs_present", True, True,
                 "Amazon needs the ASN screenshot or EDI 856 file.",
                 "Export the EDI 856 (text or XML) or screenshot it in Vendor Central.", "analyst", SRC["amz_asn"]),
            line(2, B2, "PO number matches", 8, "po_matches",
                 why="The ASN must reference the PO on the chargeback.",
                 fix="Attach the ASN for the correct PO.", owner="analyst"),
            line(3, B2, "Carton IDs present (SSCC or AMZNCC)", 8, "carton_ids_present",
                 why="Amazon checks that the ASN carried carton-level barcode data.",
                 fix="Show where the ASN contained the SSCC or AMZNCC values.", owner="logistics", source=SRC["amz_carton"]),
            line(4, B2, "ASN sent before receipt", 9, "sent_before_receipt", True, True,
                 "The ASN must have been sent before Amazon received the shipment.",
                 "If it was sent late, the chargeback is probably valid; accept it and fix the ASN timing.", "logistics", SRC["amz_asn"]),
            line(5, B3, "Amounts reconcile exactly", 20, "amount_matches", True, True,
                 "The disputed amount must equal the chargeback amount.",
                 "Set the dispute amount to the chargeback amount.", "analyst"),
            line(6, B4, "Related chargebacks grouped", 5, "grouped",
                 why="Chargebacks for the same ASIN or PO can be disputed together.",
                 fix="Select the related chargebacks in the same dispute.", owner="analyst", source=SRC["amz_asn"]),
            line(7, B4, "Dispute summary written", 5, "summary_written",
                 why="Amazon asks for a written explanation in the dispute summary.",
                 fix="Write or accept the AI-drafted summary.", owner="analyst", source=SRC["amz_asn"]),
            line(8, B5, "Prior denial addressed", 10, "prior_denial_addressed",
                 why="Amazon allows only two disputes; the second must add new evidence.",
                 fix="Add the evidence the previous denial asked for.", owner="analyst", source=SRC["amz_window"]),
        ],
    },
    {
        "id": "carton_amz", "name": "Carton and label (Amazon)",
        "required_docs": [{"doc": "carton_photo", "points": 35}],
        "lines": [
            line(1, B1, "Required documents present", 35, "docs_present", True, True,
                 "Amazon needs photos of the carton contents.",
                 "Photograph an opened carton from the same shipment.", "warehouse", SRC["amz_carton"]),
            line(2, B2, "Carton visibly opened", 8, "carton_opened", True, False,
                 "Amazon asks for a face-open carton; a sealed box shows nothing.",
                 "Retake the photo with the carton opened.", "warehouse", SRC["amz_carton"]),
            line(3, B2, "Barcodes legible, match the ASIN", 8, "barcode_legible",
                 why="Barcodes must be readable to prove the labeling was right.",
                 fix="Retake the photo closer, with the barcode in focus.", owner="warehouse", source=SRC["amz_asn"]),
            line(4, B2, "Inner packs and units visible", 9, "units_visible", True, True,
                 "Amazon asks for images showing inner packs and individual sellable units.",
                 "Retake the photo showing inner packs and units.", "warehouse", SRC["amz_carton"]),
            line(5, B3, "Amounts reconcile exactly", 20, "amount_matches", True, True,
                 "The disputed amount must equal the chargeback amount.",
                 "Set the dispute amount to the chargeback amount.", "analyst"),
            line(6, B4, "Related chargebacks grouped", 5, "grouped",
                 why="Chargebacks for the same ASIN or PO can be disputed together.",
                 fix="Select the related chargebacks in the same dispute.", owner="analyst"),
            line(7, B4, "Dispute summary written", 5, "summary_written",
                 why="Amazon asks for a written explanation in the dispute summary.",
                 fix="Write or accept the AI-drafted summary.", owner="analyst"),
            line(8, B5, "Prior denial addressed", 10, "prior_denial_addressed",
                 why="Amazon allows only two disputes; the second must add new evidence.",
                 fix="Add the evidence the previous denial asked for.", owner="analyst", source=SRC["amz_window"]),
        ],
    },
]

for t in TEMPLATES:
    assert sum(l["points"] for l in t["lines"]) == 100, t["id"]
    assert [l["points"] for l in t["lines"]] == [35, 8, 8, 9, 20, 5, 5, 10], t["id"]

CODE_MAPPINGS = [
    # routed=True: dispute goes to a different channel, not scored here
    # template_id=None and routed=False: generic fallback, human review
    {"id": "WMT-22", "retailer_id": "walmart", "code": "22", "code_name": "Merchandise billed, not shipped",
     "category": "Short shipment", "template_id": "shortage_wmt", "channel": "APDP (Retail Link)",
     "window_days": 730, "window_verified": True, "attempt_limit": None,
     "attempt_note": "No hard limit; win rates drop after 5 attempts",
     "response_days": 7, "routed": False, "source": SRC["wmt_window"]},
    {"id": "WMT-24", "retailer_id": "walmart", "code": "24", "code_name": "Carton shortage, freight bill signed short",
     "category": "Short shipment", "template_id": "shortage_wmt", "channel": "APDP (Retail Link)",
     "window_days": 730, "window_verified": True, "attempt_limit": None,
     "attempt_note": "No hard limit; win rates drop after 5 attempts",
     "response_days": 7, "routed": False, "source": SRC["wmt_window"]},
    {"id": "WMT-25", "retailer_id": "walmart", "code": "25", "code_name": "No merchandise received for invoice",
     "category": "Nothing received", "template_id": "shortage_wmt", "channel": "APDP (Retail Link)",
     "window_days": 730, "window_verified": True, "attempt_limit": None,
     "attempt_note": "No hard limit; win rates drop after 5 attempts",
     "response_days": 7, "routed": False, "source": SRC["wmt_window"]},
    {"id": "WMT-11", "retailer_id": "walmart", "code": "11", "code_name": "Pricing overcharge",
     "category": "Price mismatch", "template_id": "pricing_wmt", "channel": "APDP (Retail Link)",
     "window_days": 730, "window_verified": True, "attempt_limit": None,
     "attempt_note": "No hard limit; win rates drop after 5 attempts",
     "response_days": 7, "routed": False, "source": SRC["wmt_window"]},
    {"id": "WMT-87", "retailer_id": "walmart", "code": "87", "code_name": "Other",
     "category": "Unclassified", "template_id": None, "channel": "APDP (Retail Link)",
     "window_days": 730, "window_verified": True, "attempt_limit": None, "attempt_note": None,
     "response_days": 7, "routed": False, "source": SRC["wmt_window"]},
    {"id": "WMT-OTIF", "retailer_id": "walmart", "code": "OTIF", "code_name": "On-time in-full fine",
     "category": "Delivery compliance", "template_id": None, "channel": "HighRadius portal or Walmart buyer",
     "window_days": 30, "window_verified": False, "attempt_limit": None,
     "attempt_note": "Sources conflict on the OTIF window",
     "response_days": None, "routed": True, "source": SRC["wmt_otif"]},
    {"id": "AMZ-ASN", "retailer_id": "amazon", "code": "ASN Accuracy", "code_name": "ASN accuracy chargeback",
     "category": "ASN compliance", "template_id": "asn_amz", "channel": "Vendor Central",
     "window_days": 30, "window_verified": True, "attempt_limit": 2, "attempt_note": "Two disputes, then final",
     "response_days": None, "routed": False, "source": SRC["amz_window"]},
    {"id": "AMZ-CARTON", "retailer_id": "amazon", "code": "Carton Content Accuracy", "code_name": "Carton content accuracy chargeback",
     "category": "Carton and label", "template_id": "carton_amz", "channel": "Vendor Central",
     "window_days": 30, "window_verified": True, "attempt_limit": 2, "attempt_note": "Two disputes, then final",
     "response_days": None, "routed": False, "source": SRC["amz_window"]},
    {"id": "AMZ-PQV", "retailer_id": "amazon", "code": "PQV", "code_name": "Shortage claim (purchase quantity variance)",
     "category": "Short shipment", "template_id": "shortage_amz", "channel": "Vendor Central",
     "window_days": 730, "window_verified": False, "attempt_limit": None,
     "attempt_note": "Sources conflict: 2 years (SPS, 2025) vs 30 days (ChannelEngine)",
     "response_days": None, "routed": False, "source": SRC["amz_shortage_window"]},
    {"id": "AMZ-OTHER", "retailer_id": "amazon", "code": "Prep: Overweight Carton", "code_name": "Unmapped chargeback type",
     "category": "Unclassified", "template_id": None, "channel": "Vendor Central",
     "window_days": 30, "window_verified": False, "attempt_limit": 2, "attempt_note": "Assumed same as other chargebacks",
     "response_days": None, "routed": False, "source": SRC["amz_window"]},
]

# ----------------------------------------------------------------------------
# The 40 cases. Each one is designed to hit a specific use case.
# Flags default to "everything is fine"; each case overrides what it tests.
#   days_target: days from demo date to the clock we want to drive
#   clock: which clock days_target sets: 'filing' | 'evidence' | 'response' | None
# expected: what the scoring module must produce (verified by test/run-tests.ts)
# ----------------------------------------------------------------------------
DEFAULTS = dict(
    terms="prepaid", carrier="ridgeline", amount=1000.00, dispute_amount=None,
    settled=True, grouped=True, summary=True, attempts_used=0, status="open",
    docs_missing=[],            # doc types to leave out
    pod={"po_ok": True, "shipto_ok": True, "signed": True, "legible": True, "delivered": True},
    pricing={"item_ok": True, "price_ok": True, "claim_po_ok": True},
    asn={"sent_before": True, "carton_ids": True, "file_po_ok": True},
    photo={"opened": True, "units": True, "barcode": True},
    prior_denial_check=None, prior_denial_text=None, prior_denials=0,
    hero=None, clock=None, days_target=None, issued_days=None,
)

def case(cid, mapping, title, expected, **kw):
    c = json.loads(json.dumps(DEFAULTS))
    for k, v in kw.items():
        if isinstance(v, dict) and k in c and isinstance(c[k], dict):
            c[k].update(v)
        else:
            c[k] = v
    c.update(id=cid, mapping=mapping, title=title, expected=expected)
    return c

E = lambda state, raw=None, shown=None, band=None, prio=None, days=None, rec=None: dict(
    state=state, raw=raw, display=shown, band=band, priority=prio, days_left=days, recommendation=rec)

CASES = [
    # ---------------- Walmart ----------------
    case("WMT-001", "WMT-22", "HERO 1: unstamped POD, evidence expiring in 6 days",
         E("scored", 91, 40, "Weak", "Critical", 6, "fix_then_submit"),
         amount=4800.00, pod={"signed": False}, clock="evidence", days_target=6, hero=1),
    case("WMT-002", "WMT-22", "Clean prepaid shortage, everything in order",
         E("scored", 100, 100, "Ready", "Normal", None, "submit"),
         amount=1250.00, issued_days=-26),
    case("WMT-003", "WMT-22", "POD shows wrong PO number (non-fatal)",
         E("scored", 92, 92, "Ready", "Normal", 60, "submit"),
         amount=640.00, pod={"po_ok": False}, clock="evidence", days_target=60),
    case("WMT-004", "WMT-22", "Collect shipment but only a POD attached; BOL missing",
         E("scored", 74, 40, "Weak", "High", 12, "fix_then_submit"),
         amount=2900.00, terms="collect", carrier="summit", docs_missing=["bol"], attach_pod_anyway=True,
         clock="evidence", days_target=12),
    case("WMT-005", "WMT-22", "PO and ship-to mismatched, not settled: lands on 79",
         E("scored", 79, 79, "Needs work", "Normal", 50, "fix_then_submit"),
         amount=980.00, pod={"po_ok": False, "shipto_ok": False}, settled=False, clock="evidence", days_target=50),
    case("WMT-006", "WMT-22", "Re-dispute: last denied for missing stamp, now stamped",
         E("scored", 100, 100, "Ready", "High", None, "submit"),
         amount=3400.00, attempts_used=1, prior_denials=1, prior_denial_check="proof_signed",
         prior_denial_text="POD not stamped by DC", issued_days=-75),
    case("WMT-007", "WMT-22", "Re-dispute: denied for missing stamp, still missing; 3 days",
         E("scored", 81, 40, "Weak", "Critical", 3, "fix_then_submit"),
         amount=1560.00, pod={"signed": False}, attempts_used=1, prior_denials=1, prior_denial_check="proof_signed",
         prior_denial_text="POD not stamped by DC", clock="evidence", days_target=3),
    case("WMT-008", "WMT-24", "Signed-short claim with good stamped POD",
         E("scored", 100, 100, "Ready", "Normal", None, "submit"),
         amount=410.00, issued_days=-20),
    case("WMT-009", "WMT-24", "Blurry, illegible POD scan",
         E("scored", 75, 40, "Weak", "High", 25, "fix_then_submit"),
         amount=1140.00, pod={"legible": False}, clock="evidence", days_target=25),
    case("WMT-010", "WMT-24", "Collect: signed BOL, but PO and ship-to wrong, not settled",
         E("scored", 79, 79, "Needs work", "Normal", 45, "fix_then_submit"),
         amount=1875.00, terms="collect", carrier="bluewater", pod={"po_ok": False, "shipto_ok": False},
         settled=False, clock="evidence", days_target=45),
    case("WMT-011", "WMT-25", "Nothing received claim, no POD at all, exactly 7 days",
         E("scored", 66, 40, "Weak", "Critical", 7, "fix_then_submit"),
         amount=6200.00, docs_missing=["pod"], clock="evidence", days_target=7),
    case("WMT-012", "WMT-25", "Nothing received claim, good POD, high value",
         E("scored", 100, 100, "Ready", "High", None, "submit"),
         amount=5400.00, issued_days=-40),
    case("WMT-013", "WMT-22", "Dispute amount a few cents off",
         E("scored", 80, 40, "Weak", "Normal", None, "fix_then_submit"),
         amount=2310.04, dispute_amount=2310.40, issued_days=-33),
    case("WMT-014", "WMT-22", "Boundary: 8 days left (not Critical), needs work",
         E("scored", 79, 79, "Needs work", "High", 8, "fix_then_submit"),
         amount=1330.00, pod={"po_ok": False, "shipto_ok": False}, settled=False, clock="evidence", days_target=8),
    case("WMT-015", "WMT-22", "Boundary: exactly 30 days; re-dispute, prior PO issue not fixed",
         E("scored", 82, 82, "Ready", "High", 30, "fix_then_submit"),
         amount=870.00, pod={"po_ok": False}, attempts_used=1, prior_denials=1, prior_denial_check="po_matches",
         prior_denial_text="PO number on POD does not match claim", clock="evidence", days_target=30),
    case("WMT-016", "WMT-22", "Boundary: 31 days (not High)",
         E("scored", 87, 87, "Ready", "Normal", 31, "submit"),
         amount=720.00, pod={"shipto_ok": False}, settled=False, clock="evidence", days_target=31),
    case("WMT-017", "WMT-11", "HERO 3: invoiced above PO price; deduction is valid",
         E("scored", 91, 40, "Weak", "Low", None, "accept_write_off"),
         amount=112.00, pricing={"price_ok": False}, issued_days=-18, hero=3),
    case("WMT-018", "WMT-11", "Pricing: item and claim PO mismatched, no summary, not settled",
         E("scored", 74, 74, "Needs work", "Normal", None, "fix_then_submit"),
         amount=860.00, pricing={"item_ok": False, "claim_po_ok": False}, summary=False, settled=False, issued_days=-12),
    case("WMT-019", "WMT-11", "Pricing: claim document missing",
         E("scored", 80, 40, "Weak", "Normal", None, "fix_then_submit"),
         amount=1320.00, docs_missing=["claim"], issued_days=-21),
    case("WMT-020", "WMT-22", "Tiny deduction, perfect evidence, below write-off threshold",
         E("scored", 100, 100, "Ready", "Low", None, "submit"),
         amount=84.00, issued_days=-9),
    case("WMT-021", "WMT-22", "Walmart asked for more info; 7-day response clock, 2 days left",
         E("scored", 100, 100, "Ready", "Critical", 2, "submit"),
         amount=1100.00, status="supplier_action", attempts_used=1, prior_denials=0,
         clock="response", days_target=2, issued_days=-60),
    case("WMT-022", "WMT-22", "Filing window closed (issued over two years ago)",
         E("expired", prio=None, rec="log_loss"),
         amount=1490.00, issued_days=-746),
    case("WMT-023", "WMT-87", "Code 87 'Other': no template, needs human review",
         E("human_review", prio="Normal", rec="human_review"),
         amount=450.00, issued_days=-15),
    case("WMT-024", "WMT-OTIF", "OTIF fine: routed to HighRadius or buyer",
         E("routed", prio="High", days=16, rec="route"),
         amount=3150.00, clock="filing", days_target=16),

    # ---------------- Amazon ----------------
    case("AMZ-001", "AMZ-ASN", "HERO 2: ASN sent on time, 5 days left, ready in one click",
         E("scored", 100, 100, "Ready", "Critical", 5, "submit"),
         amount=1450.00, clock="filing", days_target=5, hero=2),
    case("AMZ-002", "AMZ-ASN", "ASN sent after receipt: chargeback probably valid",
         E("scored", 91, 40, "Weak", "High", 15, "accept_write_off"),
         amount=2050.00, asn={"sent_before": False}, clock="filing", days_target=15),
    case("AMZ-003", "AMZ-ASN", "Carton IDs missing from ASN (non-fatal)",
         E("scored", 92, 92, "Ready", "High", 24, "submit"),
         amount=880.00, asn={"carton_ids": False}, clock="filing", days_target=24),
    case("AMZ-004", "AMZ-ASN", "No ASN file attached; 1 day left",
         E("scored", 57, 40, "Weak", "Critical", 1, "fix_then_submit"),
         amount=1720.00, docs_missing=["asn_file"], clock="filing", days_target=1),
    case("AMZ-005", "AMZ-ASN", "30-day window passed",
         E("expired", prio=None, rec="log_loss"),
         amount=930.00, clock="filing", days_target=-6),
    case("AMZ-006", "AMZ-ASN", "Disputed and denied twice: final",
         E("final", prio=None, rec="escalate_or_close"),
         amount=1210.00, attempts_used=2, prior_denials=2, prior_denial_check="sent_before_receipt",
         prior_denial_text="ASN received after shipment arrival", clock="filing", days_target=19),
    case("AMZ-007", "AMZ-CARTON", "Good opened-carton photos",
         E("scored", 100, 100, "Ready", "High", 20, "submit"),
         amount=640.00, clock="filing", days_target=20),
    case("AMZ-008", "AMZ-CARTON", "Sealed-carton photo, re-dispute: last attempt left",
         E("scored", 73, 40, "Weak", "High", 8, "fix_then_submit"),
         amount=1980.00, photo={"opened": False, "units": False}, attempts_used=1, prior_denials=1,
         prior_denial_check="carton_opened", prior_denial_text="Photo does not show carton contents",
         clock="filing", days_target=8),
    case("AMZ-009", "AMZ-CARTON", "Re-dispute: barcode still unreadable, not grouped",
         E("scored", 77, 77, "Needs work", "High", 26, "fix_then_submit"),
         amount=920.00, photo={"barcode": False}, grouped=False, attempts_used=1, prior_denials=1,
         prior_denial_check="barcode_legible", prior_denial_text="Barcode not legible in photo",
         clock="filing", days_target=26),
    case("AMZ-010", "AMZ-CARTON", "No photos at all; 3 days left",
         E("scored", 40, 40, "Weak", "Critical", 3, "fix_then_submit"),
         amount=1260.00, docs_missing=["carton_photo"], clock="filing", days_target=3),
    case("AMZ-011", "AMZ-CARTON", "Re-dispute: new photo now shows units",
         E("scored", 100, 100, "Ready", "High", 12, "submit"),
         amount=2300.00, attempts_used=1, prior_denials=1, prior_denial_check="units_visible",
         prior_denial_text="Inner packs and units not visible", clock="filing", days_target=12),
    case("AMZ-012", "AMZ-PQV", "Shortage claim with full delivery confirmation",
         E("scored", 100, 100, "Ready", "High", None, "submit"),
         amount=2640.00, carrier="bluewater", issued_days=-31),
    case("AMZ-013", "AMZ-PQV", "Shortage: long window, but carrier proof expires in 7 days",
         E("scored", 65, 40, "Weak", "Critical", 7, "fix_then_submit"),
         amount=780.00, carrier="bluewater", docs_missing=["delivery_confirmation"], clock="evidence", days_target=7),
    case("AMZ-014", "AMZ-PQV", "Small shortage: PO and FC mismatch, not grouped, no summary",
         E("scored", 74, 74, "Needs work", "Low", 70, "fix_then_submit"),
         amount=190.00, pod={"po_ok": False, "shipto_ok": False}, grouped=False, summary=False,
         clock="evidence", days_target=70),
    case("AMZ-015", "AMZ-PQV", "Carrier confirmation shows short delivery: claim is valid",
         E("scored", 91, 40, "Weak", "Normal", None, "accept_write_off"),
         amount=330.00, pod={"delivered": False}, issued_days=-14),
    case("AMZ-016", "AMZ-OTHER", "Unmapped chargeback type: human review",
         E("human_review", prio="High", days=22, rec="human_review"),
         amount=270.00, clock="filing", days_target=22),
]
assert len(CASES) == 40 and len({c["id"] for c in CASES}) == 40

MAP = {m["id"]: m for m in CODE_MAPPINGS}
TPL = {t["id"]: t for t in TEMPLATES}
CARR = {c["id"]: c for c in CARRIERS}

ITEMS = [
    ("BLS-1001", "Sea Salt Kettle Chips 8oz, case of 12", 21.60),
    ("BLS-1002", "Rosemary Crackers 6oz, case of 12", 26.40),
    ("BLS-1003", "Trail Mix Pouches 10ct, case of 6", 33.00),
    ("BLS-1004", "Dark Chocolate Pretzels 7oz, case of 12", 30.00),
]
WMT_DCS = ["Walmart DC 6012, Searcy, AR", "Walmart DC 6094, Bentonville, AR", "Walmart DC 7034, Smyrna, DE"]
AMZ_FCS = ["Amazon FC TPA4, Tracy, CA", "Amazon FC RDU9, Garner, NC"]


def money(x):
    return round(float(x) + 1e-9, 2)


# ----------------------------------------------------------------------------
# Derive linked records from each case
# ----------------------------------------------------------------------------
def build():
    po_rows, inv_rows, ship_rows, asn_rows, ded_rows = [], [], [], [], []
    ev_rows, hist_rows, audit_rows, expected_rows = [], [], [], []

    for i, c in enumerate(CASES):
        m = MAP[c["mapping"]]
        retailer = m["retailer_id"]
        carrier = CARR[c["carrier"]]
        item_sku, item_name, base_price = ITEMS[i % len(ITEMS)]
        ship_to = (WMT_DCS if retailer == "walmart" else AMZ_FCS)[i % (3 if retailer == "walmart" else 2)]
        po_number = (f"45{1700000 + i * 37:07d}" if retailer == "walmart" else f"8K{3200 + i * 11}QX")
        inv_number = f"BLS-INV-{26000 + i * 7}"

        amount = money(c["amount"])
        dispute_amount = money(c["dispute_amount"]) if c["dispute_amount"] is not None else amount

        # ---- dates, chosen so the targeted clock lands exactly ----
        window = m["window_days"]
        if c["clock"] == "filing":
            issued = d(c["days_target"] - window)
        elif c["issued_days"] is not None:
            issued = d(c["issued_days"])
        else:
            issued = d(-20)
        if c["clock"] == "evidence":
            delivered = d(c["days_target"] - carrier["pod_retention_days"])
        else:
            delivered = min(issued - timedelta(days=21), d(-40))
        shipped = delivered - timedelta(days=3)
        ordered = shipped - timedelta(days=9)
        if issued < delivered:  # deduction can't predate delivery in real life
            issued = delivered + timedelta(days=24) if c["clock"] != "filing" else issued
        response_due = d(c["days_target"]) if c["clock"] == "response" else None
        returned_on = response_due - timedelta(days=7) if response_due else None

        qty = 40 + (i * 7) % 60
        unit_price = base_price
        inv_unit_price = unit_price
        inv_sku = item_sku
        if m["template_id"] == "pricing_wmt":
            if not c["pricing"]["price_ok"]:
                inv_unit_price = money(unit_price + amount / qty)  # invoiced above PO price
            if not c["pricing"]["item_ok"]:
                inv_sku = ITEMS[(i + 1) % len(ITEMS)][0]

        po_rows.append(dict(po_number=po_number, retailer_id=retailer, ship_to=ship_to,
                            item_sku=item_sku, item_description=item_name, quantity=qty,
                            unit_price=unit_price, order_date=ordered.isoformat()))
        inv_rows.append(dict(invoice_number=inv_number, po_number=po_number, item_sku=inv_sku,
                             quantity=qty, unit_price=inv_unit_price,
                             total=money(qty * inv_unit_price), invoice_date=shipped.isoformat()))
        pro = f"PRO{48213 + i * 97}" if i else "PRO48213"
        ship_rows.append(dict(id=f"SHP-{c['id']}", po_number=po_number, terms=c["terms"],
                              carrier_id=carrier["id"], pro_number=pro, ship_date=shipped.isoformat(),
                              delivery_date=delivered.isoformat()))
        received_at = datetime.combine(delivered, datetime.min.time()) + timedelta(hours=9)
        sent_at = received_at - timedelta(hours=30) if c["asn"]["sent_before"] else received_at + timedelta(hours=5)
        asn_rows.append(dict(id=f"ASN-{c['id']}", po_number=po_number, sent_at=sent_at.isoformat() + "Z",
                             received_at=received_at.isoformat() + "Z",
                             carton_count=6 + i % 5, carton_ids_present=c["asn"]["carton_ids"]))

        summary_text = ("Shipment delivered in full; signed delivery receipt and invoice attached."
                        if c["summary"] else None)
        ded_rows.append(dict(
            id=c["id"], retailer_id=retailer, code_mapping_id=m["id"], raw_code=m["code"],
            title=c["title"], po_number=po_number, invoice_number=inv_number,
            amount=amount, dispute_amount=dispute_amount, issued_date=issued.isoformat(),
            settled=c["settled"], grouped=c["grouped"], dispute_summary=summary_text,
            attempts_used=c["attempts_used"], status=c["status"],
            returned_on=returned_on.isoformat() if returned_on else None,
            response_due=response_due.isoformat() if response_due else None,
            assigned_to="u_priya", hero=c["hero"]))

        # ---- evidence files ----
        t = TPL.get(m["template_id"]) if m["template_id"] else None
        missing = set(c["docs_missing"])
        pod = c["pod"]

        def add_ev(doc, extracted, variant):
            ev_rows.append(dict(id=f"EV-{c['id']}-{doc}", deduction_id=c["id"], doc_type=doc,
                                storage_path=f"evidence/{c['id']}/{doc}.{'txt' if doc == 'asn_file' else 'png' if doc == 'carton_photo' else 'pdf'}",
                                variant=variant, extracted=extracted,
                                extraction_note="Pre-computed for the demo; shown as 'AI-read, please verify'"))

        if t and t["id"] == "shortage_wmt":
            proof_doc = "pod" if c["terms"] == "prepaid" else "bol"
            docs_to_attach = [proof_doc]
            if c.get("attach_pod_anyway"):
                docs_to_attach.append("pod")
            for doc in docs_to_attach:
                if doc in missing:
                    continue
                legible = pod["legible"]
                add_ev(doc, {
                    "po_number": (po_number if pod["po_ok"] else po_number[:-2] + "99") if legible else None,
                    "ship_to": (ship_to if pod["shipto_ok"] else WMT_DCS[(i + 1) % 3]) if legible else None,
                    "stamp_or_signature": (pod["signed"] if legible else None),
                    "delivery_date": delivered.isoformat() if legible else None,
                    "pro_number": pro if legible else None,
                    "legible": legible,
                }, variant=("illegible" if not legible else "unsigned" if not pod["signed"]
                            else "wrong_po" if not pod["po_ok"] else "wrong_shipto" if not pod["shipto_ok"] else "good"))
        if t and t["id"] == "shortage_amz" and "delivery_confirmation" not in missing:
            add_ev("delivery_confirmation", {
                "po_number": po_number if pod["po_ok"] else po_number[:-1] + "Z",
                "ship_to": ship_to if pod["shipto_ok"] else AMZ_FCS[(i + 1) % 2],
                "delivered": pod["delivered"],
                "cartons_delivered": None if pod["delivered"] else f"{6 + i % 5 - 2} of {6 + i % 5}",
                "tracking": pro, "legible": True,
            }, variant="good" if pod["delivered"] and pod["po_ok"] else "short_delivery" if not pod["delivered"] else "mismatch")
        if t and t["id"] == "pricing_wmt" and "claim" not in missing:
            add_ev("claim", {
                "claim_number": f"CLM-{900000 + i * 13}",
                "po_number": po_number if c["pricing"]["claim_po_ok"] else po_number[:-2] + "11",
                "amount": amount, "legible": True,
            }, variant="good" if c["pricing"]["claim_po_ok"] else "wrong_po")
        if t and t["id"] == "asn_amz" and "asn_file" not in missing:
            add_ev("asn_file", {
                "po_number": po_number if c["asn"]["file_po_ok"] else po_number[:-1] + "Z",
                "sent_at": sent_at.isoformat() + "Z", "carton_ids_present": c["asn"]["carton_ids"],
                "legible": True,
            }, variant="on_time" if c["asn"]["sent_before"] else "late")
        if t and t["id"] == "carton_amz" and "carton_photo" not in missing:
            ph = c["photo"]
            add_ev("carton_photo", {
                "carton_opened": ph["opened"], "units_visible": ph["units"],
                "barcode_legible": ph["barcode"], "legible": True,
            }, variant="sealed" if not ph["opened"] else "barcode_blurry" if not ph["barcode"] else "opened")

        # ---- dispute history ----
        for k in range(c["prior_denials"]):
            hist_rows.append(dict(id=f"H-{c['id']}-{k + 1}", deduction_id=c["id"], attempt_no=k + 1,
                                  submitted_on=(issued + timedelta(days=5 + 10 * k)).isoformat(),
                                  outcome="denied", denial_reason=c["prior_denial_text"],
                                  denial_check_key=c["prior_denial_check"]))
        if c["status"] == "supplier_action":
            hist_rows.append(dict(id=f"H-{c['id']}-1", deduction_id=c["id"], attempt_no=1,
                                  submitted_on=(returned_on - timedelta(days=12)).isoformat(),
                                  outcome="returned_for_info",
                                  denial_reason="Walmart requested the delivery receipt for store 2241 split",
                                  denial_check_key=None))

        audit_rows.append(dict(id=f"A-{c['id']}-1", deduction_id=c["id"], actor="system",
                               action="imported", note=f"Imported from {m['channel']}",
                               at=datetime.combine(min(issued + timedelta(days=1), DEMO_DATE), datetime.min.time()).isoformat()))
        expected_rows.append(dict(id=c["id"], title=c["title"], **c["expected"]))

    return dict(po=po_rows, inv=inv_rows, ship=ship_rows, asn=asn_rows, ded=ded_rows,
                ev=ev_rows, hist=hist_rows, audit=audit_rows, expected=expected_rows)


OUTCOMES_ARCHIVE = [
    # closed disputes from earlier in the year, used only by the Insights tab
    ("walmart", "22", 2140.00, "won", None, "2026-03-02"),
    ("walmart", "22", 880.00, "denied", "POD not stamped by DC", "2026-03-19"),
    ("walmart", "22", 1310.00, "denied", "POD not stamped by DC", "2026-04-07"),
    ("walmart", "24", 460.00, "won", None, "2026-04-22"),
    ("walmart", "25", 5120.00, "won", None, "2026-05-11"),
    ("walmart", "11", 230.00, "written_off", "Invoice price above PO price", "2026-05-30"),
    ("walmart", "22", 990.00, "denied", "Dispute amount did not match backup", "2026-06-14"),
    ("amazon", "ASN Accuracy", 1540.00, "won", None, "2026-06-28"),
    ("amazon", "Carton Content Accuracy", 760.00, "denied", "Photo does not show carton contents", "2026-07-15"),
    ("amazon", "Carton Content Accuracy", 1180.00, "won", None, "2026-08-03"),
    ("amazon", "PQV", 2210.00, "won", None, "2026-08-21"),
    ("walmart", "22", 1675.00, "expired", "Filed after carrier purged the POD", "2026-09-09"),
]


# ----------------------------------------------------------------------------
# Writers
# ----------------------------------------------------------------------------
def sql_val(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, rows, cols=None):
    if not rows:
        return ""
    cols = cols or list(rows[0].keys())
    lines = [f"insert into {table} ({', '.join(cols)}) values"]
    vals = [f"  ({', '.join(sql_val(r.get(c)) for c in cols)})" for r in rows]
    return "\n".join(lines) + "\n" + ",\n".join(vals) + ";\n\n"


def write_csv(name, rows):
    if not rows:
        return
    with open(os.path.join(OUT_CSV, f"{name}.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in r.items()})


def main():
    os.makedirs(OUT_DATA, exist_ok=True)
    os.makedirs(OUT_SQL, exist_ok=True)
    os.makedirs(OUT_CSV, exist_ok=True)
    b = build()

    template_rows = [dict(id=t["id"], name=t["name"], required_docs=t["required_docs"]) for t in TEMPLATES]
    line_rows = [dict(id=f"{t['id']}-{l['line_no']}", template_id=t["id"], **l) for t in TEMPLATES for l in t["lines"]]
    mapping_rows = [dict(m) for m in CODE_MAPPINGS]
    settings_rows = [dict(key=k, value=v) for k, v in SETTINGS.items()]
    archive_rows = [dict(id=f"OUT-{n + 1:02d}", retailer_id=r, raw_code=code, amount=a, outcome=o,
                         denial_reason=why, closed_on=dt) for n, (r, code, a, o, why, dt) in enumerate(OUTCOMES_ARCHIVE)]

    bundle = dict(
        demo_today=DEMO_DATE.isoformat(), supplier=SUPPLIER, settings=SETTINGS,
        retailers=RETAILERS, carriers=CARRIERS, users=USERS,
        templates=template_rows, template_lines=line_rows, code_mappings=mapping_rows,
        purchase_orders=b["po"], invoices=b["inv"], shipments=b["ship"], asns=b["asn"],
        deductions=b["ded"], evidence=b["ev"], dispute_history=b["hist"],
        outcomes_archive=archive_rows, audit_log=b["audit"],
    )
    with open(os.path.join(OUT_DATA, "seed.json"), "w") as f:
        json.dump(bundle, f, indent=2)
    with open(os.path.join(ROOT, "test", "expected.json"), "w") as f:
        json.dump(b["expected"], f, indent=2)
    # human-readable catalog of every case and what it should show in the demo
    with open(os.path.join(OUT_DATA, "case-catalog.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "retailer", "code", "title", "amount", "expected_state", "raw", "display",
                    "band", "priority", "days_left", "recommendation", "hero"])
        for c, e in zip(CASES, b["expected"]):
            m = MAP[c["mapping"]]
            w.writerow([c["id"], m["retailer_id"], m["code"], c["title"], f"{c['amount']:.2f}", e["state"],
                        e["raw"], e["display"], e["band"], e["priority"], e["days_left"], e["recommendation"], c["hero"]])

    seed = ["-- Seed data for the Dispute Readiness prototype. Generated by generator/generate.py.\n",
            "-- All companies, people, POs and amounts are fictional. Demo date: " + DEMO_DATE.isoformat() + "\n",
            "begin;\n\n"]
    seed.append(insert("settings", [dict(key=k, value=str(v)) for k, v in SETTINGS.items()], ["key", "value"]))
    seed.append(insert("retailers", RETAILERS))
    seed.append(insert("carriers", CARRIERS))
    seed.append(insert("app_users", USERS))
    seed.append(insert("templates", template_rows))
    seed.append(insert("template_lines", line_rows))
    seed.append(insert("code_mappings", mapping_rows))
    seed.append(insert("purchase_orders", b["po"]))
    seed.append(insert("invoices", b["inv"]))
    seed.append(insert("shipments", b["ship"]))
    seed.append(insert("asns", b["asn"]))
    seed.append(insert("deductions", b["ded"]))
    seed.append(insert("evidence", b["ev"]))
    seed.append(insert("dispute_history", b["hist"]))
    seed.append(insert("outcomes_archive", archive_rows))
    seed.append(insert("audit_log", b["audit"]))
    seed.append("commit;\n")
    text = "".join(seed)
    with open(os.path.join(OUT_SQL, "seed.sql"), "w") as f:
        f.write(text)

    for name, rows in [("settings", settings_rows), ("retailers", RETAILERS), ("carriers", CARRIERS),
                       ("app_users", USERS), ("templates", template_rows), ("template_lines", line_rows),
                       ("code_mappings", mapping_rows), ("purchase_orders", b["po"]), ("invoices", b["inv"]),
                       ("shipments", b["ship"]), ("asns", b["asn"]), ("deductions", b["ded"]),
                       ("evidence", b["ev"]), ("dispute_history", b["hist"]),
                       ("outcomes_archive", archive_rows), ("audit_log", b["audit"])]:
        write_csv(name, rows)

    print(f"cases={len(b['ded'])} evidence={len(b['ev'])} history={len(b['hist'])} "
          f"templates={len(TEMPLATES)} lines={len(line_rows)} mappings={len(CODE_MAPPINGS)}")


if __name__ == "__main__":
    main()
