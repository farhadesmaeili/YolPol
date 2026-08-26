export type CustomerChatSender = "customer" | "support";

export type CustomerChatMessage = Readonly<{
  id: string;
  body: string;
  sender: CustomerChatSender;
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
