import { supabase } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return res.json();
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: await authHeader(),
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed (${res.status})`);
  return res.json();
}

export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string; arguments: unknown; status: "success" | "failed"; result?: unknown; error?: string }
  | { type: "citations"; chunks: unknown[] }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Streams a chat response over SSE. Since EventSource can't send custom
 * headers, we use fetch + a manual SSE line parser against the same backend
 * endpoint (which sets Content-Type: text/event-stream).
 */
export async function streamChat(
  workspaceId: string,
  question: string,
  hybrid: boolean,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ question, hybrid }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    onEvent({ type: "error", message: errBody.error ?? `Request failed (${res.status})` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const raw of events) {
      const lines = raw.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const type = eventLine.slice("event: ".length).trim();
      const data = JSON.parse(dataLine.slice("data: ".length));
      onEvent({ type, ...data } as ChatStreamEvent);
    }
  }
}
