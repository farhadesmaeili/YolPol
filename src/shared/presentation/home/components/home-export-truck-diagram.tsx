import { HomeExportPalletGrid } from "@/shared/presentation/home/components/home-export-pallet-grid";

export function HomeExportTruckDiagram({ palletCount }: { palletCount: number }) {
  return (
    <div
      dir="ltr"
      aria-hidden="true"
      data-home-truck=""
      className="relative mx-auto max-w-[620px] pb-7 pt-1"
    >
      <div className="flex min-w-0 items-end">
        <div
          data-home-trailer=""
          className="relative min-w-0 flex-1 border border-stone-950/[0.18] bg-[#f7f5f0]/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-900/10" />
          <HomeExportPalletGrid palletCount={palletCount} />
        </div>

        <div
          data-home-cabin=""
          className="relative h-[74px] w-[68px] shrink-0 border-y border-e border-stone-950/[0.20] bg-emerald-950/[0.09] sm:h-[82px] sm:w-[82px]"
        >
          <div className="absolute inset-x-0 top-0 h-[58%] bg-emerald-900/[0.08] [clip-path:polygon(0_0,66%_0,100%_40%,100%_100%,0_100%)]" />
          <span data-home-windshield="" className="absolute end-2 top-2 h-7 w-7 border border-emerald-950/25 bg-emerald-800/[0.16] [clip-path:polygon(0_0,58%_0,100%_52%,100%_100%,0_100%)] sm:h-8 sm:w-9" />
          <span className="absolute start-2 top-3 h-9 w-px bg-stone-950/15" />
          <span className="absolute end-2 top-[52%] size-1.5 rounded-full bg-emerald-900/45" />
          <span data-home-bumper="" className="absolute -end-1 bottom-1 h-2 w-5 border border-stone-950/20 bg-stone-700/20" />
        </div>
      </div>

      <div data-home-chassis="" className="absolute inset-x-1 bottom-[22px] h-[3px] bg-stone-800/45" />
      <div className="absolute end-[10px] bottom-2 flex gap-1" data-home-wheel-group="">
        <Wheel /><Wheel />
      </div>
      <div className="absolute end-[31%] bottom-2 flex gap-1" data-home-wheel-group="">
        <Wheel /><Wheel />
      </div>
      <div className="absolute start-[18%] bottom-2 flex gap-1" data-home-wheel-group="">
        <Wheel /><Wheel />
      </div>
      <span className="absolute end-[76px] bottom-[22px] h-3 w-5 border-b border-e border-stone-800/40 sm:end-[90px]" />
    </div>
  );
}

function Wheel() {
  return (
    <span className="relative block size-5 rounded-full border-[3px] border-stone-700 bg-[#f3f1eb] shadow-[0_2px_4px_rgba(28,25,23,0.18)] sm:size-6">
      <span className="absolute inset-[30%] rounded-full bg-stone-500" />
    </span>
  );
}
