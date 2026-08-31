export function HeaderBackground() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,78,59,0.045)_0%,transparent_24%,rgba(255,255,255,0.18)_50%,transparent_76%,rgba(216,199,163,0.08)_100%)]" />
        <div className="absolute -start-36 -top-44 size-80 rounded-full bg-emerald-700/[0.095] blur-[110px]" />
        <div className="absolute left-1/2 top-[-8rem] h-64 w-[min(46rem,90vw)] -translate-x-1/2 rounded-full bg-white/28 blur-[95px]" />
        <div className="absolute -end-24 -top-44 size-80 rounded-full bg-[#d8c7a3]/30 blur-[120px]" />
        <div className="absolute inset-x-[18%] bottom-[-4rem] h-24 rounded-full bg-emerald-800/[0.035] blur-[70px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div className="absolute inset-x-[12%] bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-800/25 to-transparent" />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -start-10 top-1/2 size-20 -translate-y-1/2 lg:-start-20 lg:size-44"
      >
        <div className="absolute inset-0 animate-[spin_32s_linear_infinite] rounded-full border border-stone-950/[0.045] border-t-emerald-800/25 motion-reduce:animate-none">
          <span className="absolute left-1/2 top-[-3px] size-1.5 -translate-x-1/2 rounded-full bg-emerald-800/70" />
        </div>
        <div className="absolute inset-[25%] animate-[spin_22s_linear_infinite] rounded-full border border-dashed border-stone-950/[0.06] [animation-direction:reverse] motion-reduce:animate-none" />
      </div>
    </>
  );
}
