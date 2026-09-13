export function ChatLoadingState({message}: {message: string}) {
  return <div role="status" aria-live="polite" className="flex items-center gap-3 px-4 py-3 text-xs font-medium text-muted-foreground">
    <span aria-hidden="true" className="h-1 w-5 shrink-0 animate-pulse rounded-full bg-brand/40 motion-reduce:animate-none" />
    <span>{message}</span>
  </div>;
}
