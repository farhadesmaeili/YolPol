export function ConversationAgentEscalationIndicator({visible, label}: Readonly<{visible: boolean; label: string}>) {
  if (!visible) return null;
  return <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{label}</p>;
}
