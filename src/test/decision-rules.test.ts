import { describe, expect, it } from "vitest";
import { canAct, isDone, settingValue, whoCan, writeOffPending, type Person } from "@/lib/decision-rules";

const people: Person[] = [
  { id: "u_priya", name: "Priya Shah", role: "deductions_analyst" },
  { id: "u_marcus", name: "Marcus Lee", role: "ar_manager" },
  { id: "u_dana", name: "Dana Ortiz", role: "logistics" },
];

describe("role rules", () => {
  it("lets only the analyst request documents and requests above-threshold write-offs", () => {
    expect(canAct("deductions_analyst", "request_document")).toBe(true);
    expect(canAct("ar_manager", "request_document")).toBe(false);
    expect(canAct("deductions_analyst", "request_write_off")).toBe(true);
    expect(canAct("ar_manager", "request_write_off")).toBe(false);
  });

  it("lets only the AR manager approve or reject a requested write-off", () => {
    expect(canAct("ar_manager", "approve_write_off")).toBe(true);
    expect(canAct("ar_manager", "reject_write_off")).toBe(true);
    expect(canAct("deductions_analyst", "approve_write_off")).toBe(false);
  });

  it("gives logistics and sales no decision actions", () => {
    for (const a of ["approve", "request_document", "write_off", "record_outcome"] as const) {
      expect(canAct("logistics", a)).toBe(false);
      expect(canAct("sales", a)).toBe(false);
    }
  });

  it("names who can act when the current role can't", () => {
    expect(whoCan(people, "approve_write_off")).toBe("Marcus Lee (AR manager)");
    expect(whoCan(people, "request_write_off")).toBe("Priya Shah (deductions analyst)");
  });
});

describe("write-off request state", () => {
  it("is pending when the newest event is a request", () => {
    expect(writeOffPending([{ action: "imported", at: "2026-01-01" }, { action: "write_off_requested", at: "2026-02-01" }])).toBe(true);
  });

  it("is closed by an approval or a rejection", () => {
    expect(writeOffPending([{ action: "write_off_requested", at: "2026-02-01" }, { action: "write_off_approved", at: "2026-02-02" }])).toBe(false);
    expect(writeOffPending([{ action: "write_off_requested", at: "2026-02-01" }, { action: "override", at: "2026-02-02" }])).toBe(false);
  });

  it("is not pending with no requests", () => {
    expect(writeOffPending([{ action: "imported", at: "2026-01-01" }])).toBe(false);
  });
});

describe("statuses and settings", () => {
  it("treats submitted, written off, won and denied as done", () => {
    for (const s of ["submitted", "written_off", "won", "denied"]) expect(isDone(s)).toBe(true);
    for (const s of ["open", "supplier_action"]) expect(isDone(s)).toBe(false);
  });

  it("reads the manager threshold from either settings shape", () => {
    expect(settingValue([{ key: "manager_approval_write_off_above", value: "1000" }], "manager_approval_write_off_above")).toBe(1000);
    expect(settingValue({ manager_approval_write_off_above: 1000 }, "manager_approval_write_off_above")).toBe(1000);
  });
});
