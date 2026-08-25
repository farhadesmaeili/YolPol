export function ChatErrorState({id, title, message}: {id: string; title: string; message: string}) {
  return <div id={id} role="alert" className="border border-red-700 bg-red-50 px-4 py-3 text-red-950">
    <p className="font-semibold">{title}</p>
    <p className="mt-1 text-sm leading-6">{message}</p>
  </div>;
}
