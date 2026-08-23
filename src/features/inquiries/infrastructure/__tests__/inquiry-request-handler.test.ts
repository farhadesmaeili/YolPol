import {describe, expect, it, vi} from "vitest";

import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {createInquiryRequestHandler, inquiryRequestSizeLimit} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

const valid: SubmitInquiryInput = {contact:{fullName:"Customer Name",email:"customer@example.test",phone:"+1 202 555 0100",preferredMethod:"email"},location:{country:"Türkiye"},privacy:{accepted:true,policyVersion:"inquiry-contact-consent-v1"},source:{locale:"en",path:"/en/inquiry"},items:[{productId:"ylp-gb-250-og-rd",quantity:12,unit:"pieces"}]};
const request = (body: string, headers: HeadersInit = {}) => new Request("https://yolpol.com/api/inquiries", {method:"POST",body,headers:{"Content-Type":"application/json",Origin:"https://yolpol.com",...headers}});

describe("Inquiry request handler", () => {
  it("returns a minimal 201 response for a persisted Inquiry", async () => {
    const execute = vi.fn().mockResolvedValue({status:"accepted",inquiry:{inquiryId:"real-id",status:"received",createdAt:"2026-08-22T00:00:00.000Z"}});
    const response = await createInquiryRequestHandler(() => ({execute}))(request(JSON.stringify(valid)));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({status:"created",inquiryId:"real-id"}); expect(execute).toHaveBeenCalledWith(valid);
  });
  it.each([
    [request("{"),400,"invalid_request"],
    [new Request("https://yolpol.com/api/inquiries",{method:"POST",body:"{}",headers:{"Content-Type":"text/plain"}}),415,"unsupported_media_type"],
    [request("x".repeat(inquiryRequestSizeLimit+1)),413,"payload_too_large"],
    [request(JSON.stringify(valid),{Origin:"https://attacker.example"}),403,"invalid_origin"],
    [request(JSON.stringify({...valid,privacy:{...valid.privacy,accepted:false}})),422,"validation_failed"],
    [request(JSON.stringify({...valid,items:[]})),422,"validation_failed"],
    [request(JSON.stringify({...valid,items:[valid.items[0],valid.items[0]]})),422,"validation_failed"],
  ])("rejects an unsafe request", async (input, status, code) => { const response=await createInquiryRequestHandler(() => ({execute:vi.fn().mockResolvedValue({status:"validation_failed",field:"request"})}))(input); expect(response.status).toBe(status); expect(await response.json()).toMatchObject({status:"error",code}); });
  it("does not leak persistence details", async () => { const response=await createInquiryRequestHandler(() => ({execute:vi.fn().mockResolvedValue({status:"persistence_failed",detail:"sql secret"})}))(request(JSON.stringify(valid))); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret"); });
  it("maps unavailable Products without echoing Product or customer data", async () => { const response=await createInquiryRequestHandler(() => ({execute:vi.fn().mockResolvedValue({status:"product_not_found",productId:valid.items[0].productId})}))(request(JSON.stringify(valid))); const body=await response.text(); expect(response.status).toBe(422); expect(body).not.toContain(valid.items[0].productId); expect(body).not.toContain(valid.contact.email); });
});
