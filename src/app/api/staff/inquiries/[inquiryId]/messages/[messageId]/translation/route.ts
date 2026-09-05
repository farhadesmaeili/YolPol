import {handleTranslationRemediation} from "@/composition/conversation-translation/translation-remediation-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleTranslationRemediation;
