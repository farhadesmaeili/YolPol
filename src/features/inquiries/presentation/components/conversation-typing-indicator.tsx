export function ConversationTypingIndicator({active, label}: Readonly<{active: boolean; label: string}>) {
  return (
    <div className="min-h-7 py-1 text-start text-xs text-stone-500" aria-live="polite" aria-atomic="true">
      {active ? (
        <p role="status" className="flex min-w-0 items-center gap-2">
          <span className="break-words">{label}</span>
          <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none"
                style={{animationDelay: `${index * 180}ms`}}
              />
            ))}
          </span>
        </p>
      ) : null}
    </div>
  );
}
