import type {Metadata} from "next";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import {createLocalizedMetadata} from "@/shared/seo/metadata";
import type {Locale} from "@/shared/types/locale";

const messages = {en: enMessages, tr: trMessages, fa: faMessages, ar: arMessages} as const;
export function createExportLogisticsMetadata(locale: Locale): Metadata { const metadata = messages[locale].ExportLogistics.metadata; return createLocalizedMetadata({locale, title: metadata.title, description: metadata.description, pathname: "/wholesale-process"}); }
