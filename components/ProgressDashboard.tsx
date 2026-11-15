"use client";

import { ArrowDownRight, ArrowUpRight, ListChecks } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizResult } from "@/lib/types";

interface ProgressDashboardProps {
  quizHistory: QuizResult[];
  onStartQuiz: () => void;
}

const pctOf = (q: QuizResult) => Math.round((q.score / q.total) * 100);

export default function ProgressDashboard({ quizHistory, onStartQuiz }: ProgressDashboardProps) {
  const n = quizHistory.length;

  if (n === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[40rem] px-5 py-12 sm:px-8">
          <p className="eyebrow mb-4">Progress</p>
          <h1 className="font-serif text-[clamp(2rem,4vw,2.6rem)] leading-[1.1] tracking-[-0.02em]">Nothing to chart yet</h1>
          <p className="mt-4 max-w-[30rem] text-[15px] leading-relaxed text-muted-foreground">
            Your scores appear here after your first quiz in this session. Multiple-choice answers are marked
            automatically and tracked over time.
          </p>
          <Button className="mt-8" size="lg" onClick={onStartQuiz}>
            <ListChecks className="size-4" /> Take a quiz
          </Button>
        </div>
      </div>
    );
  }

  const scores = quizHistory.map(pctOf);
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / n);
  const answered = quizHistory.reduce((s, q) => s + q.total, 0);
  const change =
    n >= 2
      ? (() => {
          const mid = Math.floor(n / 2);
          const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
          return Math.round(avg(scores.slice(mid)) - avg(scores.slice(0, mid)));
        })()
      : null;
  const chartData = quizHistory.map((q, i) => ({ attempt: i + 1, score: pctOf(q) }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[56rem] px-5 py-12 sm:px-8">
        <p className="eyebrow mb-4">Progress</p>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.6rem)] leading-[1.1] tracking-[-0.02em]">How you&apos;re doing</h1>
        <p className="mt-3 text-[14.5px] text-muted-foreground">Multiple-choice scores for this session.</p>

        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          <Stat label="Quizzes" value={String(n)} />
          <Stat label="Average score" value={`${average}%`} />
          <Stat
            label="Change"
            value={change === null ? "–" : `${change > 0 ? "+" : ""}${change} pts`}
            hint={change === null ? "After 2 quizzes" : "Recent half vs earlier half"}
            trend={change === null || change === 0 ? undefined : change > 0 ? "up" : "down"}
          />
          <Stat label="Questions marked" value={String(answered)} />
        </dl>

        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]" aria-labelledby="trend-h">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="trend-h" className="text-[14px] font-medium">
              Score by attempt
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">%</span>
          </div>
          <div className="h-[220px]" role="img" aria-label={`Scores by attempt: ${scores.join("%, ")}%`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="attempt"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  formatter={(v) => [`${v}%`, "Score"]}
                  labelFormatter={(l) => `Attempt ${l}`}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "var(--shadow-md)",
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: "var(--card)", stroke: "var(--chart-1)", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "var(--chart-2)", stroke: "var(--card)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-6" aria-labelledby="log-h">
          <h2 id="log-h" className="eyebrow mb-3">
            Attempts
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="eyebrow px-4 py-2.5 font-medium">#</th>
                  <th scope="col" className="eyebrow px-4 py-2.5 font-medium">When</th>
                  <th scope="col" className="eyebrow px-4 py-2.5 font-medium">Mix</th>
                  <th scope="col" className="eyebrow px-4 py-2.5 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...quizHistory].reverse().map((q, i) => (
                  <tr key={q.id}>
                    <td className="px-4 py-3 font-mono text-muted-foreground tabular">{String(n - i).padStart(2, "0")}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(q.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[q.questionTypes.mcq && `${q.questionTypes.mcq} MC`, q.questionTypes.saq && `${q.questionTypes.saq} short`, q.questionTypes.laq && `${q.questionTypes.laq} long`]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {q.score}/{q.total}
                      <span className="ml-2 text-muted-foreground">{pctOf(q)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, trend }: { label: string; value: string; hint?: string; trend?: "up" | "down" }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 flex items-center gap-1.5 font-mono text-[26px] leading-none tabular">
        {value}
        {trend === "up" && <ArrowUpRight className="size-5 text-success" aria-label="up" />}
        {trend === "down" && <ArrowDownRight className="size-5 text-danger" aria-label="down" />}
      </dd>
      {hint && <p className={cn("mt-2 text-[12px] text-muted-foreground")}>{hint}</p>}
    </div>
  );
}
