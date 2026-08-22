import styles from "@/shared/presentation/home/styles/home-hero.module.css";

export function HomeExportPalletGrid({ palletCount }: { palletCount: number }) {
  return (
    <div className="relative grid grid-cols-7 gap-1 p-2 sm:grid-cols-13 sm:gap-1.5 sm:p-2.5">
      {Array.from({ length: palletCount }, (_, index) => (
        <span
          data-home-pallet=""
          key={index}
          className={`${styles.pallet} relative aspect-square overflow-hidden rounded-[3px] border border-emerald-950/25 bg-emerald-900/[0.08]`}
        >
          <span className="absolute inset-x-[14%] bottom-[18%] h-px bg-emerald-950/30" />
          <span className="absolute inset-y-[18%] start-1/2 w-px -translate-x-1/2 bg-emerald-950/[0.10]" />
        </span>
      ))}
      <span className={`${styles.scanner} pointer-events-none absolute inset-y-0 start-0 w-[6%] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent`} />
    </div>
  );
}
