import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import {
  getGetTrainingQueryKey,
  useCompleteSession,
  useLogSet,
  useReportPain,
  type PainResult,
  type PlanItemView,
} from "@workspace/api-client-react";
import { AREA_LABEL, coachById, dose, request, useCoaches, useTraining } from "@/lib/coaching";
import { FinishCard, type FinishStats } from "@/components/finish-card";
import { nextSession } from "@/pages/today-page";
import { serverErrorText } from "@/lib/server-error";
import { loadStep, shownLoad, targetLoad, toKg, useUnits, type Units } from "@/lib/units";
import { useRestTimer, useScreenAwake } from "@/lib/gym";
import { platesFor, platesText } from "@/lib/plates";

type SetEntry = { done: boolean; reps: number; load: number; seconds: number };

/** load is in the member's units (kg or lb). */
function initialSets(item: PlanItemView, units: Units): SetEntry[] {
  return Array.from({ length: item.sets }, (_, i) => {
    const log = item.logs.find((l) => l.set_number === i + 1);
    return {
      done: Boolean(log),
      reps: log?.reps ?? item.reps ?? 0,
      load: log?.load_kg != null ? shownLoad(log.load_kg, units) : item.target_load_kg ? targetLoad(item.target_load_kg, units) : 0,
      seconds: log?.seconds ?? item.seconds ?? 0,
    };
  });
}

/** One exercise at a time, big numbers, tick sets, rest timer, this-hurts. Dark, like a player. */
export function SessionPage() {
  const params = useParams();
  const sessionId = Number(params.sessionId);
  const training = useTraining();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const complete = useCompleteSession({ request });
  const logSet = useLogSet({ request });
  const session = training.data?.plan?.sessions.find((s) => s.id === sessionId) ?? null;
  const canLog = training.data?.access.level === "tier2";
  const units = useUnits();
  const [index, setIndex] = useState(0);
  const [sets, setSets] = useState<Record<number, SetEntry[]>>({});
  const restTimer = useRestTimer();
  const rest = restTimer.left;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hurtOpen, setHurtOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState<FinishStats | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const coaches = useCoaches();

  useScreenAwake();

  const item = session?.items.at(index) ?? null;
  const entries = useMemo(() => (item ? sets[item.id ?? 0] ?? initialSets(item, units) : []), [item, sets, units]);

  if (training.isSuccess && !session) {
    return <main className="player"><Link className="text-link" to="/" style={{ color: "var(--color-on-dark)" }}>← Today</Link><p>Session not found.</p></main>;
  }
  if (!session || !item) return <main className="player" aria-busy="true" />;
  const itemId = item.id ?? 0;

  function update(i: number, patch: Partial<SetEntry>) {
    const next = entries.map((e, j) => (j === i ? { ...e, ...patch } : e));
    setSets((all) => ({ ...all, [itemId]: next }));
    return next;
  }

  async function tick(i: number) {
    const entry = entries[i];
    if (!entry) return;
    const nowDone = !entry.done;
    update(i, { done: nowDone });
    if (nowDone) {
      restTimer.start(item!.rest_seconds);
      if (canLog) {
        try {
          await logSet.mutateAsync({ itemId, setNumber: i + 1, data: {
            reps: item!.measure === "reps" ? entry.reps : null,
            seconds: item!.measure === "time" ? entry.seconds : null,
            load_kg: item!.weighted ? toKg(entry.load, units) : null,
          } });
        } catch {
          update(i, { done: false });
          setSaveError(`Set ${i + 1} didn't save (no signal?). Tap it again.`);
          return;
        }
        setSaveError(null);
      }
    }
  }

  async function finish() {
    setFinishError(null);
    const all = session!.items.map((it) => sets[it.id ?? 0] ?? initialSets(it, units));
    const ticked = all.flat().filter((e) => e.done).length;
    const volume = session!.items.reduce(
      (sum, it, k) => (it.weighted && it.measure === "reps" ? sum + (all[k] ?? []).filter((e) => e.done).reduce((v, e) => v + e.reps * e.load, 0) : sum),
      0,
    );
    const minutes = Math.round((Date.now() - startedAt) / 60_000);
    try {
      await complete.mutateAsync({ sessionId });
    } catch (err) {
      setFinishError(serverErrorText(err));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
    setFinished({
      week: session!.week, day: session!.day, exercises: session!.items.length, setsDone: ticked, setsTotal: all.flat().length,
      minutes: minutes >= 1 && minutes <= 240 ? minutes : null, volume: volume > 0 ? Math.round(volume) : null, units,
    });
  }

  if (finished) {
    const plan = training.data?.plan;
    const upNext = plan ? nextSession(plan) : null;
    const coachName = coachById(coaches.data, plan?.coach_id)?.name ?? "your coach";
    return (
      <FinishCard
        stats={finished}
        coachName={coachName}
        next={upNext ? `Next: Week ${upNext.week} · Day ${upNext.day}.` : "That was the last session of this block."}
        onDone={() => navigate("/")}
      />
    );
  }

  const total = session.items.length;
  const last = index === total - 1;
  const anyTicked = Object.values(sets).some((list) => list.some((e) => e.done));
  const plates = item.barbell && item.weighted ? platesFor(entries.find((e) => !e.done)?.load ?? entries.at(-1)?.load ?? 0, units) : null;

  return (
    <main className="player session">
      <div className="page-header">
        <button type="button" className="text-link end-link" onClick={() => (anyTicked ? setEndOpen(true) : navigate("/"))}>✕ End</button>
        <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>{index + 1} / {total}</span>
      </div>
      <div className="progress" role="img" aria-label={`Exercise ${index + 1} of ${total}`}>
        {session.items.map((it, i) => <span key={it.id ?? i} className={i <= index ? "on" : undefined} />)}
      </div>

      <div className="session-head">
        <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>Week {session.week} · Day {session.day}{item.swapped_from ? " · swapped for you" : ""}</span>
        {index === 0 && session.note ? <p className="player-body session-note-dark">{session.note}</p> : null}
        <h1 className="hero-title" style={{ margin: 0, fontSize: "2.6rem" }}>{item.name}</h1>
        <p className="player-body">{item.cue}</p>
        <span className="session-dose">{dose(item)}{item.target_load_kg ? ` @ ${targetLoad(item.target_load_kg, units)} ${units}` : ""}</span>
        {plates ? <span className="plates label">Bar {plates.bar} {units} · {platesText(plates, units)}</span> : null}
      </div>

      <ol className="set-list">
        {entries.map((e, i) => (
          <li key={i} className={e.done ? "set set-done" : "set"}>
            <span className="set-n">{i + 1}</span>
            {item.weighted ? (
              <Stepper label={units} value={e.load} step={loadStep(units)} disabled={!canLog} onChange={(v) => update(i, { load: v })} />
            ) : null}
            {item.measure === "reps" ? (
              <Stepper label="reps" value={e.reps} step={1} disabled={!canLog} onChange={(v) => update(i, { reps: v })} />
            ) : (
              <span className="set-time">{dose({ sets: 1, reps: null, seconds: e.seconds })}</span>
            )}
            <button type="button" className="set-tick" aria-pressed={e.done} aria-label={`Set ${i + 1} done`} onClick={() => tick(i)}>
              <Check size={20} strokeWidth={3.5} />
            </button>
          </li>
        ))}
      </ol>
      {!canLog ? <p className="label lock-note">Save your numbers with Coaching</p> : null}
      {saveError ? <p className="error-text error-on-dark" role="alert">{saveError}</p> : null}

      {rest > 0 ? (
        <button type="button" className="rest-bar" onClick={restTimer.stop}>
          <span>Rest</span><b>{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}</b><span>Skip</span>
        </button>
      ) : null}

      <button type="button" className="hurt-link" onClick={() => setHurtOpen(true)}>This hurts</button>

      <div className="player-nav">
        <button className="secondary-button" type="button" onClick={() => setIndex(index - 1)} disabled={index === 0}>← Back</button>
        {last ? (
          <button className="primary-button" type="button" onClick={finish} disabled={complete.isPending}>Finish ✓</button>
        ) : (
          <button className="primary-button" type="button" onClick={() => { restTimer.stop(); setSaveError(null); setIndex(index + 1); }}>Next →</button>
        )}
      </div>

      {finishError ? <p className="error-text" role="alert">{finishError}</p> : null}
      {hurtOpen ? <HurtSheet item={item} onClose={() => setHurtOpen(false)} /> : null}
      {endOpen ? (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="End session?">
          <div className="sheet">
            <h2 className="section-title" style={{ margin: 0 }}>End this session?</h2>
            <p className="screen-copy">
              {canLog ? "Sets you ticked are saved. The session stays open, so you can finish it later from Today." : "The session stays open, so you can do it later from Today."}
            </p>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => setEndOpen(false)}>Keep going</button>
              <button className="primary-button" type="button" onClick={() => navigate("/")}>End</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/** − and + are 44 px (gym-floor taps); tap the number to type it on the phone's keypad (build plan 1.5). */
function Stepper({ label, value, step, onChange, disabled }: { label: string; value: number; step: number; onChange: (v: number) => void; disabled: boolean }) {
  const [typing, setTyping] = useState<string | null>(null);
  const commit = () => {
    const v = Number((typing ?? "").replace(",", "."));
    if (typing !== null && Number.isFinite(v) && v >= 0 && v <= 2000) onChange(Math.round(v * 100) / 100);
    setTyping(null);
  };
  return (
    <span className={disabled ? "stepper stepper-locked" : "stepper"}>
      <button type="button" aria-label={`Less ${label}`} disabled={disabled} onClick={() => onChange(Math.max(0, value - step))}><Minus size={18} /></button>
      {typing !== null ? (
        <input className="stepper-input" type="text" inputMode="decimal" autoFocus aria-label={label} value={typing}
          onChange={(e) => setTyping(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setTyping(null); }} />
      ) : (
        <button type="button" className="stepper-value" aria-label={`${value} ${label}: tap to type`} disabled={disabled} onClick={() => setTyping(String(value))}><b>{value}</b></button>
      )}
      <small>{label}</small>
      <button type="button" aria-label={`More ${label}`} disabled={disabled} onClick={() => onChange(value + step)}><Plus size={18} /></button>
    </span>
  );
}

const AREAS = ["knee", "lower_back", "shoulder", "wrist", "hip", "ankle", "neck"] as const;

function HurtSheet({ item, onClose }: { item: PlanItemView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const report = useReportPain({ request });
  const [area, setArea] = useState<(typeof AREAS)[number] | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<PainResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    try {
      setResult(await report.mutateAsync({ itemId: item.id ?? 0, data: { text: text || `${area ?? "it"} hurts`, ...(area ? { area } : {}) } }));
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="This hurts">
      <div className="sheet">
        {result ? (
          <>
            <h2 className="section-title" style={{ margin: 0 }}>{result.stopped ? "Stop here" : result.swapped_to ? "Swapped" : "Got it"}</h2>
            <p className={result.stopped ? "error-text" : "screen-copy"}>{result.message}</p>
            <button className="primary-button" type="button" onClick={onClose}>OK</button>
          </>
        ) : (
          <>
            <h2 className="section-title" style={{ margin: 0 }}>What hurts?</h2>
            <div className="chips">
              {AREAS.map((a) => (
                <button key={a} type="button" className={area === a ? "chip chip-on" : "chip"} aria-pressed={area === a} onClick={() => setArea(a)}>{AREA_LABEL[a]}</button>
              ))}
            </div>
            <label className="field">
              <span className="field-label">How does it feel? (optional)</span>
              <input className="text-input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="e.g. tight, achy, sharp" />
            </label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
              <button className="primary-button" type="button" onClick={send} disabled={(!area && !text) || report.isPending}>Tell coach</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
