"use client";

import { useEffect, useRef, useState } from "react";
import type {
  RelatedContext,
  SessionStreamHandlers,
  StreamAction,
  StreamInitPayload,
  StreamMessage,
} from "@/lib/session-stream-types";

export function useSessionStream(
  sessionId: string | null,
  enabled: boolean,
  handlers?: SessionStreamHandlers
) {
  const [liveSummary, setLiveSummary] = useState("");
  const [relatedContext, setRelatedContext] = useState<RelatedContext | null>(null);
  const [agentActions, setAgentActions] = useState<StreamAction[]>([]);
  const [connected, setConnected] = useState(false);
  const [remoteUserNotes, setRemoteUserNotes] = useState<string | null>(null);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!sessionId || !enabled) {
      return;
    }

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);

    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));

    es.addEventListener("init", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as StreamInitPayload;
      setLiveSummary(data.liveSummary ?? "");
      setRemoteUserNotes(data.userNotes ?? "");
      setAgentActions(data.actions ?? []);
      if (data.relatedContext) {
        setRelatedContext(data.relatedContext);
      }
      handlersRef.current?.onInit?.(data);
    });

    es.addEventListener("messages", (e) => {
      const msgs = JSON.parse((e as MessageEvent).data) as StreamMessage[];
      handlersRef.current?.onMessages?.(msgs);
    });

    es.addEventListener("actions", (e) => {
      const actions = JSON.parse((e as MessageEvent).data) as StreamAction[];
      setAgentActions((prev) => [...actions, ...prev]);
      handlersRef.current?.onActions?.(actions);
    });

    es.addEventListener("notes", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { userNotes: string };
      setRemoteUserNotes(data.userNotes);
    });

    es.addEventListener("liveSummary", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { liveSummary: string };
      setLiveSummary(data.liveSummary);
    });

    es.addEventListener("relatedContext", (e) => {
      setRelatedContext(JSON.parse((e as MessageEvent).data) as RelatedContext);
    });

    es.addEventListener("end", () => {
      es.close();
      setConnected(false);
      handlersRef.current?.onEnd?.();
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [sessionId, enabled]);

  return {
    liveSummary,
    relatedContext,
    agentActions,
    connected,
    remoteUserNotes,
    setAgentActions,
  };
}
