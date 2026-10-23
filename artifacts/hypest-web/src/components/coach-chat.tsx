import { FormEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCoachChatQueryKey, getGetTrainingQueryKey, useGetCoachChat, useSendCoachMessage, type Coach } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

/** Chat with your coach (Coaching members, AI on). Safety words get a fixed reply from the server, not the AI. */
export function CoachChat({ coach }: { coach: Coach }) {
  const queryClient = useQueryClient();
  const chat = useGetCoachChat({ query: { queryKey: getGetCoachChatQueryKey() }, request });
  const send = useSendCoachMessage({ request });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const messages = chat.data?.messages ?? [];

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const t = text.trim();
    if (!t) return;
    setError(null);
    try {
      const next = await send.mutateAsync({ data: { text: t } });
      queryClient.setQueryData(getGetCoachChatQueryKey(), next);
      // A safety stop pauses the plan: refresh it.
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      setText("");
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <section className="card coach-chat" aria-label={`Chat with ${coach.name}`}>
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? <p className="label">Ask {coach.name} about form, your plan or staying on track.</p> : null}
        {messages.map((m) => (
          <p key={m.id} className={m.role === "member" ? "bubble bubble-me" : "bubble"}>{m.text}</p>
        ))}
        {send.isPending ? <p className="bubble bubble-typing">…</p> : null}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={onSend}>
        <textarea className="text-input" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${coach.name}`} aria-label={`Message ${coach.name}`} />
        <button className="primary-button" type="submit" disabled={send.isPending || !text.trim() || (chat.data?.remaining_today ?? 0) <= 0}>Send</button>
      </form>
      <p className="label">{chat.data ? `${chat.data.remaining_today} messages left today · AI coach, not medical advice` : ""}</p>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
