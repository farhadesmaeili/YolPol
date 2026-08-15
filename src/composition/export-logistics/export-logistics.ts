import {findProductDtoById, listPublishedProductDtos} from "@/composition/products/product-catalog";
import {ListEligibleLogisticsProducts} from "@/features/export-logistics/application/use-cases/list-eligible-logistics-products";
import {ProductApplicationLogisticsAdapter} from "@/features/export-logistics/infrastructure/adapters/product-application-logistics-adapter";
import {presentLogisticsProducts} from "@/features/export-logistics/presentation/presenters/logistics-presenter";
import type {LogisticsPageModel} from "@/features/export-logistics/presentation/view-models/logistics-view-model";
import type {Locale} from "@/shared/types/locale";

export async function getExportLogisticsPageModel(locale: Locale): Promise<LogisticsPageModel> {
  const adapter = new ProductApplicationLogisticsAdapter({listPublished: listPublishedProductDtos, findById: findProductDtoById});
  return presentLogisticsProducts(await new ListEligibleLogisticsProducts(adapter).execute(locale));
}
