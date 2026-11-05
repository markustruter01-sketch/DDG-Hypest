import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  deleteMeal, getGetFoodQueryKey, logMeal, logMealPhoto, makeMealPlan, saveFoodSetup, useGetFood,
  type FoodSetupSex, type FoodState,
} from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";
import { shownLoad, toKg, useUnits } from "@/lib/units";

/** Nutrition-lite (docs/TIERS-AND-BODY-SPEC.md §5). Plain numbers only: no colours, no "over" or "under". */
const DISCLAIMER = "Estimates, not medical advice.";
const ALLERGY = "This isn't allergy-safe: always check ingredients yourself.";
const BLOCKED = "For eating advice, please see a doctor or dietitian.";
const LOW_BMI = "Your coach keeps food at maintenance; talk to a doctor if your weight keeps dropping.";

export function FoodPage() {
  const food = useGetFood({ query: { queryKey: getGetFoodQueryKey(), retry: false }, request });
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = food.data;

  async function run(action: () => Promise<FoodState>) {
    setError(null);
    setBusy(true);
    try {
      const next = await action();
      qc.setQueryData(getGetFoodQueryKey(), next);
      if (next.notice) setNotice(next.notice);
    } catch (err) {
      setError(serverErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!f) return <main className="screen-scroll" aria-busy="true"><h1 className="screen-title">Food</h1></main>;

  return (
    <main className="screen-scroll food">
      <h1 className="screen-title">Food</h1>
      {notice ? <p className="card notice" role="alert">{notice}</p> : null}
      {f.blocked ? (
        <p className="screen-copy">{BLOCKED}</p>
      ) : !f.available ? (
        <>
          <p className="screen-copy">Daily calorie and protein targets are part of Starter. Meal plans and meal logging are part of Coaching and Pro.</p>
          <Link className="primary-button" to="/profile">See plans</Link>
        </>
      ) : !f.setup || !f.targets ? (
        <Setup busy={busy} onSave={(body) => run(() => saveFoodSetup(body, request))} />
      ) : (
        <>
          <Targets f={f} />
          {f.can_use_ai ? <LogMeal busy={busy} f={f} run={run} /> : <p className="label">Meal logging and weekly meal plans are part of Coaching and Pro.</p>}
          <Today f={f} run={run} />
          {f.can_use_ai ? <MealPlanCard busy={busy} f={f} run={run} /> : null}
          <details className="card food-edit">
            <summary>Change your details</summary>
            <Setup busy={busy} initial={f.setup} onSave={(body) => run(() => saveFoodSetup(body, request))} />
          </details>
        </>
      )}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <p className="label">{DISCLAIMER}</p>
    </main>
  );
}

type SetupBody = Parameters<typeof saveFoodSetup>[0];

function Setup({ busy, initial, onSave }: { busy: boolean; initial?: FoodState["setup"]; onSave: (b: SetupBody) => void }) {
  const units = useUnits();
  const [sex, setSex] = useState<FoodSetupSex>((initial?.sex as FoodSetupSex) ?? "unsaid");
  const [year, setYear] = useState(String(initial?.birth_year ?? ""));
  const [height, setHeight] = useState(String(initial?.height_cm ?? ""));
  const [weight, setWeight] = useState(initial ? String(shownLoad(initial.weight_kg, units)) : "");
  const [avoid, setAvoid] = useState((initial?.foods_to_avoid ?? []).join(", "));
  const [pregnant, setPregnant] = useState(false);
  const foods = avoid.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10).map((s) => s.slice(0, 40));
  const ok = Number(year) > 1900 && Number(height) >= 120 && Number(height) <= 230 && Number(weight) > 0;
  return (
    <form className="food-setup" onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ sex, birth_year: Number(year), height_cm: Number(height), weight_kg: toKg(Number(weight), units), foods_to_avoid: foods, pregnant }); }}>
      <p className="screen-copy">A few details for your daily targets. {DISCLAIMER}</p>
      <fieldset className="choice-row">
        <legend className="label">Sex, for the formula</legend>
        {(["female", "male", "unsaid"] as const).map((s) => (
          <button key={s} type="button" className={sex === s ? "chip chip-on" : "chip"} aria-pressed={sex === s} onClick={() => setSex(s)}>
            {s === "unsaid" ? "Prefer not to say" : s === "female" ? "Female" : "Male"}
          </button>
        ))}
      </fieldset>
      <label className="label">Birth year<input className="text-input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
      <label className="label">Height (cm)<input className="text-input" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
      <label className="label">Weight ({units})<input className="text-input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
      <label className="label">Foods to avoid (comma between each, up to 10)<input className="text-input" value={avoid} onChange={(e) => setAvoid(e.target.value)} /></label>
      <p className="label">{ALLERGY}</p>
      <label className="check-row"><input type="checkbox" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} /> I'm pregnant or breastfeeding</label>
      <button className="primary-button" type="submit" disabled={busy || !ok}>Save</button>
    </form>
  );
}

function Targets({ f }: { f: FoodState }) {
  const t = f.targets!;
  return (
    <section className="card food-targets">
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="stat"><span className="big-number">{f.today.kcal} / {t.kcal}</span><span className="label">kcal today / daily target</span></div>
        <div className="stat"><span className="big-number">{f.today.protein_g} / {t.protein_g}</span><span className="label">g protein today / target</span></div>
      </div>
      {t.maintenance_only ? <p className="screen-copy">{LOW_BMI}</p> : null}
    </section>
  );
}

type Run = (a: () => Promise<FoodState>) => Promise<void>;

/** Shrinks a photo in the browser before it is sent (the server never keeps it). */
async function photoData(file: File): Promise<{ media_type: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.8);
  return { media_type: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}

function LogMeal({ busy, f, run }: { busy: boolean; f: FoodState; run: Run }) {
  const [text, setText] = useState("");
  const left = f.meal_logs_left_today;
  return (
    <section className="card food-log">
      <h2 className="section-title">Log a meal</h2>
      <form onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) void run(() => logMeal({ text: t }, request)).then(() => setText("")); }}>
        <input className="text-input" maxLength={300} placeholder="e.g. two eggs on toast and a coffee with milk" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="food-actions">
          <button className="primary-button" type="submit" disabled={busy || !text.trim() || left === 0}>Estimate</button>
          <label className={busy || left === 0 ? "secondary-button disabled" : "secondary-button"}>
            Photo
            <input type="file" accept="image/*" capture="environment" hidden disabled={busy || left === 0}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void run(async () => logMealPhoto(await photoData(file), request)); }} />
          </label>
        </div>
      </form>
      <span className="label">{left} left today · photos are used once and never kept</span>
    </section>
  );
}

function Today({ f, run }: { f: FoodState; run: Run }) {
  if (!f.today.meals.length) return null;
  return (
    <section className="food-today">
      <h2 className="section-title">Today</h2>
      <ul className="program-list">
        {f.today.meals.map((m) => (
          <li key={m.id} className="card food-meal">
            <div><b>{m.text === "photo" ? "From a photo" : m.text}</b><span className="label">{m.items.map((i) => i.name).join(", ")}</span></div>
            <span>{m.kcal} kcal · {m.protein_g} g</span>
            <button type="button" className="text-link" onClick={() => void run(() => deleteMeal(m.id, request))}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SLOT: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MealPlanCard({ busy, f, run }: { busy: boolean; f: FoodState; run: Run }) {
  const [day, setDay] = useState(0);
  const plan = f.meal_plan;
  return (
    <section className="card food-plan">
      <h2 className="section-title">This week's meals</h2>
      {plan ? (
        <>
          <div className="choice-row" role="tablist">
            {plan.days.map((d, i) => <button key={d.day} type="button" role="tab" aria-selected={day === i} className={day === i ? "chip chip-on" : "chip"} onClick={() => setDay(i)}>{DAYS[i]}</button>)}
          </div>
          {plan.days[day]?.meals.map((m) => (
            <div key={m.slot} className="food-plan-meal">
              <span className="label">{SLOT[m.slot]} · {m.kcal} kcal · {m.protein_g} g</span>
              <b>{m.name}</b>
              <span className="label">{m.ingredients.join(", ")}</span>
            </div>
          ))}
          <details>
            <summary>Grocery list</summary>
            {plan.grocery.map((g) => <div key={g.aisle}><b>{g.aisle}</b><ul>{g.items.map((it) => <li key={it}>{it}</li>)}</ul></div>)}
          </details>
        </>
      ) : <p className="screen-copy">A week of simple meals and a grocery list, built for your targets.</p>}
      <button className="secondary-button" type="button" disabled={busy || f.meal_plans_left === 0} onClick={() => void run(() => makeMealPlan(request))}>
        {plan ? "Make a new plan" : "Make my meal plan"} ({f.meal_plans_left} left this week)
      </button>
      <p className="label">{ALLERGY}</p>
    </section>
  );
}
