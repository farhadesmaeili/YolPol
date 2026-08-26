import "server-only";

import {getTeamOperations} from "@/composition/inquiries/team-operations";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {
  createStaffInquiryDetailRequestHandler,
  createStaffInquiryListRequestHandler,
  createStaffTeamMembersRequestHandler,
} from "@/features/inquiries/infrastructure/http/staff-team-operations-request-handlers";

export const handleStaffInquiryList = createStaffInquiryListRequestHandler(getStaffAuthentication, getTeamOperations);
export const handleStaffInquiryDetail = createStaffInquiryDetailRequestHandler(getStaffAuthentication, getTeamOperations);
export const handleStaffTeamMembers = createStaffTeamMembersRequestHandler(getStaffAuthentication, getTeamOperations);
