import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {getCustomerConversationHistoryHttpOptions, getCustomerConversationMessageHttpOptions, getCustomerConversationStreamHttpOptions, getCustomerMessageHistoryHttpOptions, getCustomerMessageHttpOptions, getInquiryHttpOptions} from "@/composition/inquiries/inquiry-http";
import {getStaffConversationReplyHttpOptions} from "@/composition/inquiries/staff-conversation-reply-http";
import {getStaffAuthHttpOptions, getStaffLoginHttpOptions} from "@/composition/staff-authentication/staff-authentication-http";

describe("development Origin HTTP composition", () => {
  const configuredEnvironment = {NODE_ENV: "development", YOLPOL_DEV_ORIGIN: "http://192.168.1.100:3000"};
  const productionEnvironment = {NODE_ENV: "production", YOLPOL_DEV_ORIGIN: "http://192.168.1.100:3000"};

  const optionsFactories = [
    getInquiryHttpOptions,
    getCustomerMessageHttpOptions,
    getCustomerMessageHistoryHttpOptions,
    getCustomerConversationMessageHttpOptions,
    getCustomerConversationHistoryHttpOptions,
    getCustomerConversationStreamHttpOptions,
    getStaffLoginHttpOptions,
    getStaffAuthHttpOptions,
    getStaffConversationReplyHttpOptions,
  ] as const;

  it("supplies the same exact configured development Origin to every mutation composition", () => {
    for (const getOptions of optionsFactories) {
      expect([...getOptions(configuredEnvironment).approvedDevelopmentOrigins]).toEqual(["http://192.168.1.100:3000"]);
    }
  });

  it("supplies no configured development Origin outside development", () => {
    for (const getOptions of optionsFactories) {
      expect([...getOptions(productionEnvironment).approvedDevelopmentOrigins]).toEqual([]);
    }
  });
});
