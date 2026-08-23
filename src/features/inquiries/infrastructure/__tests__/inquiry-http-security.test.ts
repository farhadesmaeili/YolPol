import {afterEach, describe, expect, it, vi} from "vitest";

import {InquiryRateLimiter, parseInquiryRateLimitConfig} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {createInquiryRequestHandler, inquiryRequestSizeLimit, originAllowed, readBoundedJsonBody} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

function streamedRequest(chunks: readonly Uint8Array[], headers: HeadersInit = {}, cancelled?: {value:boolean}): Request {
  let index=0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); },
    cancel() { if (cancelled) cancelled.value = true; },
  });
  return new Request("https://yolpol.com/api/inquiries", {method:"POST",body:stream,headers:{"Content-Type":"application/json",...headers},duplex:"half"} as RequestInit);
}

const bytes = (value:string) => new TextEncoder().encode(value);

describe("bounded Inquiry body reader", () => {
  it("accepts exactly 32 KiB across multiple chunks without Content-Length", async () => {
    const value = `"${"a".repeat(inquiryRequestSizeLimit-2)}"`;
    const encoded = bytes(value);
    const result = await readBoundedJsonBody(streamedRequest([encoded.slice(0,123),encoded.slice(123)]));
    expect(result).toEqual({status:"success",value:"a".repeat(inquiryRequestSizeLimit-2)});
  });
  it("stops and cancels one byte above the limit even with a forged smaller Content-Length", async () => {
    const cancelled={value:false};
    const result=await readBoundedJsonBody(streamedRequest([new Uint8Array(inquiryRequestSizeLimit),new Uint8Array(1)],{"Content-Length":"1"},cancelled));
    expect(result).toEqual({status:"too_large"}); expect(cancelled.value).toBe(true);
  });
  it("rejects a declared oversized body before reading", async () => {
    const stream=new ReadableStream<Uint8Array>();
    const request=new Request("https://yolpol.com/api/inquiries",{method:"POST",body:stream,headers:{"Content-Length":String(inquiryRequestSizeLimit+1)},duplex:"half"} as RequestInit);
    expect(await readBoundedJsonBody(request)).toEqual({status:"too_large"});
  });
  it.each(["", "null", "[]", "1"])("parses JSON %s for strict shape validation", async (value) => {
    const result=await readBoundedJsonBody(streamedRequest(value ? [bytes(value)] : []));
    expect(result.status).toBe(value ? "success" : "invalid");
  });
  it("rejects malformed Content-Length and malformed UTF-8", async () => {
    expect(await readBoundedJsonBody(streamedRequest([bytes("{}")],{"Content-Length":"invalid"}))).toEqual({status:"invalid"});
    expect(await readBoundedJsonBody(streamedRequest([new Uint8Array([0xc3,0x28])]))).toEqual({status:"invalid"});
  });
});

describe("Inquiry global limiter", () => {
  it("allows the budget, returns Retry-After, resets, and stays constant-memory", () => {
    let now=0; const limiter=new InquiryRateLimiter({maxRequests:2,windowMs:10_000},()=>now);
    expect(limiter.consume()).toEqual({allowed:true}); expect(limiter.consume()).toEqual({allowed:true});
    expect(limiter.consume()).toEqual({allowed:false,retryAfterSeconds:10}); expect(limiter.storedEntryCount).toBe(1);
    now=10_000; expect(limiter.consume()).toEqual({allowed:true}); expect(limiter.storedEntryCount).toBe(1);
  });
  it.each([{INQUIRY_RATE_LIMIT_MAX_REQUESTS:"0"},{INQUIRY_RATE_LIMIT_MAX_REQUESTS:"NaN"},{INQUIRY_RATE_LIMIT_WINDOW_SECONDS:"0"}])("fails closed for invalid configuration", (environment) => expect(()=>parseInquiryRateLimitConfig(environment)).toThrow());
  it("returns 429 with Retry-After only on this handler", async () => {
    const limiter=new InquiryRateLimiter({maxRequests:1,windowMs:5_000},()=>0);
    const execute=vi.fn().mockResolvedValue({status:"validation_failed",field:"request"});
    const handler=createInquiryRequestHandler(()=>({execute}),{rateLimiter:limiter});
    await handler(new Request("https://yolpol.com/api/inquiries",{method:"POST",body:"{}",headers:{"Content-Type":"application/json"}}));
    const rejected=await handler(new Request("https://yolpol.com/api/inquiries",{method:"POST",body:"{}",headers:{"Content-Type":"application/json"}}));
    expect(rejected.status).toBe(429); expect(rejected.headers.get("Retry-After")).toBe("5");
  });
});

describe("Inquiry origins", () => {
  afterEach(()=>vi.unstubAllEnvs());
  const allowed=new Set(["http://192.168.1.55:3000"]);
  const accepted=(origin:string|undefined,url="http://localhost:3000/api/inquiries") => originAllowed(new Request(url,{headers:origin===undefined?{}:{Origin:origin}}),allowed);
  it("accepts canonical, missing, loopback, and approved development LAN origins",()=>{
    vi.stubEnv("NODE_ENV","development");
    expect(accepted("https://yolpol.com","https://internal:3000/api/inquiries")).toBe(true);
    expect(accepted(undefined)).toBe(true); expect(accepted("http://localhost:3000")).toBe(true);
    expect(accepted("http://127.0.0.1:3000","http://127.0.0.1:3000/api/inquiries")).toBe(true);
    expect(accepted("http://192.168.1.55:3000","http://192.168.1.55:3000/api/inquiries")).toBe(true);
  });
  it("accepts only the canonical approved site Origin in production",()=>{vi.stubEnv("NODE_ENV","production");expect(accepted("https://yolpol.com","https://internal:3000/api/inquiries")).toBe(true);expect(accepted("https://www.yolpol.com","https://internal:3000/api/inquiries")).toBe(false);});
  it("uses the HTTP Host header when Next.js normalizes the request URL",()=>{vi.stubEnv("NODE_ENV","development");expect(originAllowed(new Request("http://localhost/api/inquiries",{headers:{Origin:"http://localhost:3000",Host:"localhost:3000"}}),allowed)).toBe(true);});
  it("rejects a loopback Origin that does not match the HTTP Host",()=>{vi.stubEnv("NODE_ENV","development");expect(originAllowed(new Request("http://localhost/api/inquiries",{headers:{Origin:"http://localhost:3001",Host:"localhost:3000"}}),allowed)).toBe(false);});
  it.each(["http://localhost:3000","http://127.0.0.1:3000","http://192.168.1.55:3000"])("rejects development Origin %s in production",origin=>{vi.stubEnv("NODE_ENV","production");expect(accepted(origin,origin.replace("192.168.1.55","localhost")+"/api/inquiries")).toBe(false);});
  it.each(["https://localhost:3000","http://localhost:3001"])("rejects loopback with the wrong scheme or port: %s",origin=>{vi.stubEnv("NODE_ENV","development");expect(originAllowed(new Request("http://localhost/api/inquiries",{headers:{Origin:origin,Host:"localhost:3000"}}),allowed)).toBe(false);});
  it.each(["http://192.168.1.56:3000","https://192.168.1.55:3000","http://192.168.1.55:3001","null","bad origin","https://yolpol.com, https://evil.test"])("rejects unapproved origin %s",origin=>{vi.stubEnv("NODE_ENV","development");expect(accepted(origin,"http://192.168.1.55:3000/api/inquiries")).toBe(false);});
  it("does not allow the LAN origin in production",()=>{vi.stubEnv("NODE_ENV","production");expect(accepted("http://192.168.1.55:3000","http://192.168.1.55:3000/api/inquiries")).toBe(false);});
});
