import {describe,expect,it} from "vitest";
import {toInquiry,toInquiryRecord} from "@/features/inquiries/infrastructure/mappers/inquiry-record-mapper";
import {parseSubmissionPayload} from "@/features/inquiries/infrastructure/validation/submission-payload";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
describe("Inquiry record mapping",()=>{it("round trips all contact and item fields",()=>{const inquiry=new InquiryTestBuilder().buildReconstituted({status:"QUOTED",updatedAt:new Date("2026-01-03")});const record=toInquiryRecord(inquiry);expect(toInquiryRecord(toInquiry(record))).toEqual(record);expect(record.preferredContactMethods).toEqual(["email","telegram"]);});});
const valid=()=>({contact:{fullName:"Test Customer",email:"customer@example.test",phone:"+12025550100",whatsappPhone:"+12025550101",telegramUsername:"@test_user",preferredMethods:["email","whatsapp","telegram"]},location:{country:"TR"},privacy:{accepted:true,policyVersion:"test-v2"},source:{locale:"en",path:"/en/inquiry"},items:[{productId:"test-product-1",palletCount:12}]});
describe("submission payload boundary",()=>{
  it("copies the strict new contract",()=>{const original=valid();const result=parseSubmissionPayload(original);expect(result.status).toBe("success");if(result.status!=="success")return;original.items[0].palletCount=20;expect(result.value.items[0].palletCount).toBe(12);expect(result.value.contact.preferredMethods).toEqual(["email","whatsapp","telegram"]);});
  it.each([{...valid(),contact:{...valid().contact,preferredMethod:"email"}},{...valid(),items:[{productId:"test",quantity:1,unit:"pallets"}]},{...valid(),contact:{...valid().contact,preferredMethods:["email","email"]}},{...valid(),contact:{...valid().contact,preferredMethods:["phone"]}},{...valid(),unexpected:true},Object.assign(Object.create({}),valid())])("rejects legacy, duplicate, unknown, and unsafe shapes",value=>expect(parseSubmissionPayload(value).status).toBe("failure"));
  it.each(["contact","location","privacy","source","items"])("rejects missing root section %s",key=>{const value={...valid()} as Record<string,unknown>;delete value[key];expect(parseSubmissionPayload(value).status).toBe("failure");});
  it.each(["fullName","email","phone","preferredMethods"])("rejects missing contact field %s",key=>{const value=valid();const contact={...value.contact} as Record<string,unknown>;delete contact[key];expect(parseSubmissionPayload({...value,contact}).status).toBe("failure");});
  it.each(["accepted","policyVersion"])("rejects missing privacy field %s",key=>{const value=valid();const privacy={...value.privacy} as Record<string,unknown>;delete privacy[key];expect(parseSubmissionPayload({...value,privacy}).status).toBe("failure");});
  it.each(["locale","path"])("rejects missing source field %s",key=>{const value=valid();const source={...value.source} as Record<string,unknown>;delete source[key];expect(parseSubmissionPayload({...value,source}).status).toBe("failure");});
  it.each([null,[],"contact",42,true])("rejects non-object contact %j",contact=>expect(parseSubmissionPayload({...valid(),contact}).status).toBe("failure"));
  it.each([null,[],"location",42,true])("rejects non-object location %j",location=>expect(parseSubmissionPayload({...valid(),location}).status).toBe("failure"));
  it.each([null,[],"privacy",42,true])("rejects non-object privacy %j",privacy=>expect(parseSubmissionPayload({...valid(),privacy}).status).toBe("failure"));
  it.each([null,{},"items",42,true])("rejects non-array items %j",items=>expect(parseSubmissionPayload({...valid(),items}).status).toBe("failure"));
  it.each([null,[],{},42,true])("rejects malformed item %j",item=>expect(parseSubmissionPayload({...valid(),items:[item]}).status).toBe("failure"));
  it.each([
    ["email"],["whatsapp"],["telegram"],["email","whatsapp"],["email","telegram"],["whatsapp","telegram"],["email","whatsapp","telegram"],
  ] as const)("accepts public method combination %j",(...methods)=>{const base=valid();const selected=methods as readonly string[];const contact={...base.contact,preferredMethods:methods,whatsappPhone:selected.includes("whatsapp")?base.contact.whatsappPhone:undefined,telegramUsername:selected.includes("telegram")?base.contact.telegramUsername:undefined};expect(parseSubmissionPayload({...base,contact}).status).toBe("success");});
  it.each(["phone","sms","EMAIL","WhatsApp","telegram "])("rejects unknown method %s",method=>expect(parseSubmissionPayload({...valid(),contact:{...valid().contact,preferredMethods:[method]}}).status).toBe("failure"));
});

describe("historical record compatibility",()=>{
  it.each([
    ["email",null,null],["whatsapp","+90 legacy phone",null],["whatsapp",null,null],["telegram",null,"@valid_user"],["telegram",null,"legacy.name"],["phone",null,null],
  ] as const)("reconstitutes historical %s contact",(method,whatsappPhone,telegramUsername)=>{const record=toInquiryRecord(new InquiryTestBuilder().buildReconstituted());const restored=toInquiry({...record,preferredContactMethods:[method],whatsappPhone,telegramUsername});expect(restored.contact.preferredMethods).toEqual([method]);expect(restored.contact.whatsappPhone).toBe(whatsappPhone??undefined);expect(restored.contact.telegramUsername).toBe(telegramUsername??undefined);});
  it.each(["pieces","packages","truckloads"] as const)("round trips historical %s items",unit=>{const inquiry=new InquiryTestBuilder().with({items:[{productId:"test-product-1",sku:"TEST-1",slug:"test",productName:"Test",quantity:12,unit}]}).buildReconstituted();expect(toInquiry(toInquiryRecord(inquiry)).items[0].unit).toBe(unit);});
});
