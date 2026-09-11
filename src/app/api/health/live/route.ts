import {healthLiveHandler} from "@/composition/health/health-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = healthLiveHandler;
