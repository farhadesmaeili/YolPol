import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getStaffAuthHttpOptions} from "@/composition/staff-authentication/staff-authentication-http";
import {createStaffLogoutRequestHandler} from "@/features/staff-authentication/infrastructure/http/staff-authentication-request-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createStaffLogoutRequestHandler(() => getStaffAuthentication().logout, getStaffAuthHttpOptions());

