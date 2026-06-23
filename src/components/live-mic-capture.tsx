"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: { transcript?: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function LiveMicCapture({
  sessionId,
  onTranscript,
}: {
  sessionId: string;
  onTranscript: () => void;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const lastSentRef = useRef("");

  const sendLine = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed === lastSentRef.current) return;
      lastSentRef.current = trimmed;

      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker: "You", content: trimmed }),
      });
      if (res.ok) onTranscript();
    },
    [sessionId, onTranscript]
  );

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError(
        "Live voice capture needs Chrome or Edge. Use scratch notes or type in the Slack thread otherwise."
      );
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          void sendLine(text);
          setInterim("");
        } else {
          interimText += text;
        }
      }
      if (interimText) setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone blocked — allow mic access for localhost in your browser.");
        listeningRef.current = false;
        setListening(false);
      } else if (event.error !== "aborted") {
        setError(`Capture paused: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          listeningRef.current = false;
          setListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);
    setError(null);
    lastSentRef.current = "";

    try {
      recognition.start();
    } catch {
      setError("Could not start microphone. Try Chrome and allow mic access.");
      listeningRef.current = false;
      setListening(false);
    }
  }, [sendLine]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className="card p-4 border-l-4 border-l-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Live voice capture</p>
          <p className="text-xs text-muted mt-0.5">
            Keep this Blaze tab open during your Slack huddle. Blaze listens to your
            mic and writes live notes + transcript.
          </p>
        </div>
        <div className="flex gap-2">
          {!listening ? (
            <button
              type="button"
              onClick={start}
              className="px-4 py-2 text-sm btn-primary rounded-md whitespace-nowrap"
            >
              Start listening
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-2 text-sm btn-secondary rounded-md whitespace-nowrap"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {listening && (
        <div className="mt-3 flex items-center gap-2 text-xs badge-flame px-2 py-1 rounded-full w-fit">
          <span className="landing-live-dot w-2 h-2" />
          Listening… speak naturally
        </div>
      )}

      {interim && (
        <p className="mt-3 text-sm text-muted italic border-t border-border-subtle pt-3">
          {interim}
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-blaze-red">{error}</p>
      )}
    </div>
  );
}
