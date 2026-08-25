import {describe,expect,it,vi} from "vitest";

import {focusInquiryFailure,inquiryServerFailure,parseInquirySubmissionResponse,requestInquirySubmissionWithTimeout,revealInquiryFeedback} from "@/features/inquiries/presentation/components/inquiry-form";
import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";

const json=(value:unknown,status=201,contentType="application/json")=>new Response(value===undefined?undefined:JSON.stringify(value),{status,headers:{"Content-Type":contentType}});
const input={} as SubmitInquiryInput;
const conversationAccessToken=`ypc_${"A".repeat(43)}`;

describe("Inquiry success response contract",()=>{
  it("accepts only the exact 201 closed contract",async()=>expect(await parseInquirySubmissionResponse(json({status:"created",inquiryId:"valid_id-1",conversationAccessToken}))).toEqual({status:"created",inquiryId:"valid_id-1",conversationAccessToken}));
  it.each([
    json({status:"created",inquiryId:"id"},200),new Response(null,{status:204}),new Response("ok",{status:201,headers:{"Content-Type":"text/plain"}}),
    json(undefined),json({status:"accepted",inquiryId:"id",conversationAccessToken}),json({status:"created"}),json({status:"created",inquiryId:"bad/id",conversationAccessToken}),json({status:"created",inquiryId:"id",conversationAccessToken:"bad/token"}),json({status:"created",inquiryId:"id",conversationAccessToken,extra:true}),
  ])("rejects invalid success responses",async response=>expect((await parseInquirySubmissionResponse(response.clone())).status).toBe("rejected"));
  it("treats a safe 403 origin rejection as a failed submission, never success",async()=>expect(await parseInquirySubmissionResponse(json({status:"error",code:"invalid_origin"},403))).toEqual({status:"rejected",code:"invalid_origin",field:undefined}));
});

describe("Inquiry submission timing and indexed errors",()=>{
  it("focuses feedback without an initial jump and scrolls an off-screen panel into view",()=>{ const focus=vi.fn(); const scrollIntoView=vi.fn(); revealInquiryFeedback({focus,scrollIntoView,getBoundingClientRect:()=>({top:900,bottom:1100}) as DOMRect},800,false); expect(focus).toHaveBeenCalledWith({preventScroll:true}); expect(scrollIntoView).toHaveBeenCalledWith({block:"center",behavior:"smooth"}); });
  it("respects reduced motion and does not scroll a visible panel",()=>{ const focus=vi.fn(); const scrollIntoView=vi.fn(); revealInquiryFeedback({focus,scrollIntoView,getBoundingClientRect:()=>({top:100,bottom:300}) as DOMRect},800,true); expect(focus).toHaveBeenCalledOnce(); expect(scrollIntoView).not.toHaveBeenCalled(); });
  it("aborts a timeout and clears its timer",async()=>{
    vi.useFakeTimers(); const controller=new AbortController();
    const fetcher=vi.fn((_url:URL|string|Request,init?:RequestInit):Promise<Response>=>new Promise((_resolve,reject)=>init?.signal?.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError"))))) as unknown as typeof fetch;
    const pending=requestInquirySubmissionWithTimeout(input,controller,fetcher,100);
    await vi.advanceTimersByTimeAsync(100); expect(await pending).toEqual({status:"rejected",code:"timeout"}); expect(controller.signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
  });
  it("propagates network failure and clears the timer",async()=>{vi.useFakeTimers();await expect(requestInquirySubmissionWithTimeout(input,new AbortController(),vi.fn().mockRejectedValue(new TypeError("network")),100)).rejects.toThrow("network");expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});
  it("maps later Product rows to stable accessible targets",()=>{
    expect(inquiryServerFailure("items.1.productId")).toEqual({field:"products",code:"invalid",itemIndex:1});
    expect(inquiryServerFailure("items.1.palletCount")).toEqual({field:"palletCount",code:"invalid",itemIndex:1});
    expect(inquiryServerFailure("items.2.quantity")).toBeUndefined();
  });
  it("focuses the first specific invalid control",()=>{const focus=vi.fn();const findControl=vi.fn(()=>({focus}));focusInquiryFailure({field:"phone",code:"invalid"},findControl);expect(findControl).toHaveBeenCalledWith("inquiry-phone");expect(focus).toHaveBeenCalledOnce();});
});
