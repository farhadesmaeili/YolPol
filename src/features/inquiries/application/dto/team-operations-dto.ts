import type {ConversationChannel, MessageSenderType} from "@/features/inquiries/domain/types/conversation-types";
import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import type {InquiryStatus, InquiryUnit, StoredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";
import type {StoredInquiryWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";

export type TeamInquiryAssignmentFilter =
  | Readonly<{type: "assigned"; teamMemberId: string}>
  | Readonly<{type: "unassigned"}>;

export type ListTeamInquiriesInput = Readonly<{
  pageSize?: number;
  cursor?: string;
  status?: InquiryStatus;
  assignment?: TeamInquiryAssignmentFilter;
}>;

export type TeamInquiryItemDto = Readonly<{
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unit: InquiryUnit;
}>;

export type TeamInquiryAssignmentDto = Readonly<{
  teamMemberId: string;
  displayName: string;
  assignedAt: string;
}>;

export type TeamConversationActivityDto = Readonly<{
  messageCount: number;
  latestMessage: Readonly<{
    senderType: MessageSenderType;
    channel: ConversationChannel;
    createdAt: string;
  }> | null;
}>;

export type TeamInquiryListItemDto = Readonly<{
  id: string;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
  customerDisplayName: string;
  company: string | null;
  origin: Readonly<{country: string; city: string | null}>;
  destination: Readonly<{country: string | null; city: string | null}>;
  assignment: TeamInquiryAssignmentDto | null;
  items: readonly TeamInquiryItemDto[];
  conversationActivity: TeamConversationActivityDto;
}>;

export type TeamInquiryDetailDto = Readonly<{
  inquiry: Readonly<{
    id: string;
    status: InquiryStatus;
    createdAt: string;
    updatedAt: string;
    contact: Readonly<{
      fullName: string;
      company: string | null;
      email: string;
      phone: string;
      whatsappPhone: string | null;
      telegramUsername: string | null;
      preferredMethods: readonly StoredContactMethod[];
    }>;
    location: Readonly<{country: string; city: string | null}>;
    destination: Readonly<{country: string | null; city: string | null}>;
    message: string | null;
    items: readonly TeamInquiryItemDto[];
  }>;
  assignment: TeamInquiryAssignmentDto | null;
  workflowHistory: readonly StoredInquiryWorkflowEvent[];
  conversationMessages: readonly StaffConversationMessageDto[];
}>;

export type AssignableTeamMemberDto = Readonly<{
  id: string;
  displayName: string;
  active: true;
}>;
