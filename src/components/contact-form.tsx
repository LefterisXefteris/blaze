"use client";

import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const nameId = useId();
  const emailId = useId();
  const messageId = useId();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
    requestAnimationFrame(() => {
      statusRef.current?.focus();
    });
  }

  return (
    <div className="max-w-xl">
      <form
        className={sent ? "hidden" : "space-y-4"}
        onSubmit={onSubmit}
        aria-describedby="contact-hint"
      >
        <div>
          <label htmlFor={nameId} className="block text-sm font-medium">
            Name
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor={emailId} className="block text-sm font-medium">
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor={messageId} className="block text-sm font-medium">
            Message
          </label>
          <textarea
            id={messageId}
            name="message"
            required
            rows={5}
            placeholder="What would you like to talk about?"
          />
        </div>
        <button
          type="submit"
          className="inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-[#1c1917] px-4 py-2.5 text-sm font-medium text-[#f3f0ea] transition-colors hover:bg-[#3a342e] sm:w-auto"
        >
          Send note
        </button>
      </form>

      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={sent ? -1 : undefined}
        className={
          sent
            ? "rounded-md border border-[#d9d1c5] bg-[#fffcf8] px-4 py-3 text-base leading-relaxed"
            : "sr-only"
        }
      >
        {sent
          ? "Thanks. This note stays in your browser and was not sent."
          : ""}
      </p>

      {sent ? (
        <button
          type="button"
          className="mt-4 cursor-pointer text-sm font-medium underline decoration-[#c4b8a6] underline-offset-4 hover:decoration-[#1c1917]"
          onClick={() => setSent(false)}
        >
          Write another note
        </button>
      ) : null}
    </div>
  );
}
