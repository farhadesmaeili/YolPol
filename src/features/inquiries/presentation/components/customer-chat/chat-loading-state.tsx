export function ChatLoadingState({message}: {message: string}) {
  return <div role="status" aria-live="polite" className="flex items-center gap-3 border border-emerald-800/20 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-950">
    <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-emerald-900/20 border-t-emerald-800 motion-reduce:animate-none" />
    <span>{message}</span>
  </div>;
}
