import { getGetAdminSummaryQueryKey, useGetAdminSummary } from "@workspace/api-client-react";
import { errorStatus } from "@/lib/server-error";

const KIND: Record<string, string> = { intro_plan: "First plan", plan: "One plan", tier1: "Plans", tier2: "Coaching" };
const when = (d: string | Date) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Owner's view (ADMIN_EMAILS only). Not in the menu: open /admin. Read-only. */
export function AdminPage() {
  const q = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey(), retry: false, refetchInterval: 60_000 }, request: { credentials: "include" } });
  if (q.isError) return <main className="screen-scroll"><h1 className="screen-title">{errorStatus(q.error) === 404 || errorStatus(q.error) === 401 ? "Not found" : "Couldn't load"}</h1></main>;
  const s = q.data;
  if (!s) return <main className="screen-scroll" aria-busy="true"><h1 className="screen-title">Admin</h1></main>;

  return (
    <main className="screen-scroll admin">
      <div className="page-header">
        <h1 className="screen-title">Admin</h1>
        <span className="label">{when(s.generated_at)}</span>
      </div>
      <div className="admin-switches">
        <span className={s.switches.payments !== "off" ? "chip chip-on" : "chip"}>Payments {s.switches.payments}</span>
        <span className={s.switches.ai ? "chip chip-on" : "chip"}>AI {s.switches.ai ? "on" : "off"}</span>
        <span className={s.switches.email ? "chip chip-on" : "chip"}>Email {s.switches.email ? "on" : "off"}</span>
        <span className={s.switches.alerts ? "chip chip-on" : "chip"}>Alerts {s.switches.alerts ? "on" : "off"}</span>
      </div>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="card stat"><span className="big-number">{s.members.total}</span><span className="label">Members</span></div>
        <div className="card stat"><span className="big-number">{s.members.new_7d}</span><span className="label">New, 7 days</span></div>
        <div className="card stat"><span className="big-number">{s.activity_7d.sessions_done}</span><span className="label">Sessions, 7 days</span></div>
        <div className="card stat"><span className="big-number">{s.activity_7d.plans_built}</span><span className="label">Plans, 7 days</span></div>
      </div>
      <section className="card admin-block">
        <h2 className="section-title">Active memberships</h2>
        {s.memberships.map((m) => <div key={m.kind} className="admin-row"><span>{KIND[m.kind] ?? m.kind}</span><b>{m.live}</b><span className="label">{m.test} test</span></div>)}
      </section>
      <section className="card admin-block">
        <h2 className="section-title">AI this month</h2>
        <div className="admin-row"><span>Spend</span><b>US${s.ai.month_spend_usd.toFixed(2)}</b><span className="label">of US${s.ai.budget_usd}</span></div>
        <div className="admin-row"><span>Calls</span><b>{s.ai.calls_month}</b><span className="label">{s.ai.failed_month} failed</span></div>
        <div className="admin-row"><span>Chat, 7 days</span><b>{s.activity_7d.chat_messages}</b><span className="label">{s.activity_7d.sets_logged} sets logged</span></div>
      </section>
      <section className="card admin-block">
        <h2 className="section-title">Paused plans (safety)</h2>
        {s.paused_plans.length === 0 ? <p className="label">None</p> : s.paused_plans.map((p) => <div key={p.plan_id} className="admin-item"><span>Member #{p.member_id}</span><span className="label">{p.reason ?? ""}</span></div>)}
      </section>
      <section className="card admin-block">
        <h2 className="section-title">Stripe events</h2>
        {s.billing_events.length === 0 ? <p className="label">None yet</p> : s.billing_events.map((e) => <div key={e.id} className="admin-item"><span>{e.type}</span><span className="label">{e.outcome}{e.livemode ? " · LIVE" : ""} · {when(e.received_at)}</span></div>)}
      </section>
    </main>
  );
}
