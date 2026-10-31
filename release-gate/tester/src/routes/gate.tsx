import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { runProbes, type GateReport } from '../../release-gate/probes'

export const Route = createFileRoute('/gate')({ component: GatePage })

declare global {
  interface Window {
    __GATE_RESULT__?: GateReport
    __GATE_ERROR__?: string
  }
}

function GatePage() {
  const [report, setReport] = useState<GateReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Client-only on purpose. Running these imports during SSR would evaluate
  // them in Node, where `process` exists, and every browser-only defect would
  // silently pass.
  useEffect(() => {
    let cancelled = false
    const mode = new URLSearchParams(window.location.search).get('mode') ?? 'unknown'

    runProbes(mode)
      .then((result) => {
        if (cancelled) return
        window.__GATE_RESULT__ = result
        setReport(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.stack ?? err.message : String(err)
        window.__GATE_ERROR__ = message
        setError(message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const failed = report?.results.filter((r) => r.status === 'fail').length ?? 0
  const passed = report?.results.filter((r) => r.status === 'pass').length ?? 0

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1
        data-testid="gate-title"
        className="display-title mb-2 text-3xl font-bold tracking-tight text-[var(--sea-ink)]"
      >
        Release Gate 2 — browser import smoke
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        Imports every published <code>@naculus/*</code> artifact in a real browser.
        Failures here are expected until the underlying findings are fixed; the
        runner compares them against <code>release-gate/expectations.json</code>.
      </p>

      {error && (
        <pre
          data-gate-state="error"
          className="overflow-auto rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900"
        >
          {error}
        </pre>
      )}

      {!report && !error && (
        <p data-gate-state="running" className="text-sm text-[var(--sea-ink-soft)]">
          Running probes…
        </p>
      )}

      {report && (
        <div data-gate-state="done">
          <p className="mb-4 text-sm font-semibold">
            mode <code>{report.mode}</code> · {passed} passed · {failed} failed
          </p>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="py-2 pr-3 font-semibold">probe</th>
                <th className="py-2 pr-3 font-semibold">status</th>
                <th className="py-2 pr-3 font-semibold">code</th>
                <th className="py-2 font-semibold">detail</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)]/50 align-top">
                  <td className="py-1.5 pr-3 font-mono">{r.id}</td>
                  <td
                    className={`py-1.5 pr-3 font-semibold ${
                      r.status === 'pass' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {r.status}
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{r.code}</td>
                  <td className="py-1.5 [overflow-wrap:anywhere]">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
