import Link from "next/link";

const steps = [
  ["Tell us about your work", "Your postcode, your hours, and in your own words, what kind of rain stops you."],
  ["Get a price from 10 years of local rain", "We check a decade of hourly weather where you work and explain the odds in plain English."],
  ["Get paid when rain stops work", "No claim forms. If the rain trigger is met on a working day, the money lands in your PayPal that day."],
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 pt-4">
        <p className="text-sm font-medium text-accent">For self-employed roofers in Surrey</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Rained off? Get paid anyway.</h1>
        <p className="text-lg text-muted">
          A rain day can cost a roofer £200. Normal insurance won’t touch it because nothing is damaged.
          Rain-Day Cover pays a fixed amount into your PayPal on days the rain stops you working.
        </p>
        <Link href="/start" className="btn">Get my quote, takes 2 minutes</Link>
      </section>
      <ol className="grid gap-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="card flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">{i + 1}</span>
            <div><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted">{body}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
