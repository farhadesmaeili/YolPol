import type {Locale} from "@/shared/types/locale";

export type CatalogProduct = Readonly<{id: unknown; sku: unknown; name: unknown; status: unknown; locale: unknown; packaging?: unknown}>;
export interface LogisticsProductCatalog { listPublished(locale: Locale): Promise<unknown>; findById(id: string, locale: Locale): Promise<unknown>; }
