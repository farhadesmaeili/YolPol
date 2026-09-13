export function FooterBackground() {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -start-[28rem] top-[-20rem] size-[62rem] max-w-[90vw] rounded-full bg-emerald-700/[0.07] blur-[190px]" />
        <div className="absolute -end-[26rem] bottom-[-24rem] size-[60rem] max-w-[90vw] rounded-full bg-[#d8c7a3]/25 blur-[190px]" />
        <div className="absolute bottom-[-24rem] start-[35%] size-[48rem] max-w-[65vw] rounded-full bg-stone-400/[0.10] blur-[170px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_52%,rgba(28,25,23,0.055)_100%)]" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:radial-gradient(rgba(28,25,23,0.9)_0.45px,transparent_0.45px)] [background-size:5px_5px]" />
        <div className="absolute start-[6%] top-0 h-full w-px bg-stone-950/[0.045]" />
        <div className="absolute end-[6%] top-0 h-full w-px bg-stone-950/[0.045]" />
      </div>

      <div aria-hidden="true" dir="ltr" className="pointer-events-none absolute bottom-[-3vw] left-1/2 z-0 max-w-full -translate-x-1/2 select-none overflow-hidden whitespace-nowrap text-[clamp(5rem,20vw,25rem)] font-black leading-none tracking-[-0.09em] text-stone-950/[0.025]">
        YOLPOL
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute -end-28 top-12 z-[1] size-72 sm:-end-40 sm:size-[480px] lg:-end-[16rem] lg:size-[620px] lg:max-w-[55vw] xl:size-[760px]">
        <div className="absolute inset-0 animate-[spin_32s_linear_infinite] rounded-full border border-stone-950/[0.07] border-t-emerald-800/50 motion-reduce:animate-none">
          <span className="absolute left-1/2 top-[-5px] size-2.5 -translate-x-1/2 rounded-full bg-emerald-800 shadow-[0_0_26px_rgba(6,78,59,0.4)]" />
          <span className="absolute bottom-[17%] end-[8%] size-1.5 rounded-full bg-stone-700/50" />
        </div>
        <div className="absolute inset-[12%] animate-[spin_45s_linear_infinite] rounded-full border border-stone-950/[0.055] border-b-stone-950/25 [animation-direction:reverse] motion-reduce:animate-none">
          <span className="absolute bottom-[-4px] left-1/2 size-2 -translate-x-1/2 rounded-full bg-stone-800/60" />
        </div>
        <div className="absolute inset-[25%] animate-[spin_20s_linear_infinite] rounded-full border border-dashed border-emerald-900/[0.17] motion-reduce:animate-none">
          <span className="absolute end-[10%] top-[18%] size-2 rounded-full bg-emerald-800" />
        </div>
        <div className="absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-stone-950/[0.065] to-transparent" />
        <div className="absolute start-[8%] top-1/2 h-px w-[84%] -translate-y-1/2 bg-gradient-to-r from-transparent via-stone-950/[0.065] to-transparent" />
      </div>
    </>
  );
}
