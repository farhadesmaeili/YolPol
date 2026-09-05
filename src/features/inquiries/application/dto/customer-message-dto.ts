import type {Locale} from "@/shared/types/locale";

export type ReceiveCustomerMessageInput = Readonly<{
  inquiryId: string;
  message: string;
  sourceLocale?: Locale;
}>;
