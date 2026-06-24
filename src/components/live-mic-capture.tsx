"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommitStrategy,
  RealtimeEvents,
  Scribe,
  type RealtimeConnection,
} from "@elevenlabs/client";

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
  autoStart = false,
}: {
  sessionId: string;
  onTranscript: () => void;
  autoStart?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"elevenlabs" | "webspeech" | null>(null);
  const listeningRef = useRef(false);
  const lastSentRef = useRef("");
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const autoStartedRef = useRef(false);

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

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const stopElevenLabs = useCallback(() => {
    connectionRef.current?.close();
    connectionRef.current = null;
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    stopWebSpeech();
    stopElevenLabs();
  }, [stopElevenLabs, stopWebSpeech]);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError(
        "Live voice capture needs ElevenLabs (set ELEVENLABS_API_KEY) or Chrome/Edge for browser speech."
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
        setError("Microphone blocked — allow mic access for this site.");
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
    setEngine("webspeech");
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

  const startElevenLabs = useCallback(async () => {
    const res = await fetch("/api/transcription/elevenlabs-token", {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error("elevenlabs_unavailable");
    }

    const { token } = (await res.json()) as { token?: string };
    if (!token) {
      throw new Error("elevenlabs_unavailable");
    }

    const connection = await Scribe.connect({
      token,
      modelId: "scribe_v2_realtime",
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: 1.5,
      noVerbatim: true,
      microphone: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
      setInterim(data.text ?? "");
    });

    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
      const text = data.text ?? "";
      if (text) void sendLine(text);
      setInterim("");
    });

    connection.on(RealtimeEvents.ERROR, (err) => {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "transcription error";
      setError(`Transcription paused: ${message}`);
    });

    connection.on(RealtimeEvents.CLOSE, () => {
      if (listeningRef.current) {
        listeningRef.current = false;
        setListening(false);
      }
    });

    connectionRef.current = connection;
    listeningRef.current = true;
    setListening(true);
    setEngine("elevenlabs");
    setError(null);
    lastSentRef.current = "";
  }, [sendLine]);

  const start = useCallback(async () => {
    try {
      await startElevenLabs();
    } catch {
      startWebSpeech();
    }
  }, [startElevenLabs, startWebSpeech]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void start();
  }, [autoStart, start]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      stopWebSpeech();
      stopElevenLabs();
    };
  }, [stopElevenLabs, stopWebSpeech]);

  return (
    <div className="card p-4 border-l-4 border-l-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Live voice capture</p>
          <p className="text-xs text-muted mt-0.5">
            Keep this Blaze tab open during your Slack huddle. Blaze listens via
            ElevenLabs Scribe and writes live notes + transcript. Slack thread
            messages are captured automatically too.
          </p>
        </div>
        <div className="flex gap-2">
          {!listening ? (
            <button
              type="button"
              onClick={() => void start()}
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
          Listening
          {engine === "elevenlabs" ? " · ElevenLabs Scribe" : " · browser speech"}
        </div>
      )}

      {interim && (
        <p className="mt-3 text-sm text-muted italic border-t border-border-subtle pt-3">
          {interim}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-blaze-red">{error}</p>}
    </div>
  );
}
