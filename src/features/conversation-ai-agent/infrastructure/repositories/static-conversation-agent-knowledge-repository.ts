import type {ConversationAgentKnowledgeRepository} from "@/features/conversation-ai-agent/application/ports/conversation-agent-ports";
import {publicBusinessPolicy} from "@/shared/config/public-business-policy";
import {siteConfig} from "@/shared/config/site";
import type {Locale} from "@/shared/types/locale";
import type {ConversationAgentEscalationReason} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import {conversationAgentResponseCopy} from "@/features/conversation-ai-agent/infrastructure/config/conversation-agent-response-copy";

export class StaticConversationAgentKnowledgeRepository implements ConversationAgentKnowledgeRepository {
  async getResponseCopy(locale: Locale) { return conversationAgentResponseCopy[locale]; }
  async getPublicSiteInformation(locale: Locale) {
    return Object.freeze({
      brandName: siteConfig.identity.brandName,
      publicName: siteConfig.identity.publicName,
      email: siteConfig.contact.email,
      phones: Object.freeze(siteConfig.contact.phones.map(({display}) => display)),
      whatsapp: siteConfig.contact.whatsapp.display,
      locationSummary: siteConfig.contact.location.summary[locale],
      officeAddress: siteConfig.contact.location.officeAddress[locale],
    });
  }
  async getInquiryProcess(locale: Locale) { return Object.freeze({statements: publicBusinessPolicy[locale].inquiryProcess}); }
  async getPickupProcess(locale: Locale) { return Object.freeze({statements: publicBusinessPolicy[locale].pickupProcess}); }
  async getStaffReviewResponse(locale: Locale, reason: ConversationAgentEscalationReason) {
    return reason === "PRICE_QUOTATION" || reason === "DISCOUNT_REQUEST"
      ? publicBusinessPolicy[locale].pricingReviewResponse
      : publicBusinessPolicy[locale].staffReviewResponse;
  }
}
