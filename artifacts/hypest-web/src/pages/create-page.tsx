import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
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
import { errorStatus, serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

function optionalWholeNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  return Number(trimmed);
}

export function CreatePage() {
  const mine = useListMyPrograms({
    query: { queryKey: getListMyProgramsQueryKey(), retry: false },
    request,
  });
  // Studio links here with ?new=1 (open the new-program form) or ?program=<id> (open the editor).
  const [params, setParams] = useSearchParams();
  const fromLink = Number(params.get("program"));
  const [selectedId, setSelectedIdState] = useState<number | null>(Number.isInteger(fromLink) && fromLink > 0 ? fromLink : null);
  const [creating, setCreating] = useState(params.get("new") === "1");

  function setSelectedId(id: number | null) {
    setSelectedIdState(id);
    setParams(id === null ? {} : { program: String(id) }, { replace: true });
  }

  const programs = Array.isArray(mine.data) ? mine.data : null;
  const loggedOut = mine.isError && errorStatus(mine.error) === 401;

  if (loggedOut) {
    return (
      <main className="screen-scroll">
        <h1 className="screen-title">Create</h1>
        <div className="button-row">
          <Link className="primary-button" to="/login">
            Log in
          </Link>
          <Link className="secondary-button" to="/signup">
            Sign up
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Create</h1>
      {mine.isPending ? <p className="screen-copy">Loading</p> : null}
      {!mine.isPending && programs === null ? (
        <p className="error-text" role="alert">
          {mine.isError ? serverErrorText(mine.error) : "Request failed"}
        </p>
      ) : null}
      {programs && selectedId === null ? (
        <>
          <div className="button-row">
            <button className={creating ? "secondary-button" : "primary-button"} type="button" onClick={() => setCreating((open) => !open)}>
              New program
            </button>
          </div>
          {creating ? (
            <NewProgramForm
              onCreated={(id) => {
                setCreating(false);
                setSelectedId(id);
              }}
            />
          ) : null}
          {programs.length === 0 ? <p className="screen-copy">No programs yet</p> : null}
          <ul className="program-list">
            {programs.map((program) => (
              <li key={program.id}>
                <button className="program-card" type="button" onClick={() => setSelectedId(program.id)}>
                  <span className={`status-tag status-${program.status}`}>{program.status === "published" ? "Live" : "Draft"}</span>
                  <span className="program-card-title">{program.title}</span>
                  <span className="screen-copy">
                    {formatUsd(program.price_cents)} · {program.lesson_count} {program.lesson_count === 1 ? "lesson" : "lessons"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {selectedId !== null ? (
        <ProgramEditor key={selectedId} programId={selectedId} onBack={() => setSelectedId(null)} />
      ) : null}
    </main>
  );
}

function NewProgramForm({ onCreated }: { onCreated: (id: number) => void }) {
  const queryClient = useQueryClient();
  const createProgram = useCreateProgram({ request });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("5.00");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const priceCents = dollarsToCents(price);
    if (priceCents === null || priceCents < 500) {
      setError("Price must be at least $5.00");
      return;
    }
    try {
      const created = await createProgram.mutateAsync({
        data: {
          title,
          description: description === "" ? null : description,
          price_cents: priceCents,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListMyProgramsQueryKey() });
      onCreated(created.id);
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <form className="account-form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Title</span>
        <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} minLength={1} maxLength={120} required />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} />
      </label>
      <label className="field">
        <span className="field-label">Price (US$)</span>
        <input className="text-input" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required />
      </label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={createProgram.isPending}>
        Create draft
      </button>
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
  const [price, setPrice] = useState("5.00");
  const [error, setError] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
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
  }

  async function onSaveProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const priceCents = dollarsToCents(price);
    if (priceCents === null || priceCents < 500) {
      setError("Price must be at least $5.00");
      return;
    }
    try {
      await updateProgram.mutateAsync({
        id: programId,
        data: {
          title,
          description: description === "" ? null : description,
          price_cents: priceCents,
        },
      });
      await refresh();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  async function onPublish() {
    setError(null);
    try {
      await publishProgram.mutateAsync({ id: programId });
      await refresh();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  async function onUnpublish() {
    setError(null);
    try {
      await unpublishProgram.mutateAsync({ id: programId });
      await refresh();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  async function onReorder(lessonId: number, direction: -1 | 1) {
    if (!program.data) {
      return;
    }
    const ordered = [...program.data.lessons].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((lesson) => lesson.id === lessonId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ordered.length) {
      return;
    }
    const ids = ordered.map((lesson) => lesson.id);
    const swapped = [...ids];
    const current = swapped[index];
    const target = swapped[next];
    if (current === undefined || target === undefined) {
      return;
    }
    swapped[index] = target;
    swapped[next] = current;
    setError(null);
    try {
      await reorderLessons.mutateAsync({ id: programId, data: { lesson_ids: swapped } });
      await refresh();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  async function onDelete(lessonId: number) {
    setError(null);
    try {
      await deleteLesson.mutateAsync({ id: programId, lessonId });
      if (editingLessonId === lessonId) {
        setEditingLessonId(null);
      }
      await refresh();
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  const lessons = program.data ? [...program.data.lessons].sort((a, b) => a.position - b.position) : [];

  return (
    <div className="editor">
      <button className="text-link" type="button" onClick={onBack}>
        All programs
      </button>
      {program.isPending ? <p className="screen-copy">Loading</p> : null}
      {program.isError ? <p className="error-text" role="alert">{serverErrorText(program.error)}</p> : null}
      {program.data ? (
        <>
          <span className={`status-tag status-${program.data.status}`}>{program.data.status === "published" ? "Live" : "Draft"}</span>
          <form className="account-form" onSubmit={onSaveProgram}>
            <label className="field">
              <span className="field-label">Title</span>
              <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} minLength={1} maxLength={120} required />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <textarea className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} />
            </label>
            <label className="field">
              <span className="field-label">Price (US$)</span>
              <input className="text-input" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required />
            </label>
            <button className="secondary-button" type="submit" disabled={updateProgram.isPending}>
              Save program
            </button>
          </form>
          <div className="button-row">
            {program.data.status === "draft" ? (
              <button className="primary-button" type="button" onClick={onPublish} disabled={publishProgram.isPending}>
                Publish
              </button>
            ) : (
              <button className="secondary-button" type="button" onClick={onUnpublish} disabled={unpublishProgram.isPending}>
                Unpublish
              </button>
            )}
          </div>
          <h2 className="section-title">Lessons</h2>
          <ul className="program-list">
            {lessons.map((lesson, index) => (
              <li key={lesson.id} className="lesson-row">
                <span className="program-card-title">{lesson.title}</span>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => setEditingLessonId(lesson.id)}>
                    Edit
                  </button>
                  <button className="secondary-button" type="button" onClick={() => onDelete(lesson.id)} disabled={deleteLesson.isPending}>
                    Delete
                  </button>
                  <button className="secondary-button" type="button" onClick={() => onReorder(lesson.id, -1)} disabled={index === 0 || reorderLessons.isPending}>
                    Move up
                  </button>
                  <button className="secondary-button" type="button" onClick={() => onReorder(lesson.id, 1)} disabled={index === lessons.length - 1 || reorderLessons.isPending}>
                    Move down
                  </button>
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
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <h2 className="section-title">Add lesson</h2>
          <LessonForm
            submitLabel="Add lesson"
            pending={createLesson.isPending}
            onSubmit={async (data) => {
              await createLesson.mutateAsync({ id: programId, data });
              await refresh();
            }}
          />
          {error ? <p className="error-text" role="alert">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function LessonForm({
  lesson,
  submitLabel,
  pending,
  onSubmit,
}: {
  lesson?: Lesson;
  submitLabel: string;
  pending: boolean;
  onSubmit: (data: {
    title: string;
    body: string | null;
    sets: number | null;
    reps: number | null;
    duration_seconds: number | null;
    media_source: "youtube" | null;
    media_ref: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [sets, setSets] = useState(lesson?.sets?.toString() ?? "");
  const [reps, setReps] = useState(lesson?.reps?.toString() ?? "");
  const [duration, setDuration] = useState(lesson?.duration_seconds?.toString() ?? "");
  const [youtube, setYoutube] = useState(lesson?.media_ref ?? "");
  const [error, setError] = useState<string | null>(null);

  async function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedSets = optionalWholeNumber(sets);
    const parsedReps = optionalWholeNumber(reps);
    const parsedDuration = optionalWholeNumber(duration);
    if (parsedSets === undefined || parsedReps === undefined || parsedDuration === undefined) {
      setError("Sets, reps, and duration must be whole numbers");
      return;
    }
    const url = youtube.trim();
    try {
      await onSubmit({
        title,
        body: body === "" ? null : body,
        sets: parsedSets,
        reps: parsedReps,
        duration_seconds: parsedDuration,
        media_source: url === "" ? null : "youtube",
        media_ref: url === "" ? null : url,
      });
      if (!lesson) {
        setTitle("");
        setBody("");
        setSets("");
        setReps("");
        setDuration("");
        setYoutube("");
      }
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <form className="account-form" onSubmit={onFormSubmit}>
      <label className="field">
        <span className="field-label">Lesson title</span>
        <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} minLength={1} maxLength={120} required />
      </label>
      <label className="field">
        <span className="field-label">Body</span>
        <textarea className="text-input" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={4} />
      </label>
      <label className="field">
        <span className="field-label">Sets</span>
        <input className="text-input" inputMode="numeric" value={sets} onChange={(event) => setSets(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Reps</span>
        <input className="text-input" inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Duration (seconds)</span>
        <input className="text-input" inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">YouTube URL</span>
        <input className="text-input" type="url" value={youtube} onChange={(event) => setYoutube(event.target.value)} />
      </label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <button className="secondary-button" type="submit" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
