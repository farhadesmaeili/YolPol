import type {ConversationAgentEscalationReason} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";

const rules: readonly Readonly<{reason: ConversationAgentEscalationReason; pattern: RegExp}>[] = [
  {reason: "PRICE_QUOTATION", pattern: /\b(?:price|pricing|cost|quote|how\s+much)\b|قیمت|هزینه|fiyat|ücret|سعر|تكلفة/iu},
  {reason: "DISCOUNT_REQUEST", pattern: /\bdiscount\b|تخفیف|indirim|خصم/iu},
  {reason: "PAYMENT_TERMS", pattern: /\bpayment\s+terms?\b|شرایط\s+پرداخت|ödeme\s+(?:şart|koşul)|شروط\s+الدفع/iu},
  {reason: "CREDIT_REQUEST", pattern: /\bcredit\b|اعتبار|kredi|ائتمان/iu},
  {reason: "CONTRACT_COMMITMENT", pattern: /\bcontract|commit(?:ment)?\b|قرارداد|تعهد|sözleşme|taahhüt|عقد|التزام/iu},
  {reason: "CUSTOMS_GUARANTEE", pattern: /\bcustoms?\b|گمرک|gümrük|جمارك/iu},
  {reason: "LEGAL_OR_REGULATORY_GUARANTEE", pattern: /\b(?:legal|regulatory)\b|قانونی|مقررات|yasal|mevzuat|قانوني|تنظيمي/iu},
  {reason: "DELIVERY_COMMITMENT", pattern: /\b(?:guarantee(?:d)?\s+delivery|delivery\s+(?:date|guarantee)|arrive\s+by)\b|تضمین\s+تحویل|تاریخ\s+تحویل|teslimat\s+(?:garantisi|tarihi)|ضمان\s+التسليم|موعد\s+التسليم/iu},
  {reason: "AVAILABILITY_UNVERIFIED", pattern: /\b(?:in\s+stock|stock|available\s+now|inventory)\b|موجودی|موجود\s+است|stok|mevcut\s+mu|المخزون|متوفر\s+الآن/iu},
  {reason: "UNSUPPORTED_REQUEST", pattern: /\b(?:run|execute)\s+(?:sql|code|shell)|\bselect\s+.+\s+from\b|\b(?:reveal|show)\s+(?:your\s+)?system\s+prompt\b|\bhidden\s+(?:(?:admin|pricing)\s+)?tool\b|\bsend\b.+\b(?:another\s+service|email|telegram|instagram)\b/iu},
];

export function classifySensitiveConversationRequest(value: string): ConversationAgentEscalationReason | null {
  for (const rule of rules) if (rule.pattern.test(value)) return rule.reason;
  return null;
}

export function isSafeSocialConversationRequest(value: string): boolean {
  return /^(?:\s*(?:hello|hi|thanks?|thank\s+you|merhaba|teşekkür(?:ler)?|سلام|درود|ممنون|شكر[اً]?|مرحبا)[\s.!؟?]*)$/iu.test(value);
}
