export type ReceiveCustomerMessageResult =
  | Readonly<{status: "created"; messageId: string}>
  | Readonly<{status: "conversation_not_found"}>
  | Readonly<{status: "validation_failed"; field: "inquiryId" | "message"}>
  | Readonly<{status: "conflict"}>
  | Readonly<{status: "persistence_failed"}>
  | Readonly<{status: "dependency_failed"}>;
