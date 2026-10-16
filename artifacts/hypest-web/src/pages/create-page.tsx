import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  getGetLibraryProgramQueryKey,
  getGetMyProgramQueryKey,
  getListMyProgramsQueryKey,
  useCreateLesson,
  useCreateProgram,
  useDeleteLesson,
  useGetMyProgram,
  useListMyPrograms,
  usePublishProgram,
  useReorderLessons,
  useUnpublishProgram,
  useUpdateLesson,
  useUpdateMyProgram,
  type Lesson,
} from "@workspace/api-client-react";
import { centsToDollarInput, dollarsToCents, formatUsd } from "@/lib/money";
import { keepCents, useAppConfig } from "@/lib/config";
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };
const MIN_PRICE_CENTS = 500;

export function CreatePage() {
  const mine = useListMyPrograms({
    query: { queryKey: getListMyProgramsQueryKey(), retry: false },
    request,
  });
  // Studio links here with ?new=1 (open the new-program form) or ?program=<id> (open the editor).
  const [params, setParams] = useSearchParams();
  const fromLink = Number(params.get("program"));
  const selectedId = Number.isInteger(fromLink) && fromLink > 0 ? fromLink : null;
  const [creating, setCreating] = useState(params.get("new") === "1");
  const select = (id: number | null) => setParams(id === null ? {} : { program: String(id) });

  const programs = Array.isArray(mine.data) ? mine.data : null;

  if (mine.isError && errorStatus(mine.error) === 401) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Create</h1>
        <div className="button-row">
          <Link className="primary-button" to="/signup">Sign up</Link>
          <Link className="secondary-button" to="/login">Log in</Link>
        </div>
      </main>
    );
  }

  if (selectedId !== null) {
    return (
      <main className="screen-scroll" style={{ paddingBottom: "calc(var(--nav-height) + 6rem)" }}>
        <ProgramEditor key={selectedId} programId={selectedId} onBack={() => select(null)} />
      </main>
    );
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Create</h1>
      {mine.isError ? <p className="error-text" role="alert">{serverErrorText(mine.error)}</p> : null}
      {creating ? (
        <NewProgramForm onCreated={(id) => { setCreating(false); select(id); }} onCancel={() => setCreating(false)} />
      ) : (
        <button className="primary-button" type="button" onClick={() => setCreating(true)} style={{ justifyContent: "space-between" }}>
          New program <Plus size={18} strokeWidth={3} aria-hidden="true" />
        </button>
      )}
      {programs && programs.length > 0 ? (
        <ul className="program-list">
          {programs.map((program) => (
            <li key={program.id}>
              <button className="program-card" type="button" onClick={() => select(program.id)}>
                <span className={`status-tag status-${program.status}`}>{program.status === "published" ? "Live" : "Draft"}</span>
                <span className="program-card-title">{program.title}</span>
                <span className="screen-copy">
                  {formatUsd(program.price_cents)} · {program.lesson_count} {program.lesson_count === 1 ? "lesson" : "lessons"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

/** Live "you keep" for a price, using the fee rates from the API. */
function KeepPreview({ price }: { price: string }) {
  const config = useAppConfig();
  const cents = dollarsToCents(price);
  if (!config || cents === null || cents < MIN_PRICE_CENTS) {
    return <span className="label">Min {formatUsd(MIN_PRICE_CENTS)}</span>;
  }
  return (
    <div className="keep">
      <div><span className="label">Your link</span><span className="big-number">{formatUsd(keepCents(cents, config.creator_brought_bps))}</span></div>
      <div><span className="label">Hypest found</span><span className="big-number">{formatUsd(keepCents(cents, config.hypest_found_bps))}</span></div>
    </div>
  );
}

function NewProgramForm({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const createProgram = useCreateProgram({ request });
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("19.00");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const priceCents = dollarsToCents(price);
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) {
      setError(`Price must be at least ${formatUsd(MIN_PRICE_CENTS)}`);
      return;
    }
    try {
      const created = await createProgram.mutateAsync({ data: { title, description: null, price_cents: priceCents } });
      await queryClient.invalidateQueries({ queryKey: getListMyProgramsQueryKey() });
      onCreated(created.id);
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <form className="account-form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Program name</span>
        <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={1} maxLength={120} placeholder="e.g. 12-Week Strength" required autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Price US$</span>
        <input className="text-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
      </label>
      <KeepPreview price={price} />
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <div className="button-row">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={createProgram.isPending}>Create</button>
      </div>
    </form>
  );
}

function ProgramEditor({ programId, onBack }: { programId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const program = useGetMyProgram(programId, {
    query: { queryKey: getGetMyProgramQueryKey(programId), retry: false },
    request,
  });
  const updateProgram = useUpdateMyProgram({ request });
  const publishProgram = usePublishProgram({ request });
  const unpublishProgram = useUnpublishProgram({ request });
  const createLesson = useCreateLesson({ request });
  const updateLesson = useUpdateLesson({ request });
  const deleteLesson = useDeleteLesson({ request });
  const reorderLessons = useReorderLessons({ request });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!program.data || hydrated.current) {
      return;
    }
    hydrated.current = true;
    setTitle(program.data.title);
    setDescription(program.data.description ?? "");
    setPrice(centsToDollarInput(program.data.price_cents));
  }, [program.data]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: getListMyProgramsQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetMyProgramQueryKey(programId) });
    await queryClient.invalidateQueries({ queryKey: getGetLibraryProgramQueryKey(programId) });
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  async function onSaveProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceCents = dollarsToCents(price);
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) {
      setError(`Price must be at least ${formatUsd(MIN_PRICE_CENTS)}`);
      return;
    }
    await run(() =>
      updateProgram.mutateAsync({
        id: programId,
        data: { title, description: description === "" ? null : description, price_cents: priceCents },
      }),
    );
    setSaved(true);
  }

  async function onMove(lessonId: number, direction: -1 | 1) {
    if (!program.data) return;
    const ids = [...program.data.lessons].sort((a, b) => a.position - b.position).map((l) => l.id);
    const index = ids.indexOf(lessonId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next] as number, ids[index] as number];
    await run(() => reorderLessons.mutateAsync({ id: programId, data: { lesson_ids: ids } }));
  }

  if (program.isError) {
    return (
      <>
        <button className="text-link" type="button" onClick={onBack}>← Programs</button>
        <p className="error-text" role="alert">{serverErrorText(program.error)}</p>
      </>
    );
  }
  if (!program.data) {
    return <p className="screen-copy">Loading</p>;
  }

  const lessons = [...program.data.lessons].sort((a, b) => a.position - b.position);
  const isLive = program.data.status === "published";

  return (
    <div className="editor">
      <div className="page-header">
        <button className="text-link" type="button" onClick={onBack}>← Programs</button>
        <span className={`status-tag status-${program.data.status}`}>{isLive ? "Live" : "Draft"}</span>
      </div>

      <form className="account-form" onSubmit={onSaveProgram} onChange={() => setSaved(false)}>
        <label className="field">
          <span className="field-label">Program name</span>
          <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={1} maxLength={120} required />
        </label>
        <label className="field">
          <span className="field-label">Price US$</span>
          <input className="text-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <KeepPreview price={price} />
        <label className="field">
          <span className="field-label">What they get</span>
          <textarea className="text-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="e.g. 4 weeks, 3 sessions a week" />
        </label>
        <button className="secondary-button" type="submit" disabled={updateProgram.isPending}>
          {saved ? "Saved ✓" : "Save"}
        </button>
      </form>

      <div className="card" style={{ padding: "var(--space-3) var(--space-4)" }}>
        <h2 className="section-title" style={{ margin: "0 0 var(--space-2)" }}>Lessons · {lessons.length}</h2>
        <ol className="lesson-list">
          {lessons.map((lesson, index) => (
            <li key={lesson.id}>
              <div className="lesson-line">
                <span className="lesson-n">{String(index + 1).padStart(2, "0")}</span>
                <button className="lesson-open" type="button" onClick={() => { setAdding(false); setEditingLessonId(editingLessonId === lesson.id ? null : lesson.id); }}>
                  <span className="lesson-title">{lesson.title}</span>
                  <span className="lesson-meta">{lessonMeta(lesson)}</span>
                </button>
                <button className="move" type="button" aria-label="Move up" onClick={() => onMove(lesson.id, -1)} disabled={index === 0 || reorderLessons.isPending}><ArrowUp size={16} /></button>
                <button className="move" type="button" aria-label="Move down" onClick={() => onMove(lesson.id, 1)} disabled={index === lessons.length - 1 || reorderLessons.isPending}><ArrowDown size={16} /></button>
              </div>
              {editingLessonId === lesson.id ? (
                <LessonForm
                  lesson={lesson}
                  submitLabel="Save lesson"
                  pending={updateLesson.isPending}
                  onSubmit={async (data) => {
                    await updateLesson.mutateAsync({ id: programId, lessonId: lesson.id, data });
                    setEditingLessonId(null);
                    await refresh();
                  }}
                  onDelete={() => run(async () => { await deleteLesson.mutateAsync({ id: programId, lessonId: lesson.id }); setEditingLessonId(null); })}
                />
              ) : null}
            </li>
          ))}
        </ol>
        {adding ? (
          <LessonForm
            submitLabel="Add lesson"
            pending={createLesson.isPending}
            onSubmit={async (data) => {
              await createLesson.mutateAsync({ id: programId, data });
              setAdding(false);
              await refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className="add-lesson" type="button" onClick={() => { setEditingLessonId(null); setAdding(true); }}>+ Add lesson</button>
        )}
      </div>

      {error ? <p className="error-text" role="alert">{error}</p> : null}

      <div className="buy-bar" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Link className="secondary-button" to={`/train/${programId}`}>Preview</Link>
        {isLive ? (
          <button className="secondary-button" type="button" onClick={() => run(() => unpublishProgram.mutateAsync({ id: programId }))} disabled={unpublishProgram.isPending}>
            Unpublish
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={() => run(() => publishProgram.mutateAsync({ id: programId }))} disabled={publishProgram.isPending || lessons.length === 0}>
            {lessons.length === 0 ? "Add a lesson first" : "Publish"}
          </button>
        )}
      </div>
    </div>
  );
}

function lessonMeta(lesson: Lesson): string {
  const parts: string[] = [];
  if (lesson.media_ref) parts.push("Video");
  if (lesson.sets !== null && lesson.reps !== null) parts.push(`${lesson.sets} × ${lesson.reps}`);
  else if (lesson.sets !== null) parts.push(`${lesson.sets} sets`);
  else if (lesson.reps !== null) parts.push(`${lesson.reps} reps`);
  if (lesson.duration_seconds !== null) parts.push(`${Math.round(lesson.duration_seconds / 6) / 10} min`);
  if (lesson.body) parts.push("Notes");
  return parts.join(" · ") || "Empty";
}

type LessonData = {
  title: string;
  body: string | null;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  media_source: "youtube" | null;
  media_ref: string | null;
};

/** Empty → null; whole number → number; anything else → undefined (invalid). */
function optionalWholeNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Minutes (decimals allowed) → whole seconds. */
function optionalMinutes(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Math.round(Number(trimmed) * 60) : undefined;
}

function LessonForm({
  lesson,
  submitLabel,
  pending,
  onSubmit,
  onDelete,
  onCancel,
}: {
  lesson?: Lesson;
  submitLabel: string;
  pending: boolean;
  onSubmit: (data: LessonData) => Promise<void>;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [youtube, setYoutube] = useState(lesson?.media_ref ?? "");
  const [sets, setSets] = useState(lesson?.sets?.toString() ?? "");
  const [reps, setReps] = useState(lesson?.reps?.toString() ?? "");
  const [minutes, setMinutes] = useState(lesson?.duration_seconds != null ? String(Math.round(lesson.duration_seconds / 6) / 10) : "");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [error, setError] = useState<string | null>(null);

  async function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedSets = optionalWholeNumber(sets);
    const parsedReps = optionalWholeNumber(reps);
    const parsedSeconds = optionalMinutes(minutes);
    if (parsedSets === undefined || parsedReps === undefined || parsedSeconds === undefined) {
      setError("Sets and reps are whole numbers; time is minutes");
      return;
    }
    const url = youtube.trim();
    try {
      await onSubmit({
        title,
        body: body === "" ? null : body,
        sets: parsedSets,
        reps: parsedReps,
        duration_seconds: parsedSeconds,
        media_source: url === "" ? null : "youtube",
        media_ref: url === "" ? null : url,
      });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <form className="lesson-form" onSubmit={onFormSubmit}>
      <label className="field">
        <span className="field-label">Lesson name</span>
        <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={1} maxLength={120} placeholder="e.g. Glute bridge" required autoFocus={!lesson} />
      </label>
      <label className="field">
        <span className="field-label">YouTube link</span>
        <input className="text-input" type="url" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtu.be/…" />
      </label>
      <div className="three-up">
        <label className="field"><span className="field-label">Sets</span><input className="text-input" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} /></label>
        <label className="field"><span className="field-label">Reps</span><input className="text-input" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></label>
        <label className="field"><span className="field-label">Minutes</span><input className="text-input" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      </div>
      <label className="field">
        <span className="field-label">Notes</span>
        <textarea className="text-input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={3} placeholder="e.g. Pause at the top" />
      </label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <div className="button-row">
        {onDelete ? <button className="secondary-button" type="button" onClick={onDelete}>Delete</button> : null}
        {onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button> : null}
        <button className="secondary-button ink-button" type="submit" disabled={pending}>{submitLabel}</button>
      </div>
    </form>
  );
}
