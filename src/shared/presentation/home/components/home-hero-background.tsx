export function HomeHeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#f3f1eb]" />
      <div className="absolute -start-[30rem] -top-[28rem] size-[80rem] max-w-[95vw] rounded-full bg-emerald-700/[0.13] blur-[190px] max-sm:blur-[110px]" />
      <div className="absolute start-[16%] top-[2%] size-[60rem] max-w-[75vw] rounded-full bg-emerald-600/[0.06] blur-[180px] max-sm:blur-[100px]" />
      <div className="absolute -end-[34rem] top-[2%] size-[76rem] max-w-[90vw] rounded-full bg-[#d8c7a3]/22 blur-[220px] max-sm:blur-[120px]" />
      <div className="absolute bottom-[-36rem] start-[30%] size-[64rem] max-w-[70vw] rounded-full bg-stone-400/[0.10] blur-[200px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_48%,rgba(28,25,23,0.07)_100%)]" />
      <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(rgba(28,25,23,0.85)_0.45px,transparent_0.45px)] [background-size:5px_5px]" />
      <div className="absolute start-[6%] top-0 h-full w-px bg-stone-950/[0.045]" />
      <div className="absolute end-[6%] top-0 h-full w-px bg-stone-950/[0.045]" />
      <div className="absolute start-0 top-[17%] h-px w-full bg-stone-950/[0.04]" />
      <div className="absolute bottom-[11%] start-0 h-px w-full bg-stone-950/[0.04]" />
    </div>
  );
}
