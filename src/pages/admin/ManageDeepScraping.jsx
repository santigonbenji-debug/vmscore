import { useState } from 'react'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useCreateDeepScrapeRun, useDeepScrapeRuns, useUpdateDeepScrapeRun } from '../../hooks/useDeepScrapeRuns'

const INPUT = 'w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-surface-800 text-zinc-100 border border-surface-700'

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-zinc-100">{value}</p>
    </div>
  )
}

function Capability({ enabled, label }) {
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
      enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
    }`}>
      {enabled ? 'Listo' : 'Pendiente'} - {label}
    </span>
  )
}

function RunCard({ run, selected, onSelect, onMarkReviewed }) {
  const extracted = run.extracted ?? {}
  const tournament = extracted.tournament ?? {}
  const counts = extracted.counts ?? {}

  return (
    <button
      type="button"
      onClick={() => onSelect(run)}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        selected ? 'border-primary bg-primary/10' : 'border-surface-800 bg-surface-900 hover:border-surface-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-100">
            {tournament.title || 'Copa Facil'}
          </p>
          <p className="mt-1 truncate text-[11px] text-zinc-500">{run.source_url}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
          run.status === 'reviewed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'
        }`}>
          {run.status === 'reviewed' ? 'Revisado' : 'Capturado'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <span className="rounded-lg bg-surface-950 px-2 py-1 text-xs text-zinc-300">{counts.matches ?? 0} partidos</span>
        <span className="rounded-lg bg-surface-950 px-2 py-1 text-xs text-zinc-300">{counts.teams ?? 0} equipos</span>
        <span className="rounded-lg bg-surface-950 px-2 py-1 text-xs text-zinc-300">{counts.rounds ?? 0} fechas</span>
      </div>
      {run.status !== 'reviewed' && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation()
              onMarkReviewed(run)
            }}
          >
            Marcar revisado
          </Button>
        </div>
      )}
    </button>
  )
}

export default function ManageDeepScraping() {
  const [sourceUrl, setSourceUrl] = useState('https://copafacil.com/-npwhxv1bzzrlfw5szpj@jw5t')
  const [selectedRun, setSelectedRun] = useState(null)
  const [error, setError] = useState('')
  const [visualError, setVisualError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visualLoading, setVisualLoading] = useState(false)

  const { data: runs = [], isLoading } = useDeepScrapeRuns()
  const createRun = useCreateDeepScrapeRun()
  const updateRun = useUpdateDeepScrapeRun()

  const activeRun = selectedRun || runs[0]
  const extracted = activeRun?.extracted ?? {}
  const counts = extracted.counts ?? {}
  const capabilities = extracted.capabilities ?? {}
  const rounds = extracted.rounds ?? []
  const teams = extracted.teams ?? []
  const standings = extracted.standings ?? []
  const matches = extracted.matches ?? []
  const visualSummary = extracted.visual ?? null
  const rawVisual = activeRun?.raw?.visual ?? null
  const roundPreview = rounds.slice(0, 8)
  const teamPreview = teams.slice(0, 14)
  const standingsPreview = standings.slice(0, 10)
  const matchesPreview = matches.slice(0, 12)

  async function analyzeSource() {
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/deep-scrape-copafacil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'No se pudo analizar el link.')
      const run = await createRun.mutateAsync(payload)
      setSelectedRun(run)
    } catch (err) {
      setError(err?.message ?? 'No se pudo analizar el link.')
    } finally {
      setLoading(false)
    }
  }

  async function markReviewed(run) {
    await updateRun.mutateAsync({
      id: run.id,
      values: {
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
      },
    })
    if (activeRun?.id === run.id) {
      setSelectedRun({ ...run, status: 'reviewed', reviewed_at: new Date().toISOString() })
    }
  }

  async function runVisualScrape() {
    if (!activeRun) return
    setVisualError('')
    setVisualLoading(true)
    try {
      const response = await fetch('/api/visual-scrape-copafacil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: activeRun.source_url }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'No se pudo ejecutar el worker visual.')

      const visual = payload.visual
      const nextExtracted = {
        ...extracted,
        capabilities: {
          ...(extracted.capabilities ?? {}),
          visual_worker_executed: true,
          visual_screenshots: visual.capabilities?.screenshots ?? false,
          visual_network_discovery: visual.capabilities?.network_discovery ?? false,
        },
        visual: {
          ran_at: visual.ran_at,
          route_count: visual.routes?.length ?? 0,
          screenshot_count: (visual.routes ?? []).reduce((total, route) => total + (route.captures?.length || (route.screenshot_data_url ? 1 : 0)), 0),
          network_total: visual.network?.total ?? 0,
          firebase_urls: visual.network?.firebase_urls?.length ?? 0,
          api_urls: visual.network?.api_urls?.length ?? 0,
          storage_images: visual.network?.storage_images?.length ?? 0,
          findings: visual.findings ?? [],
          capabilities: visual.capabilities ?? {},
        },
      }
      const nextRaw = {
        ...(activeRun.raw ?? {}),
        visual,
      }

      await updateRun.mutateAsync({
        id: activeRun.id,
        values: {
          extracted: nextExtracted,
          raw: nextRaw,
        },
      })

      setSelectedRun({
        ...activeRun,
        extracted: nextExtracted,
        raw: nextRaw,
      })
    } catch (err) {
      setVisualError(err?.message ?? 'No se pudo ejecutar el worker visual.')
    } finally {
      setVisualLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Scraping profundo</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Captura datos externos en una bandeja de revision. Nada se importa ni recalcula tablas desde aca.
        </p>
      </div>

      <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
        <label className="mb-1 block text-xs font-semibold text-zinc-400">Link del torneo</label>
        <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            className={INPUT}
            placeholder="https://copafacil.com/torneo@division"
          />
          <Button onClick={analyzeSource} disabled={loading || createRun.isPending}>
            {loading ? 'Analizando...' : 'Analizar y guardar'}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Esta primera capa copia fixture, resultados, sedes detectables y una tabla calculada. El worker visual queda aislado para eventos, escudos y goleadores.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </p>
        )}
      </section>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,28rem),minmax(0,1fr)]">
        <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-100">Capturas</h2>
            {isLoading && <Spinner />}
          </div>
          <div className="space-y-2">
            {runs.length === 0 && (
              <p className="rounded-lg border border-surface-800 bg-surface-950 p-3 text-xs text-zinc-500">
                Todavia no hay capturas guardadas.
              </p>
            )}
            {runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                selected={activeRun?.id === run.id}
                onSelect={setSelectedRun}
                onMarkReviewed={markReviewed}
              />
            ))}
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          {!activeRun ? (
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-4 text-sm text-zinc-500">
              Analiza un link para ver que puede copiar VMScore.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                <div className="flex items-start gap-3">
                  {extracted.tournament?.logo_url && (
                    <img
                      src={extracted.tournament.logo_url}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-surface-800 object-contain"
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-zinc-100">
                      {extracted.tournament?.title || 'Torneo Copa Facil'}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {activeRun.event_code}@{activeRun.division_code}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                  <Stat label="Partidos" value={counts.matches ?? 0} />
                  <Stat label="Equipos" value={counts.teams ?? 0} />
                  <Stat label="Fechas" value={counts.rounds ?? 0} />
                  <Stat label="Finalizados" value={counts.finished_matches ?? 0} />
                  <Stat label="Pendientes" value={counts.pending_matches ?? 0} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Capability enabled={capabilities.fixture} label="fixture" />
                  <Capability enabled={capabilities.results} label="resultados" />
                  <Capability enabled={capabilities.venues} label="sedes" />
                  <Capability enabled={capabilities.computed_standings} label="tabla calculada" />
                  <Capability enabled={capabilities.team_logos} label="escudos" />
                  <Capability enabled={capabilities.player_rankings} label="goleadores" />
                  <Capability enabled={capabilities.match_events} label="eventos" />
                  <Capability enabled={capabilities.visual_worker_executed} label="worker visual" />
                </div>

                <div className="mt-4 rounded-xl border border-surface-800 bg-surface-950 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">Worker visual</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Abre Copa Facil como navegador real, captura pantallas y descubre endpoints.
                      </p>
                    </div>
                    <Button onClick={runVisualScrape} disabled={visualLoading || updateRun.isPending}>
                      {visualLoading ? 'Ejecutando...' : 'Ejecutar worker visual'}
                    </Button>
                  </div>

                  {visualError && (
                    <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                      {visualError}
                    </p>
                  )}

                  {visualSummary && (
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                      <span className="rounded-lg bg-surface-900 px-3 py-2 text-zinc-300">
                        Rutas: <strong className="text-zinc-100">{visualSummary.route_count}</strong>
                      </span>
                      <span className="rounded-lg bg-surface-900 px-3 py-2 text-zinc-300">
                        Capturas: <strong className="text-zinc-100">{visualSummary.screenshot_count ?? 0}</strong>
                      </span>
                      <span className="rounded-lg bg-surface-900 px-3 py-2 text-zinc-300">
                        Red: <strong className="text-zinc-100">{visualSummary.network_total}</strong>
                      </span>
                      <span className="rounded-lg bg-surface-900 px-3 py-2 text-zinc-300">
                        API: <strong className="text-zinc-100">{visualSummary.api_urls}</strong>
                      </span>
                      <span className="rounded-lg bg-surface-900 px-3 py-2 text-zinc-300">
                        Imagenes: <strong className="text-zinc-100">{visualSummary.storage_images}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {rawVisual && (
                <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                  <h3 className="mb-3 text-sm font-bold text-zinc-100">Captura visual</h3>

                  {rawVisual.findings?.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {rawVisual.findings.map((finding) => (
                        <p key={finding} className="rounded-lg border border-surface-800 bg-surface-950 p-3 text-xs text-zinc-400">
                          {finding}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    {(rawVisual.routes ?? []).map((route) => (
                      <div key={route.key} className="overflow-hidden rounded-xl border border-surface-800 bg-surface-950">
                        <div className="border-b border-surface-800 px-3 py-2">
                          <p className="text-xs font-bold text-zinc-100">{route.label}</p>
                          <p className="truncate text-[11px] text-zinc-500">{route.url}</p>
                        </div>
                        {(route.captures?.length ?? 0) > 0 ? (
                          <div className="grid gap-2 p-2 md:grid-cols-2 xl:grid-cols-4">
                            {route.captures.map((capture) => (
                              <div key={`${route.key}-${capture.index}`} className="overflow-hidden rounded-lg border border-surface-800 bg-surface-900">
                                <div className="px-2 py-1 text-[11px] font-bold text-zinc-500">{capture.label}</div>
                                <img
                                  src={capture.screenshot_data_url}
                                  alt=""
                                  className="aspect-video w-full object-cover object-top"
                                />
                              </div>
                            ))}
                          </div>
                        ) : route.screenshot_data_url ? (
                          <img src={route.screenshot_data_url} alt="" className="aspect-video w-full object-cover object-top" />
                        ) : (
                          <p className="p-3 text-xs text-red-300">{route.error ?? 'Sin captura.'}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-surface-800 bg-surface-950 p-3">
                    <p className="text-xs font-bold text-zinc-100">Imagenes descubiertas</p>
                    <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-10">
                      {(rawVisual.network?.storage_images ?? []).slice(0, 40).map((url) => (
                        <div key={url} className="aspect-square overflow-hidden rounded-lg border border-surface-800 bg-surface-900">
                          <img src={url} alt="" className="h-full w-full object-contain p-1" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-surface-800 bg-surface-950 p-3">
                    <p className="text-xs font-bold text-zinc-100">Endpoints descubiertos</p>
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                      {[
                        ...(rawVisual.network?.api_urls ?? []),
                        ...(rawVisual.network?.firebase_urls ?? []),
                      ].slice(0, 25).map((url) => (
                        <p key={url} className="truncate font-mono text-[11px] text-zinc-500">{url}</p>
                      ))}
                      {(rawVisual.network?.api_urls?.length ?? 0) + (rawVisual.network?.firebase_urls?.length ?? 0) === 0 && (
                        <p className="text-xs text-zinc-500">No se detectaron endpoints adicionales.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                  <h3 className="mb-3 text-sm font-bold text-zinc-100">Fechas detectadas</h3>
                  <div className="space-y-2">
                    {roundPreview.map((round) => (
                      <div key={round.round} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-100">Fecha {round.round}</span>
                          <span className="text-xs text-zinc-500">{round.total} partidos</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {round.finished} finalizados - {round.scheduled} pendientes - {round.goals} goles
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                  <h3 className="mb-3 text-sm font-bold text-zinc-100">Equipos a mapear</h3>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {teamPreview.map((team) => (
                      <div key={team.external_team_id} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                        <p className="font-mono text-xs text-zinc-300">{team.external_team_id}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">{team.matches} partidos detectados</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-surface-800 bg-surface-900 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-zinc-100">Tabla calculada desde resultados</h3>
                  <span className="hidden text-[11px] text-zinc-500 sm:inline">Desliza para ver columnas</span>
                </div>

                <div className="space-y-2 sm:hidden">
                  {standingsPreview.map((row) => (
                    <div key={row.external_team_id} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-zinc-100">#{row.position}</p>
                          <p className="truncate font-mono text-xs text-zinc-400">{row.external_team_id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-zinc-100">{row.points}</p>
                          <p className="text-[11px] font-bold uppercase text-zinc-500">PTS</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs">
                        <span className="rounded bg-surface-800 px-1.5 py-1 text-zinc-300">PJ {row.played}</span>
                        <span className="rounded bg-surface-800 px-1.5 py-1 text-zinc-300">G {row.won}</span>
                        <span className="rounded bg-surface-800 px-1.5 py-1 text-zinc-300">E {row.drawn}</span>
                        <span className="rounded bg-surface-800 px-1.5 py-1 text-zinc-300">P {row.lost}</span>
                        <span className="rounded bg-surface-800 px-1.5 py-1 text-zinc-300">DG {row.goal_diff}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden min-w-0 overflow-x-auto rounded-lg border border-surface-800 sm:block">
                  <table className="w-full min-w-[38rem] table-fixed text-sm">
                    <thead className="text-xs uppercase text-zinc-500">
                      <tr className="bg-surface-950">
                        <th className="w-12 px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">Equipo externo</th>
                        <th className="w-16 px-2 py-2 text-right">PTS</th>
                        <th className="w-14 px-2 py-2 text-right">PJ</th>
                        <th className="w-14 px-2 py-2 text-right">G</th>
                        <th className="w-14 px-2 py-2 text-right">E</th>
                        <th className="w-14 px-2 py-2 text-right">P</th>
                        <th className="w-14 px-2 py-2 text-right">DG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standingsPreview.map((row) => (
                        <tr key={row.external_team_id} className="border-t border-surface-800">
                          <td className="px-2 py-2 font-bold text-zinc-100">{row.position}</td>
                          <td className="truncate px-2 py-2 font-mono text-xs text-zinc-300">{row.external_team_id}</td>
                          <td className="px-2 py-2 text-right font-black text-zinc-100">{row.points}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{row.played}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{row.won}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{row.drawn}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{row.lost}</td>
                          <td className="px-2 py-2 text-right text-zinc-400">{row.goal_diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                <h3 className="mb-3 text-sm font-bold text-zinc-100">Partidos de muestra</h3>
                <div className="space-y-2">
                  {matchesPreview.map((match) => (
                    <div key={match.external_match_id} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500">Fecha {match.round}</span>
                        <span className="text-xs text-zinc-500">{match.scheduled_at ? new Date(match.scheduled_at).toLocaleString('es-AR') : 'Sin horario'}</span>
                      </div>
                      <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
                        <span className="truncate font-mono text-xs text-zinc-300">{match.external_home_team_id}</span>
                        <span className="font-black text-zinc-100">
                          {match.home_score !== null && match.away_score !== null ? `${match.home_score} - ${match.away_score}` : 'vs'}
                        </span>
                        <span className="truncate text-right font-mono text-xs text-zinc-300">{match.external_away_team_id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
