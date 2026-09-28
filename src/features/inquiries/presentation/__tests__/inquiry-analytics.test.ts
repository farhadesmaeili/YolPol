import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";

import {trackSuccessfulInquiryLead} from "@/features/inquiries/presentation/analytics/inquiry-analytics";
import {parseInquirySubmissionResponse} from "@/features/inquiries/presentation/components/inquiry-form";

describe("Inquiry generate_lead boundary", () => {
  it("tracks once only after the exact successful HTTP response is validated", async () => {
    const tracker = vi.fn(() => true);
    const result = await parseInquirySubmissionResponse(new Response(
      JSON.stringify({status: "created", inquiryId: "validated-inquiry-id"}),
      {status: 201, headers: {"Content-Type": "application/json"}},
    ));

    expect(trackSuccessfulInquiryLead(result, {locale: "en", productCount: 2}, tracker)).toBe(true);
    expect(tracker).toHaveBeenCalledOnce();
    expect(tracker).toHaveBeenCalledWith({locale: "en", productCount: 2});
  });

  it.each(["rejected", "validation_failed", "rate_limited", "timeout"])("does not track %s", (status) => {
    const tracker = vi.fn(() => true);
    expect(trackSuccessfulInquiryLead({status}, {locale: "fa", productCount: 1}, tracker)).toBe(false);
    expect(tracker).not.toHaveBeenCalled();
  });

  it("does not track an HTTP response that fails the exact created contract", async () => {
    const tracker = vi.fn(() => true);
    const result = await parseInquirySubmissionResponse(new Response(
      JSON.stringify({status: "created", inquiryId: "unexpected-success"}),
      {status: 200, headers: {"Content-Type": "application/json"}},
    ));

    expect(trackSuccessfulInquiryLead(result, {locale: "tr", productCount: 1}, tracker)).toBe(false);
    expect(tracker).not.toHaveBeenCalled();
  });

  it("keeps the form integration after the validated response and out of domain/application layers", () => {
    const form = readFileSync("src/features/inquiries/presentation/components/inquiry-form.tsx", "utf8");
    expect(form.indexOf("trackSuccessfulInquiryLead(response")).toBeGreaterThan(form.indexOf("await requestInquirySubmissionWithTimeout"));
    expect(form.match(/trackSuccessfulInquiryLead\(response/gu)).toHaveLength(1);
    expect(form).not.toMatch(/inquiryId.*trackSuccessfulInquiryLead|trackSuccessfulInquiryLead[^\n]*(?:fullName|email|phone|message|destination)/u);
  });
});
