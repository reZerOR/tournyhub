export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16 sm:px-10">
      <div className="flex max-w-2xl flex-col gap-5">
        <p className="text-sm font-medium tracking-wide text-muted-foreground">
          Private beta
        </p>
        <h1 className="font-heading text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
          TournyHub
        </h1>
        <p className="text-xl leading-8 text-pretty text-muted-foreground sm:text-2xl">
          Live player Auctions, built for fairness.
        </p>
        <p className="max-w-xl leading-7 text-muted-foreground">
          The application foundation is ready for the identity and Auction
          workflows that follow.
        </p>
      </div>
    </main>
  );
}
