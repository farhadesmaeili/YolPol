import {handleStaffTeamMembers} from "@/composition/inquiries/team-operations-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleStaffTeamMembers;
