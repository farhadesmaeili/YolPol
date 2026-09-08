import {handleGetGlobalTranslationSettings, handleUpdateGlobalTranslationSettings} from "@/composition/conversation-translation/global-translation-settings-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleGetGlobalTranslationSettings;
export const PUT = handleUpdateGlobalTranslationSettings;
