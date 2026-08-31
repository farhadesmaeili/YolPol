export type StaffCapabilities = Readonly<{
  mayAccessStaffPanel: boolean;
  mayViewInquiries: boolean;
  mayViewCustomerConversation: boolean;
  mayReplyToCustomerConversation: boolean;
  mayPublishStaffTyping: boolean;
  mayUpdateInquiryWorkflow: boolean;
  mayViewAiOperations: boolean;
  mayManageAiOperations: boolean;
  mayManageTeam: boolean;
  mayCreateStaffInvitation: boolean;
  mayDeactivateStaffMember: boolean;
  mayReactivateStaffMember: boolean;
  mayChangeStaffRole: boolean;
  mayAssignAdminRole: boolean;
  mayAssignSuperAdminRole: boolean;
}>;
