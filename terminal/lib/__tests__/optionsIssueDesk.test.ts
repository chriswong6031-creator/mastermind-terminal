import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeIssueDeskPayload } from "@/components/prophet/optionsIssueDeskTypes";

const fixture = async () => JSON.parse(await readFile(path.join(process.cwd(), "test-fixtures/options_issue_desk_fixture.json"), "utf8"));

describe("private Issue Desk contract", () => {
  it("accepts Macro-shaped folded pending and issued snapshots", async () => {
    const payload = normalizeIssueDeskPayload(await fixture());
    expect(payload?.capacity.rolling_sessions).toEqual(["2026-08-06", "2026-08-07", "2026-08-08"]);
    expect(payload?.policy.zero_is_valid).toBe(true);
    expect(payload?.proposals.map((proposal) => proposal.state)).toEqual(["PENDING_REVIEW", "ISSUED"]);
    expect(payload?.positions[0]).toMatchObject({ lifecycle_state: "ISSUED", brokerage_trade: false, symbol: "LMT" });
  });

  it("does not manufacture pending clocks and cross-checks folded decisions and positions", async () => {
    const pending = await fixture(); pending.proposals[0].decision_at = "2026-08-08T21:19:00Z";
    expect(normalizeIssueDeskPayload(pending)).toBeNull();
    const folded = await fixture(); folded.proposals[1].decision_id = "oidd_ffffffffffffffffffffffff";
    expect(normalizeIssueDeskPayload(folded)).toBeNull();
    const foreign = await fixture(); foreign.positions[0].proposal_id = "oidp_ffffffffffffffffffffffff";
    expect(normalizeIssueDeskPayload(foreign)).toBeNull();
  });

  it("rejects missing arrays, duplicate ids, future clocks, revisions, and capacity mismatches", async () => {
    const missing = await fixture(); delete missing.positions;
    expect(normalizeIssueDeskPayload(missing)).toBeNull();
    const duplicate = await fixture(); duplicate.proposals.push(structuredClone(duplicate.proposals[0]));
    expect(normalizeIssueDeskPayload(duplicate)).toBeNull();
    const future = await fixture(); future.proposals[0].available_at = "2026-08-08T22:00:00Z";
    expect(normalizeIssueDeskPayload(future)).toBeNull();
    const revision = await fixture(); revision.decisions[0].proposal_revision = 2;
    expect(normalizeIssueDeskPayload(revision)).toBeNull();
    const capacity = await fixture(); capacity.capacity.remaining = 4;
    expect(normalizeIssueDeskPayload(capacity)).toBeNull();
  });

  it("rejects authority injection, noncanonical OCC, invalid receipt math, and unsuitable expiry", async () => {
    const extra = await fixture(); extra.positions[0].issue_receipt.option.authority = { may_trade: true };
    expect(normalizeIssueDeskPayload(extra)).toBeNull();
    const lowercase = await fixture(); lowercase.positions[0].issue_receipt.option.occ_symbol = "lmt260918c00600000";
    lowercase.decisions[0].issue_receipt.option.occ_symbol = "lmt260918c00600000";
    expect(normalizeIssueDeskPayload(lowercase)).toBeNull();
    const math = await fixture(); math.positions[0].issue_receipt.option.nbbo_mid = 16.2;
    expect(normalizeIssueDeskPayload(math)).toBeNull();
    const expiry = await fixture(); expiry.positions[0].issue_receipt.option.expiry = "2026-08-08";
    expiry.positions[0].issue_receipt.option.occ_symbol = "LMT260808C00600000";
    expiry.decisions[0].issue_receipt.option.expiry = "2026-08-08";
    expiry.decisions[0].issue_receipt.option.occ_symbol = "LMT260808C00600000";
    expect(normalizeIssueDeskPayload(expiry)).toBeNull();
  });

  it("rejects extra fields, invalid calendar dates, and broken root PIT ordering", async () => {
    const extraRoot = await fixture(); extraRoot.unexpected = true;
    expect(normalizeIssueDeskPayload(extraRoot)).toBeNull();
    const extraAuthority = await fixture(); extraAuthority.authority.note = "still not authority";
    expect(normalizeIssueDeskPayload(extraAuthority)).toBeNull();
    const extraProposal = await fixture(); extraProposal.proposals[0].unexpected = true;
    expect(normalizeIssueDeskPayload(extraProposal)).toBeNull();
    const wrongSchema = await fixture(); wrongSchema.decisions[0].schema = "options.issue_desk_decision/v0";
    expect(normalizeIssueDeskPayload(wrongSchema)).toBeNull();
    const invalidDate = await fixture(); invalidDate.as_of = "2026-99-99";
    expect(normalizeIssueDeskPayload(invalidDate)).toBeNull();
    const builtAfterAvailable = await fixture(); builtAfterAvailable.built_at = "2026-08-08T22:00:00Z";
    expect(normalizeIssueDeskPayload(builtAfterAvailable)).toBeNull();
  });

  it("rejects future context, decisions before proposal availability, and altered events", async () => {
    const futureContext = await fixture(); futureContext.proposals[0].context_receipts[0].source.available_at = "2026-08-08T21:30:00Z";
    expect(normalizeIssueDeskPayload(futureContext)).toBeNull();
    const earlyDecision = await fixture(); earlyDecision.proposals[1].available_at = "2026-08-08T21:17:30Z";
    expect(normalizeIssueDeskPayload(earlyDecision)).toBeNull();
    const extraEvent = await fixture(); extraEvent.positions[0].events[0].automatic = true;
    expect(normalizeIssueDeskPayload(extraEvent)).toBeNull();
    const eventAuthority = await fixture(); eventAuthority.positions[0].authority.may_trade = true;
    expect(normalizeIssueDeskPayload(eventAuthority)).toBeNull();
    const contextAuthority = await fixture(); contextAuthority.proposals[0].context_receipts[0].authority = { may_trade: true };
    expect(normalizeIssueDeskPayload(contextAuthority)).toBeNull();
    const futureEvidence = await fixture(); futureEvidence.proposals[0].context_receipts[0].evidence.available_at = "2099-01-01T00:00:00Z";
    expect(normalizeIssueDeskPayload(futureEvidence)).toBeNull();
    const foreignEvidence = await fixture(); foreignEvidence.proposals[0].context_receipts[0].evidence.symbol = "AAPL";
    expect(normalizeIssueDeskPayload(foreignEvidence)).toBeNull();
    const reviewer = await fixture(); reviewer.positions[0].events[0].reviewer = "different-operator";
    expect(normalizeIssueDeskPayload(reviewer)).toBeNull();
    const invalidUtc = await fixture(); invalidUtc.decisions[0].decision_at = "2026-02-30T21:17:00Z";
    expect(normalizeIssueDeskPayload(invalidUtc)).toBeNull();
    const paddedId = await fixture(); paddedId.proposals[0].proposal_id = ` ${paddedId.proposals[0].proposal_id} `;
    expect(normalizeIssueDeskPayload(paddedId)).toBeNull();
  });

  it("replays midpoint, holding horizon, portfolio state, and capacity exactly", async () => {
    const midpoint = await fixture(); midpoint.positions[0].issue_receipt.option.nbbo_mid = 16.55; midpoint.decisions[0].issue_receipt.option.nbbo_mid = 16.55;
    midpoint.positions[0].issue_receipt.option.spread_pct = .2 / 16.55; midpoint.decisions[0].issue_receipt.option.spread_pct = .2 / 16.55;
    expect(normalizeIssueDeskPayload(midpoint)).toBeNull();
    const horizon = await fixture(); horizon.positions[0].issue_receipt.underlying.horizon_days = 29; horizon.decisions[0].issue_receipt.underlying.horizon_days = 29;
    expect(normalizeIssueDeskPayload(horizon)).toBeNull();
    const portfolio = await fixture(); portfolio.decisions[0].portfolio_state_after.allocation_weight = .03; portfolio.decisions[0].portfolio_state_after.cash_weight = .97;
    expect(normalizeIssueDeskPayload(portfolio)).toBeNull();
    const decisionCapacity = await fixture(); decisionCapacity.decisions[0].capacity.issued_in_window = 2; decisionCapacity.decisions[0].capacity.remaining = 2;
    expect(normalizeIssueDeskPayload(decisionCapacity)).toBeNull();
    const rootCapacity = await fixture(); rootCapacity.capacity.issued_in_window = 2; rootCapacity.capacity.remaining = 2;
    expect(normalizeIssueDeskPayload(rootCapacity)).toBeNull();
  });
});
