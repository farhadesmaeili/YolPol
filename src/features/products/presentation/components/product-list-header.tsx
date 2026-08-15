export function ProductListHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-5 text-lg leading-8 text-stone-600">{description}</p>
    </header>
  );
}
