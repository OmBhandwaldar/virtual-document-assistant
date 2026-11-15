"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Minus, PenLine, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuestionTypes, QuizAnswer } from "@/lib/types";

interface Question {
  id: string;
  type: "MCQ" | "SAQ" | "LAQ";
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

interface BreakdownRow {
  questionId: string;
  correct: boolean;
}

interface QuizGeneratorProps {
  chatId: string | null;
  hasDocuments: boolean;
  onExit: () => void;
  onSaveProgress: (score: number, total: number, answers: QuizAnswer[], questionTypes: QuestionTypes) => void;
}

type Phase = "config" | "generating" | "taking" | "submitting" | "results";

const TYPES: { key: keyof QuestionTypes; label: string; hint: string }[] = [
  { key: "mcq", label: "Multiple choice", hint: "Marked automatically" },
  { key: "saq", label: "Short answer", hint: "Compare with a model answer" },
  { key: "laq", label: "Long answer", hint: "Compare with an answer outline" },
];

const TYPE_LABEL: Record<Question["type"], string> = { MCQ: "Multiple choice", SAQ: "Short answer", LAQ: "Long answer" };
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuizGenerator({ chatId, hasDocuments, onExit, onSaveProgress }: QuizGeneratorProps) {
  const [counts, setCounts] = useState<QuestionTypes>({ mcq: 4, saq: 1, laq: 0 });
  const [phase, setPhase] = useState<Phase>("config");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [breakdown, setBreakdown] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const total = counts.mcq + counts.saq + counts.laq;
  const ready = !!chatId && hasDocuments;

  const generate = async () => {
    if (!chatId) return;
    setPhase("generating");
    setError("");
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, counts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The quiz could not be generated.");
      if (!data.questions?.length) throw new Error("No questions were generated. Try again.");
      setQuizId(data.quizId);
      setQuestions(data.questions);
      setAnswers({});
      setBreakdown({});
      setCurrent(0);
      setPhase("taking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The quiz could not be generated.");
      setPhase("config");
    }
  };

  const submit = async () => {
    if (!quizId || !chatId) return;
    setPhase("submitting");
    setError("");
    try {
      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, quizId, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Your answers could not be submitted.");
      const map: Record<string, boolean> = {};
      for (const row of (data.breakdown ?? []) as BreakdownRow[]) map[row.questionId] = !!row.correct;
      setBreakdown(map);

      // Only multiple choice is auto-marked reliably (written answers are checked by exact match server-side).
      const mcqs = questions.filter((q) => q.type === "MCQ");
      const mcqCorrect = mcqs.filter((q) => map[q.id]).length;
      if (mcqs.length > 0) {
        onSaveProgress(
          mcqCorrect,
          mcqs.length,
          questions.map((q) => ({ questionId: q.id, userAnswer: answers[q.id] ?? "", isCorrect: !!map[q.id] })),
          {
            mcq: questions.filter((q) => q.type === "MCQ").length,
            saq: questions.filter((q) => q.type === "SAQ").length,
            laq: questions.filter((q) => q.type === "LAQ").length,
          }
        );
      }
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your answers could not be submitted.");
      setPhase("taking");
    }
  };

  if (phase === "generating" || phase === "submitting") {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="mt-4 font-serif text-[22px]">{phase === "generating" ? "Writing your questions…" : "Marking your answers…"}</p>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          {phase === "generating" ? "Drawing on the documents in this session." : "This only takes a moment."}
        </p>
      </Centered>
    );
  }

  if (phase === "taking") {
    return (
      <TakeQuiz
        questions={questions}
        current={current}
        setCurrent={setCurrent}
        answers={answers}
        setAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
        error={error}
        onSubmit={submit}
        onQuit={() => setPhase("config")}
      />
    );
  }

  if (phase === "results") {
    return (
      <Results
        questions={questions}
        answers={answers}
        breakdown={breakdown}
        onNew={() => setPhase("config")}
        onExit={onExit}
      />
    );
  }

  // config
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[40rem] px-5 py-12 sm:px-8">
        <p className="eyebrow mb-4">Quiz</p>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.6rem)] leading-[1.1] tracking-[-0.02em]">Test yourself</h1>
        <p className="mt-4 max-w-[32rem] text-[15px] leading-relaxed text-muted-foreground">
          Questions are written from the documents in this session. Choose the mix you want.
        </p>

        {!ready && (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-[14px]">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--highlight-foreground)]" />
            <p className="text-muted-foreground">
              {chatId ? "Add at least one document to this session first." : "Start a session and add a document first."}
            </p>
          </div>
        )}

        <fieldset className="mt-10" disabled={!ready}>
          <legend className="eyebrow mb-3">Question mix</legend>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
            {TYPES.map(({ key, label, hint }) => (
              <li key={key} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p id={`lbl-${key}`} className="text-[14.5px] font-medium">
                    {label}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">{hint}</p>
                </div>
                <Stepper
                  labelledBy={`lbl-${key}`}
                  value={counts[key]}
                  onChange={(v) => setCounts((c) => ({ ...c, [key]: v }))}
                />
              </li>
            ))}
          </ul>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 flex items-center gap-2 text-[13.5px] text-danger">
            <AlertCircle className="size-4" /> {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="font-mono text-[12px] text-muted-foreground tabular">
            {total} question{total === 1 ? "" : "s"}
          </p>
          <Button size="lg" onClick={generate} disabled={!ready || total === 0}>
            Generate quiz
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, labelledBy }: { value: number; onChange: (v: number) => void; labelledBy: string }) {
  const set = (v: number) => onChange(Math.min(10, Math.max(0, v)));
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex items-center rounded-lg border border-border bg-background p-0.5">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        aria-label="Fewer"
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-8 text-center font-mono text-[14px] tabular" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= 10}
        aria-label="More"
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function TakeQuiz({
  questions,
  current,
  setCurrent,
  answers,
  setAnswer,
  error,
  onSubmit,
  onQuit,
}: {
  questions: Question[];
  current: number;
  setCurrent: (n: number) => void;
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  error: string;
  onSubmit: () => void;
  onQuit: () => void;
}) {
  const q = questions[current];
  const isLast = current === questions.length - 1;
  const unanswered = questions.filter((x) => !answers[x.id]?.trim()).length;

  // A–D / 1–4 selects an option for multiple choice.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (q.type !== "MCQ" || !q.options || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const k = e.key.toUpperCase();
      const idx = LETTERS.indexOf(k) >= 0 ? LETTERS.indexOf(k) : Number(k) - 1;
      if (idx >= 0 && idx < q.options.length) setAnswer(q.id, q.options[idx]);
    },
    [q, setAnswer]
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[42rem] px-5 py-10 sm:px-8">
          <div className="mb-8 flex items-center justify-between">
            <button onClick={onQuit} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
              <X className="size-3.5" /> Quit
            </button>
            <span className="font-mono text-[12px] text-muted-foreground tabular">
              {current + 1} / {questions.length}
            </span>
          </div>

          {/* segmented progress */}
          <div className="mb-10 flex gap-1" aria-hidden>
            {questions.map((x, i) => (
              <span
                key={x.id}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-200",
                  i === current ? "bg-foreground" : answers[x.id]?.trim() ? "bg-foreground/35" : "bg-border"
                )}
              />
            ))}
          </div>

          <div key={q.id} className="animate-rise-in">
            <p className="eyebrow mb-3">{TYPE_LABEL[q.type]}</p>
            <h2 className="font-serif text-[clamp(1.4rem,2.6vw,1.75rem)] leading-[1.3] tracking-[-0.01em]">{q.question}</h2>

            {q.type === "MCQ" && q.options ? (
              <div role="radiogroup" aria-label="Answer options" className="mt-8 space-y-2.5">
                {q.options.map((opt, i) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setAnswer(q.id, opt)}
                      className={cn(
                        "flex w-full items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left text-[15px] leading-relaxed transition-[border-color,background-color,box-shadow] duration-150",
                        selected
                          ? "border-foreground bg-card shadow-[var(--shadow-md)]"
                          : "border-border bg-card/60 hover:border-foreground/30 hover:bg-card"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-px grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[11.5px]",
                          selected ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
                        )}
                      >
                        {LETTERS[i]}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
                <p className="pt-2 font-mono text-[11px] text-muted-foreground">Tip: press A–{LETTERS[q.options.length - 1]} to choose</p>
              </div>
            ) : (
              <div className="mt-8">
                <label htmlFor={`ans-${q.id}`} className="mb-2 block text-[13px] font-medium">
                  Your answer
                </label>
                <textarea
                  id={`ans-${q.id}`}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  rows={q.type === "LAQ" ? 9 : 4}
                  placeholder={q.type === "LAQ" ? "Write a structured answer…" : "A sentence or two…"}
                  className="w-full resize-y rounded-xl border border-input bg-card px-4 py-3 text-[15px] leading-relaxed shadow-[var(--shadow-sm)] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                />
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  After submitting you&apos;ll compare this with a model answer.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-6 flex items-center gap-2 text-[13.5px] text-danger">
              <AlertCircle className="size-4" /> {error}
            </p>
          )}
        </div>
      </div>

      <div className="glass border-t border-border">
        <div className="mx-auto flex w-full max-w-[42rem] items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <Button variant="ghost" onClick={() => setCurrent(current - 1)} disabled={current === 0}>
            <ArrowLeft className="size-4" /> Previous
          </Button>
          {isLast ? (
            <Button onClick={onSubmit}>
              Submit{unanswered > 0 ? ` · ${unanswered} unanswered` : ""}
              <Check className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => setCurrent(current + 1)}>
              Next <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Results({
  questions,
  answers,
  breakdown,
  onNew,
  onExit,
}: {
  questions: Question[];
  answers: Record<string, string>;
  breakdown: Record<string, boolean>;
  onNew: () => void;
  onExit: () => void;
}) {
  const mcqs = questions.filter((q) => q.type === "MCQ");
  const correct = mcqs.filter((q) => breakdown[q.id]).length;
  const written = questions.length - mcqs.length;
  const pct = mcqs.length ? Math.round((correct / mcqs.length) * 100) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[44rem] px-5 py-12 sm:px-8">
        <p className="eyebrow mb-6">Results</p>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
          {pct !== null && <ScoreRing pct={pct} />}
          <div>
            <h1 className="font-serif text-[clamp(1.9rem,3.6vw,2.4rem)] leading-[1.1] tracking-[-0.02em]">
              {pct === null ? "Answers submitted" : `${correct} of ${mcqs.length} correct`}
            </h1>
            <p className="mt-3 max-w-[30rem] text-[14.5px] leading-relaxed text-muted-foreground">
              {mcqs.length > 0 && "Multiple-choice questions are marked automatically. "}
              {written > 0 &&
                `${written} written answer${written === 1 ? " is" : "s are"} shown next to the model answer below for you to judge.`}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={onNew}>
                <RotateCcw className="size-4" /> New quiz
              </Button>
              <Button variant="outline" onClick={onExit}>
                Back to questions
              </Button>
            </div>
          </div>
        </div>

        <h2 className="eyebrow mt-14 mb-4">Review</h2>
        <ol className="space-y-3">
          {questions.map((q, i) => {
            const isMcq = q.type === "MCQ";
            const ok = !!breakdown[q.id];
            const yours = answers[q.id]?.trim();
            return (
              <li key={q.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      !isMcq ? "bg-muted text-muted-foreground" : ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                    )}
                    aria-label={!isMcq ? "Self-review" : ok ? "Correct" : "Incorrect"}
                  >
                    {!isMcq ? <PenLine className="size-3.5" /> : ok ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-muted-foreground tabular">
                      {String(i + 1).padStart(2, "0")} · {TYPE_LABEL[q.type]}
                    </p>
                    <p className="mt-1.5 font-serif text-[17px] leading-snug">{q.question}</p>
                    <dl className="mt-4 grid gap-3 text-[14px] leading-relaxed sm:grid-cols-2">
                      <div>
                        <dt className="eyebrow mb-1">Your answer</dt>
                        <dd className={cn(!yours && "italic text-muted-foreground", isMcq && !ok && yours && "text-danger")}>
                          {yours || "Not answered"}
                        </dd>
                      </div>
                      {(!isMcq || !ok) && (
                        <div>
                          <dt className="eyebrow mb-1">{isMcq ? "Correct answer" : "Model answer"}</dt>
                          <dd className={cn(isMcq && "text-success")}>{q.correctAnswer}</dd>
                        </div>
                      )}
                    </dl>
                    {q.explanation && (
                      <p className="mt-4 border-l-2 border-[var(--ring)] pl-3 text-[13.5px] leading-relaxed text-muted-foreground">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0" role="img" aria-label={`${pct} percent`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="6" className="stroke-border" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="stroke-foreground transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-expo)]"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[22px] tabular">{pct}%</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-8 text-center">{children}</div>;
}
