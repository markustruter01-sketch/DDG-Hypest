import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  createNextPlan, createPlan, getGetCoachChatQueryKey, getGetTrainingQueryKey, useGetCoachChat, useSendCoachMessage, type Coach,
} from "@workspace/api-client-react";
import { request, useTraining } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

/**
 * Chat with your coach (Plans and Coaching, AI on; build plan 2.4). Safety words get a fixed reply from the server,
 * not the AI. The coach can offer a one-tap "start a new block" button; nothing is built until the member taps it.
 */
export function CoachChat({ coach }: { coach: Coach }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const training = useTraining();
  const chat = useGetCoachChat({ query: { queryKey: getGetCoachChatQueryKey() }, request });
  const send = useSendCoachMessage({ request });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const messages = chat.data?.messages ?? [];
  const left = chat.data?.remaining_today ?? 0;
  const perDay = chat.data?.per_day ?? 0;
  const lastOffer = [...messages].reverse().find((m) => m.action === "build_block")?.id ?? null;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, send.isPending]);

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const t = text.trim();
    if (!t) return;
    setError(null);
    try {
      const next = await send.mutateAsync({ data: { text: t } });
      queryClient.setQueryData(getGetCoachChatQueryKey(), next);
      // A safety stop pauses the plan, and a swap or new target changes it: refresh it.
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      setText("");
    } catch (err) {
      setError(serverErrorText(err)); // at the limit this is the coach's own line
    }
  }

  async function buildBlock() {
    setError(null);
    setBuilding(true);
    try {
      if (training.data?.plan) await createNextPlan(request);
      else await createPlan(request);
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetCoachChatQueryKey() });
      navigate("/plan");
    } catch (err) {
      setError(serverErrorText(err));
    } finally {
      setBuilding(false);
    }
  }

  return (
    <section className="coach-chat coach-chat-full" aria-label={`Chat with ${coach.name}`}>
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? <p className="label">Ask {coach.name} about form, your plan or staying on track. {coach.name} can remember your schedule and kit.</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "member" ? "bubble bubble-me" : "bubble"}>
            <p>{m.text}</p>
            {m.id === lastOffer ? (
              <button type="button" className="primary-button" onClick={buildBlock} disabled={building}>Build my new block</button>
            ) : null}
          </div>
        ))}
        {send.isPending ? <p className="bubble bubble-typing">…</p> : null}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={onSend}>
        <textarea className="text-input" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${coach.name}`} aria-label={`Message ${coach.name}`} />
        <button className="primary-button" type="submit" disabled={send.isPending || !text.trim() || left <= 0}>Send</button>
      </form>
      <p className="label">{chat.data ? `${perDay - left} of ${perDay} today · AI coach, not medical advice` : ""}</p>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
