import {handleGetNotificationDestinations, handleMutateNotificationDestinations} from "@/composition/notification-destinations/notification-destinations-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleGetNotificationDestinations;
export const POST = handleMutateNotificationDestinations;
