import { ContactForm } from "@/components/contact-form";

const nav = [
  { href: "#about", label: "About" },
  { href: "#highlights", label: "Highlights" },
  { href: "#contact", label: "Contact" },
];

const highlights = [
  {
    index: "01",
    title: "Work",
    body: "Selected projects can live here: the brief, the constraint that mattered, and the screen that resolved it.",
  },
  {
    index: "02",
    title: "Writing",
    body: "Short essays can live here, each one tied to a question about craft, critique, or pacing.",
  },
  {
    index: "03",
    title: "Contact",
    body: "A placeholder mailbox and a local form, for collaborations and ordinary questions.",
    href: "#contact",
    linkLabel: "Write a note",
  },
];

export function HomePage() {
  return (
    <div className="home-page relative flex min-h-screen flex-1 flex-col bg-[#f3f0ea] text-[#1c1917] selection:bg-[#e4d9c8] selection:text-[#1c1917]">
      <a className="home-skip" href="#content">
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-[#e0d7cb] bg-[#f3f0ea]/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4">
          <a href="#top" className="rounded-sm leading-tight">
            <span className="block text-sm font-semibold tracking-tight">
              Alex Rivera
            </span>
            <span className="mt-0.5 block text-sm text-[#433e38]">
              Independent product designer
            </span>
          </a>
          <nav aria-label="Page">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm font-medium text-[#1c1917] underline decoration-transparent underline-offset-4 hover:decoration-[#1c1917]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="content">
        <section id="top" className="mx-auto w-full max-w-5xl px-5 py-20 sm:py-28">
          <p className="text-sm font-medium text-[#433e38]">
            Independent product designer
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
            Calm tools for a busy day.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#433e38]">
            Alex Rivera is an independent product designer. The name, the role,
            and these sentences are placeholders the owner can replace.
          </p>
        </section>

        <section
          id="about"
          aria-labelledby="about-heading"
          className="border-t border-[#e0d7cb]"
        >
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
            <h2
              id="about-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              About
            </h2>
            <div className="mt-5 max-w-2xl space-y-4 text-base leading-relaxed text-[#433e38]">
              <p>
                I help small teams decide what a product should do, and then
                what it should stop doing. The useful work is usually
                subtraction: fewer steps, plainer words, and defaults that
                respect a busy day.
              </p>
              <p>
                This page is a finished shell with stand-in copy. Rename Alex
                Rivera, keep the sections, and write lines that belong to the
                person who owns it.
              </p>
            </div>
          </div>
        </section>

        <section
          id="highlights"
          aria-labelledby="highlights-heading"
          className="border-t border-[#e0d7cb]"
        >
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
            <h2
              id="highlights-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Highlights
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#433e38]">
              Three places to point people: the work, the writing, and a way to
              get in touch.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {highlights.map((item) => (
                <article
                  key={item.title}
                  className="flex flex-col rounded-lg border border-[#d9d1c5] bg-[#fffcf8] p-5"
                >
                  <p className="text-xs font-medium tracking-[0.16em] text-[#433e38]">
                    {item.index}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#433e38]">
                    {item.body}
                  </p>
                  {item.href ? (
                    <a
                      href={item.href}
                      className="mt-5 text-sm font-medium underline decoration-[#c4b8a6] underline-offset-4 hover:decoration-[#1c1917]"
                    >
                      {item.linkLabel}
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="contact"
          aria-labelledby="contact-heading"
          className="border-t border-[#e0d7cb]"
        >
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
            <h2
              id="contact-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Contact
            </h2>
            <p
              id="contact-hint"
              className="mt-4 max-w-xl text-base leading-relaxed text-[#433e38]"
            >
              Email{" "}
              <a
                href="mailto:hello@example.com"
                className="font-medium text-[#1c1917] underline decoration-[#c4b8a6] underline-offset-4 hover:decoration-[#1c1917]"
              >
                hello@example.com
              </a>
              , or leave a note below. The form does not send anything; it only
              confirms on this page.
            </p>
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-[#e0d7cb]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-5 py-8 text-sm text-[#433e38] sm:flex-row sm:items-center sm:justify-between">
          <p>Alex Rivera · Independent product designer</p>
          <p>Placeholder homepage. Rename the owner when you make it yours.</p>
        </div>
      </footer>
    </div>
  );
}
