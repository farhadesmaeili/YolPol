export type CustomerChatSender = "customer" | "support";

export type CustomerChatMessage = Readonly<{
  id: string;
  body: string;
  sender: CustomerChatSender;
  position?: number;
  createdAt?: string;
}>;

export type CustomerChatLabels = Readonly<{
  title: string;
  description: string;
  messages: string;
  empty: string;
  customerAuthor: string;
  supportAuthor: string;
  teamTyping: string;
  messageLabel: string;
  messagePlaceholder: string;
  send: string;
  sending: string;
  loading: string;
  loadingHistory: string;
  sent: string;
  errorTitle: string;
  historyErrorTitle: string;
  newMessages: string;
  reconnecting: string;
  summary: Readonly<{title: string; loading: string; unavailable: string; retry: string; details: string; destination: string; submitted: string; units: Readonly<Record<"pieces" | "packages" | "pallets" | "truckloads", string>>}>;
  errors: Readonly<{
    required: string;
    tooLong: string;
    validation: string;
    rateLimited: string;
    network: string;
    service: string;
    history: string;
  }>;
}>;
