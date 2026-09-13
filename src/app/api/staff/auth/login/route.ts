import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getStaffLoginHttpOptions} from "@/composition/staff-authentication/staff-authentication-http";
import {createStaffLoginRequestHandler} from "@/features/staff-authentication/infrastructure/http/staff-authentication-request-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createStaffLoginRequestHandler(() => getStaffAuthentication().authenticate, getStaffLoginHttpOptions());

