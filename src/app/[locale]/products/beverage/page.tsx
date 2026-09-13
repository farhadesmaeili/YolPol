import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {createCategoryMetadata} from "@/app/[locale]/_site-metadata";
import {ProductCategoryRoute} from "@/app/[locale]/products/_category-route";
import {isLocale} from "@/i18n/locale";
export async function generateMetadata({params}: {params: Promise<{locale: string}>}): Promise<Metadata> {const {locale}=await params;if(!isLocale(locale))notFound();return createCategoryMetadata(locale,"beverage");}
export default async function Page({params}: {params: Promise<{locale: string}>}) {const {locale}=await params;if(!isLocale(locale))notFound();return <ProductCategoryRoute locale={locale} category="beverage"/>;}
