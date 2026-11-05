import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { saveOnboardingDraft,
  getGetTrainingQueryKey,
  useCreatePlan,
  usePreviewPlan,
  useSaveTrainingProfile,
  type PlanView,
  type TrainingAnswers,
} from "@workspace/api-client-react";
import { Offers } from "@/components/offers";
import { AREA_LABEL, EQUIPMENT_LABEL, EXPERIENCE_LABEL, GOAL_LABEL, coachById, dose, img, request, useCoaches, useTraining } from "@/lib/coaching";
import { errorStatus, serverErrorText } from "@/lib/server-error";
import { useUnits } from "@/lib/units";
import { useAppConfig } from "@/lib/config";
import { TRIAL_KEY } from "@/pages/trial-page";

type Goal = TrainingAnswers["goal"];
type Experience = TrainingAnswers["experience"];
type Equipment = TrainingAnswers["equipment"][number];
type Area = TrainingAnswers["avoid_areas"][number];

type Option<T> = readonly [T, string];

// Option lists live outside the JSX: Replit's dev plugin can't parse JSX type arguments or casts inside props.
const EXPERIENCE_OPTIONS: Option<Experience>[] = (["beginner", "intermediate", "advanced"] as Experience[]).map((e) => [e, EXPERIENCE_LABEL[e] ?? e]);
const DAY_OPTIONS: Option<number>[] = [2, 3, 4, 5, 6].map((d) => [d, String(d)]);
const MINUTE_OPTIONS: Option<20 | 30 | 45 | 60>[] = ([20, 30, 45, 60] as const).map((m) => [m, String(m)]);
const EQUIPMENT_OPTIONS: Option<Equipment>[] = (Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((e) => [e, EQUIPMENT_LABEL[e] ?? e]);
const AREA_OPTIONS: Option<Area>[] = (Object.keys(AREA_LABEL) as Area[]).map((a) => [a, AREA_LABEL[a] ?? a]);

function Chips<T extends string | number>({ options, value, onChange, label }: { options: readonly Option<T>[]; value: T | T[]; onChange: (v: T) => void; label: string }) {
  const on = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <fieldset className="chips">
      <legend className="label">{label}</legend>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" className={on(v) ? "chip chip-on" : "chip"} aria-pressed={on(v)} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </fieldset>
  );
}

/** One health question: Yes / No. */
function YesNo({ question, value, onChange }: { question: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="chips screen-question">
      <legend className="screen-copy">{question}</legend>
      {([[false, "No"], [true, "Yes"]] as const).map(([v, text]) => (
        <button key={text} type="button" className={value === v ? "chip chip-on" : "chip"} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </fieldset>
  );
}

/** Two short screens of taps and a health check, then the real week 1 for free. Deeper questions come later for Coaching members. */
export function OnboardingPage() {
  const { coachId = "" } = useParams();
  const coaches = useCoaches();
  const coach = coachById(coaches.data, coachId);
  const training = useTraining();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = usePreviewPlan();
  const save = useSaveTrainingProfile({ request });
  const create = useCreatePlan({ request });

  const config = useAppConfig();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [days, setDays] = useState(3);
  const [minutes, setMinutes] = useState<20 | 30 | 45 | 60>(30);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [health, setHealth] = useState(false);
  const [screen, setScreen] = useState<(boolean | null)[]>([]);
  const [cleared, setCleared] = useState(false);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const units = useUnits();

  if (coaches.isSuccess && !coach) return <Navigate to="/coaches" replace />;
  if (!coach) return <main className="screen-scroll" aria-busy="true" />;

  const questions = config?.screening.questions ?? [];
  const screenAnswers = questions.map((_, i) => screen[i] ?? null);
  const anyYes = screenAnswers.some((a) => a === true);
  const screenDone = questions.length > 0 && screenAnswers.every((a) => a !== null) && (!anyYes || cleared);
  const loggedIn = training.isSuccess;
  const access = training.data?.access;
  const chosenGoal = goal ?? (coach.goals[0] as Goal);
  const answers: TrainingAnswers = {
    coach_id: coach.id, goal: chosenGoal, experience, days_per_week: days, minutes, equipment, avoid_areas: areas, units, health_accepted: true,
    screening: { answers: screenAnswers.map((a) => a === true), cleared: anyYes && cleared },
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const goalOptions: Option<Goal>[] = (coach.goals as Goal[]).map((g) => [g, GOAL_LABEL[g] ?? g]);

  async function buildPreview() {
    setError(null);
    try {
      setPlan(await preview.mutateAsync({ data: answers }));
      setStep(4);
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  /** Spec 3.1 §4.2: keep the answers as a draft, then run day 1 in the trial player. */
  async function tryDayOne() {
    setError(null);
    try {
      await saveOnboardingDraft(answers, request);
      sessionStorage.setItem(TRIAL_KEY, JSON.stringify(plan?.sessions[0]));
      navigate("/try");
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  async function savePlan() {
    setError(null);
    if (!loggedIn) {
      try {
        await saveOnboardingDraft(answers, request);
      } catch (err) {
        setError(serverErrorText(err));
        return;
      }
      navigate("/signup?then=plan");
      return;
    }
    try {
      await save.mutateAsync({ data: answers });
      await create.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
      navigate("/");
    } catch (err) {
      if (errorStatus(err) === 402) {
        await queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey() });
        setError(null);
        return;
      }
      setError(serverErrorText(err));
    }
  }

  // Free builds its first block (week 1 open; spec 3.1 §1), so nobody has to pay to start.
  const needsPayment = false;

  return (
    <main className="onboard">
      <header className="onboard-head">
        <div className="onboard-top">
          <Link className="text-link" to={`/coaches/${coach.id}`}>← Back</Link>
          <img className="coach-face" src={img(coach.photo)} alt={`${coach.name}, AI coach`} />
        </div>
        <div className="onboard-steps" role="img" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((n) => <span key={n} className={n <= step ? "on" : undefined} />)}
        </div>
      </header>

      {step === 1 ? (
        <section className="onboard-body">
          <h1 className="screen-title">Hi, I'm {coach.name}.<br />What's the goal?</h1>
          <Chips label="Goal" options={goalOptions} value={chosenGoal} onChange={(v) => setGoal(v)} />
          <Chips label="Training so far" options={EXPERIENCE_OPTIONS} value={experience} onChange={(v) => setExperience(v)} />
          <Chips label="Days a week" options={DAY_OPTIONS} value={days} onChange={(v) => setDays(v)} />
          <Chips label="Minutes a session" options={MINUTE_OPTIONS} value={minutes} onChange={(v) => setMinutes(v)} />
          <button className="primary-button onboard-next" type="button" onClick={() => setStep(2)}>Next →</button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboard-body">
          <h1 className="screen-title">What have you got?</h1>
          <Chips label="Equipment (none is fine)" options={EQUIPMENT_OPTIONS} value={equipment} onChange={(v) => setEquipment(toggle(equipment, v))} />
          <Chips label="Anything sore or injured?" options={AREA_OPTIONS} value={areas} onChange={(v) => setAreas(toggle(areas, v))} />
          <div className="button-row onboard-next">
            <button className="secondary-button" type="button" onClick={() => setStep(1)}>Back</button>
            <button className="primary-button" type="button" onClick={() => setStep(3)}>Next →</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="onboard-body">
          <h1 className="screen-title">Quick health check</h1>
          {questions.map((q, i) => (
            <YesNo key={q} question={q} value={screenAnswers[i] ?? null} onChange={(v) => setScreen(questions.map((_, j) => (j === i ? v : screenAnswers[j] ?? null)))} />
          ))}
          {anyYes && config ? (
            <div className="card screen-advice" role="note">
              <p className="screen-copy">{config.screening.yes_advice}</p>
              <label className="health-check">
                <input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} />
                <span>{config.screening.cleared_label}</span>
              </label>
            </div>
          ) : null}
          <label className="health-check">
            <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} />
            <span>I'm training at my own risk. If I have a health condition, injury or am pregnant, I'll check with a doctor first.</span>
          </label>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <div className="button-row onboard-next">
            <button className="secondary-button" type="button" onClick={() => setStep(2)}>Back</button>
            <button className="primary-button" type="button" onClick={buildPreview} disabled={!health || !screenDone || preview.isPending}>Build my plan</button>
          </div>
        </section>
      ) : null}

      {step === 4 && plan ? (
        <section className="onboard-body">
          <h1 className="screen-title">Your week 1</h1>
          <p className="label">{coach.name} · {GOAL_LABEL[chosenGoal]} · {days} days · {minutes} min</p>
          <div className="preview-week">
            {plan.sessions.map((s) => (
              <article key={s.day} className="card preview-day rise" style={{ animationDelay: `${s.day * 90}ms` }}>
                <span className="label">Day {s.day}</span>
                <ul>
                  {s.items.map((it) => (
                    <li key={it.exercise_id}><span>{it.name}</span><b>{dose(it)}</b></li>
                  ))}
                </ul>
              </article>
            ))}
            <div className="preview-locked" aria-label="Weeks 2 to 4 unlock with a plan">
              <span className="big-number">+3</span>
              <span className="label">weeks that build on this</span>
            </div>
          </div>
          {needsPayment && access ? (
            <Offers access={access} onUnlocked={savePlan} beforePay={() => save.mutateAsync({ data: answers })} returnTo="/" />
          ) : (
            <>
              <button className="primary-button" type="button" onClick={savePlan} disabled={save.isPending || create.isPending}>
                {loggedIn ? "Start my plan →" : "Save my plan: free →"}
              </button>
              {!loggedIn && plan.sessions[0] ? (
                <button className="secondary-button" type="button" onClick={tryDayOne}>Try day 1 now, no account</button>
              ) : null}
            </>
          )}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
