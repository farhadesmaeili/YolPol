"use client";

import {useMemo, useState} from "react";

import {calculateLoadPlan} from "@/features/export-logistics/domain/services/calculate-load-plan";
import {truckCapacityPolicy} from "@/features/export-logistics/domain/types/load-plan";
import {parsePalletCount} from "@/features/export-logistics/presentation/parsers/pallet-count-parser";
import {calculationMessageKey} from "@/features/export-logistics/presentation/presenters/logistics-presenter";
import type {CalculatorProductOption} from "@/features/export-logistics/presentation/view-models/logistics-view-model";

type Labels = Readonly<Record<"heading" | "product" | "pallets" | "add" | "remove" | "reset" | "packages" | "units" | "weight" | "totals" | "maximum" | "remaining" | "feasible" | "palletExceeded" | "weightExceeded" | "bothExceeded" | "insufficientData" | "invalid" | "arithmeticOverflow" | "kilograms" | "disclaimer", string>>;
type Line = {productId: string; palletText: string};

export function ExportLoadCalculator({products, labels, locale}: {products: readonly CalculatorProductOption[]; labels: Labels; locale: string}) {
  const [lines, setLines] = useState<Line[]>(products[0] ? [{productId: products[0].id, palletText: "1"}] : []);
  const available = products.filter((product) => !lines.some((line) => line.productId === product.id));
  const result = useMemo(() => calculateLoadPlan(lines.map((line) => { const parsed = parsePalletCount(line.palletText); return {productId: line.productId, palletCount: parsed.status === "valid" ? parsed.value : undefined, packaging: products.find((product) => product.id === line.productId)?.packaging}; })), [lines, products]);
  const number = new Intl.NumberFormat(locale);
  const kg = (grams: number) => number.format(grams / 1000);
  const calculated = result.status === "calculated" ? result : null;
  const statusText = labels[calculationMessageKey(result)];
  return <section className="mt-12 min-w-0 max-w-full border border-border bg-surface p-5 sm:p-8" aria-labelledby="load-calculator-heading">
    <h2 id="load-calculator-heading" className="text-2xl font-semibold">{labels.heading}</h2>
    <div className="mt-6 min-w-0 max-w-full space-y-4">{lines.map((line, index) => {
      const option = products.find((product) => product.id === line.productId)!;
      const calculatedLine = calculated?.lines[index];
      return <fieldset key={line.productId} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_2.75rem] gap-4 border border-border p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_2.75rem]">
        <legend className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-2 font-semibold">{option.name}</legend>
        <label className="col-span-2 grid min-w-0 max-w-full gap-2 text-sm md:col-span-1">{labels.product}<select value={line.productId} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, productId: event.target.value} : item))} className="min-h-11 w-full min-w-0 max-w-full border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-focus">{[option, ...available].map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></label>
        <label className="grid min-w-0 max-w-full gap-2 text-sm">{labels.pallets}<input type="number" min="1" step="1" inputMode="numeric" value={line.palletText} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, palletText: event.target.value} : item))} className="min-h-11 w-full min-w-0 max-w-full border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-focus" /></label>
        <button type="button" aria-label={`${labels.remove}: ${option.name}`} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex size-11 self-end items-center justify-center rounded border border-red-700 bg-red-700 text-white outline-none transition-colors hover:border-red-800 hover:bg-red-800 active:bg-red-900 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"><svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button>
        {calculatedLine ? <dl className="col-span-2 grid min-w-0 gap-2 text-sm sm:grid-cols-3 md:col-span-3"><div className="min-w-0"><dt>{labels.packages}</dt><dd className="font-semibold">{number.format(calculatedLine.totalPackages)}</dd></div><div className="min-w-0"><dt>{labels.units}</dt><dd className="font-semibold">{number.format(calculatedLine.totalBottleUnits)}</dd></div><div className="min-w-0"><dt>{labels.weight}</dt><dd className="font-semibold">{kg(calculatedLine.totalGrossWeightGrams)} {labels.kilograms}</dd></div></dl> : null}
      </fieldset>;
    })}</div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!available.length} onClick={() => available[0] && setLines((current) => [...current, {productId: available[0].id, palletText: "1"}])} className="min-h-11 bg-brand px-5 font-semibold text-white disabled:opacity-50">{labels.add}</button><button type="button" onClick={() => setLines(products[0] ? [{productId: products[0].id, palletText: "1"}] : [])} className="min-h-11 border border-border px-5">{labels.reset}</button></div>
    <div className="mt-8 bg-muted p-5" aria-live="polite"><h3 className="text-xl font-semibold">{labels.totals}</h3><p className="mt-3 font-semibold">{statusText}</p>{calculated ? <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><dt>{labels.pallets}</dt><dd>{number.format(calculated.totals.pallets)} / {number.format(truckCapacityPolicy.maxPallets)} {labels.maximum}</dd>{calculated.assessment === "feasible" ? <small>{labels.remaining}: {number.format(truckCapacityPolicy.maxPallets - calculated.totals.pallets)}</small> : null}</div><div><dt>{labels.weight}</dt><dd>{kg(calculated.totals.grossWeightGrams)} / {kg(truckCapacityPolicy.maxGrossWeightGrams)} {labels.kilograms}</dd>{calculated.assessment === "feasible" ? <small>{labels.remaining}: {kg(truckCapacityPolicy.maxGrossWeightGrams - calculated.totals.grossWeightGrams)} {labels.kilograms}</small> : null}</div><div><dt>{labels.packages}</dt><dd>{number.format(calculated.totals.packages)}</dd></div><div><dt>{labels.units}</dt><dd>{number.format(calculated.totals.bottleUnits)}</dd></div></dl> : null}</div>
    <p className="mt-5 text-sm leading-6 text-muted-foreground">{labels.disclaimer}</p>
  </section>;
}
