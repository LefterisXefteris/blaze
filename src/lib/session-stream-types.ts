export type StreamMessage = {
  id: string;
  speaker: string;
  content: string;
  sentAt: string;
};

export type StreamAction = {
  id: string;
  intentType: string;
  riskLevel: string;
  status: string;
  payload: { title?: string; description?: string };
  undoExpiresAt?: string | null;
  createdAt: string;
};

export type RelatedContextHit = {
  sourceType: string;
  sourceRef: string | null;
  purpose: string | null;
  content: string;
  similarity: number;
  linkReason: string;
  metadata?: {
    externalUrl?: string;
    sessionId?: string;
    repo?: string;
  };
};

export type RelatedContext = {
  hits: RelatedContextHit[];
  updatedAt: string;
};

export type StreamInitPayload = {
  messages: StreamMessage[];
  actions: StreamAction[];
  userNotes: string;
  liveSummary: string;
  relatedContext?: RelatedContext | null;
};

export type SessionStreamHandlers = {
  onInit?: (data: StreamInitPayload) => void;
  onMessages?: (messages: StreamMessage[]) => void;
  onActions?: (actions: StreamAction[]) => void;
  onEnd?: () => void;
};
