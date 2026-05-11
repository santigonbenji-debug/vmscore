import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import { useTeams } from '../../hooks/useTeams'
import {
  useExternalSources,
  useExternalTeamMappings,
  useImportCopaFacilMatches,
  useSaveExternalTeamMappings,
  useUpsertExternalSource,
} from '../../hooks/useExternalSources'
import { fetchCopaFacilMatches, parseCopaFacilUrl, summarizeExternalTeams } from '../../lib/copaFacil'

const INPUT = 'w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-surface-800 text-zinc-100 border border-surface-700'

const EMPTY_FORM = {
  league_id: '',
  phase_id: '',
  label: '',
  source_url: '',
}

export default function ManageExternalSources() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [preview, setPreview] = useState([])
  const [previewError, setPreviewError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [localMappings, setLocalMappings] = useState({})
  const [result, setResult] = useState(null)

  const { data: leagues = [] } = useLeagues()
  const { data: phases = [] } = usePhases(form.league_id)
  const { data: sources = [], isLoading: loadingSources } = useExternalSources()
  const selectedSource = sources.find((source) => source.id === selectedSourceId)
  const selectedLeague = leagues.find((league) => league.id === (selectedSource?.league_id ?? form.league_id))
  const { data: teams = [] } = useTeams({ sportId: selectedLeague?.sport_id })
  const { data: savedMappings = [] } = useExternalTeamMappings(selectedSourceId)

  const upsertSource = useUpsertExternalSource()
  const saveMappings = useSaveExternalTeamMappings()
  const importMatches = useImportCopaFacilMatches()

  useEffect(() => {
    if (phases.length > 0 && !form.phase_id) {
      setForm((current) => ({ ...current, phase_id: phases[0].id }))
    }
  }, [phases, form.phase_id])

  useEffect(() => {
    const next = {}
    savedMappings.forEach((mapping) => {
      next[mapping.external_team_id] = mapping.team_id
    })
    setLocalMappings(next)
  }, [savedMappings])

  const externalTeams = useMemo(() => summarizeExternalTeams(preview), [preview])
  const mappedCount = externalTeams.filter((team) => localMappings[team.external_team_id]).length
  const importableCount = preview.filter((match) =>
    localMappings[match.external_home_team_id] && localMappings[match.external_away_team_id]
  ).length

  function fillFromSource(source) {
    setSelectedSourceId(source.id)
    setForm({
      league_id: source.league_id,
      phase_id: source.phase_id,
      label: source.label ?? '',
      source_url: source.source_url,
    })
    setPreview([])
    setResult(null)
    setPreviewError('')
  }

  async function saveSource() {
    const parsed = parseCopaFacilUrl(form.source_url)
    if (!parsed || !form.league_id || !form.phase_id) {
      setPreviewError('Completa liga, fase y un link valido de Copa Facil.')
      return
    }

    const source = await upsertSource.mutateAsync({
      provider: 'copafacil',
      league_id: form.league_id,
      phase_id: form.phase_id,
      label: form.label || null,
      source_url: form.source_url.trim(),
      event_code: parsed.eventCode,
      division_code: parsed.divisionCode,
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    })
    setSelectedSourceId(source.id)
    setPreviewError('')
  }

  async function loadPreview() {
    const sourceLike = selectedSource ?? {
      source_url: form.source_url,
      event_code: parseCopaFacilUrl(form.source_url)?.eventCode,
      division_code: parseCopaFacilUrl(form.source_url)?.divisionCode,
    }

    setPreviewLoading(true)
    setPreviewError('')
    setResult(null)
    try {
      const matches = await fetchCopaFacilMatches({
        eventCode: sourceLike.event_code,
        divisionCode: sourceLike.division_code,
      })
      setPreview(matches)
      if (matches.length === 0) {
        setPreviewError('No se encontraron partidos para esa division.')
      }
    } catch (error) {
      setPreviewError(error?.message ?? 'No se pudo leer Copa Facil.')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function saveMappingChanges() {
    if (!selectedSourceId) return
    await saveMappings.mutateAsync({ sourceId: selectedSourceId, mappings: localMappings })
  }

  async function runImport() {
    if (!selectedSource || preview.length === 0) return
    await saveMappingChanges()
    const summary = await importMatches.mutateAsync({
      source: selectedSource,
      matches: preview,
      mappings: localMappings,
    })
    setResult(summary)
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Importar Copa Facil</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Conecta una liga de VMScore con fixture y resultados publicados en Copa Facil.
        </p>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-zinc-100">Fuentes guardadas</h2>
            {loadingSources && <Spinner />}
          </div>
          {sources.length === 0 ? (
            <p className="text-xs text-zinc-500">Todavia no hay fuentes externas.</p>
          ) : (
            <div className="space-y-2">
              {sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => fillFromSource(source)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedSourceId === source.id
                      ? 'border-primary bg-primary/10'
                      : 'border-surface-800 bg-surface-950 hover:border-surface-700'
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-100">
                    {source.label || source.leagues?.name || 'Copa Facil'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {source.leagues?.name} · {source.phases?.name} · {source.event_code}@{source.division_code}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
          <h2 className="mb-3 text-sm font-bold text-zinc-100">Conexion</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Liga VMScore</label>
              <select
                value={form.league_id}
                onChange={(event) => setForm({ ...form, league_id: event.target.value, phase_id: '' })}
                className={INPUT}
              >
                <option value="">Seleccionar liga...</option>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.sports?.icon} {league.name} · {league.season ?? league.year ?? ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fase destino</label>
              <select
                value={form.phase_id}
                onChange={(event) => setForm({ ...form, phase_id: event.target.value })}
                className={INPUT}
                disabled={!form.league_id}
              >
                <option value="">Seleccionar fase...</option>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>{phase.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre interno</label>
              <input
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                className={INPUT}
                placeholder="Primera Division A"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Link de Copa Facil</label>
              <input
                value={form.source_url}
                onChange={(event) => setForm({ ...form, source_url: event.target.value })}
                className={INPUT}
                placeholder="https://copafacil.com/-2c62x@rzjg"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={saveSource} disabled={upsertSource.isPending}>
                {upsertSource.isPending ? 'Guardando...' : 'Guardar fuente'}
              </Button>
              <Button variant="secondary" onClick={loadPreview} disabled={previewLoading || (!selectedSource && !form.source_url)}>
                {previewLoading ? 'Leyendo...' : 'Leer datos'}
              </Button>
            </div>
          </div>
        </section>

        {previewError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {previewError}
          </p>
        )}

        {preview.length > 0 && (
          <>
            <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">Mapeo de equipos</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {mappedCount}/{externalTeams.length} equipos vinculados.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={saveMappingChanges} disabled={!selectedSourceId || saveMappings.isPending}>
                  Guardar
                </Button>
              </div>

              <div className="space-y-2">
                {externalTeams.map((team) => (
                  <div key={team.external_team_id} className="grid grid-cols-[1fr,1.3fr] items-center gap-2 rounded-lg border border-surface-800 bg-surface-950 p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-mono text-zinc-300">{team.external_team_id}</p>
                      <p className="text-[11px] text-zinc-600">{team.matches} partidos</p>
                    </div>
                    <select
                      value={localMappings[team.external_team_id] ?? ''}
                      onChange={(event) => setLocalMappings({
                        ...localMappings,
                        [team.external_team_id]: event.target.value,
                      })}
                      className={INPUT}
                    >
                      <option value="">Sin mapear</option>
                      {teams.map((vmTeam) => (
                        <option key={vmTeam.id} value={vmTeam.id}>
                          {vmTeam.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">Partidos detectados</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {importableCount}/{preview.length} listos para importar.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={runImport}
                  disabled={!selectedSource || importableCount === 0 || importMatches.isPending}
                >
                  {importMatches.isPending ? 'Importando...' : 'Importar'}
                </Button>
              </div>

              {result && (
                <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  Creados: {result.created} · Actualizados: {result.updated} · Omitidos por mapeo: {result.skipped}
                </p>
              )}

              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {preview.slice(0, 60).map((match) => {
                  const ready = localMappings[match.external_home_team_id] && localMappings[match.external_away_team_id]
                  return (
                    <div key={match.external_match_id} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500">Fecha {match.round} · horario a definir</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                          {ready ? 'Listo' : 'Falta mapeo'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 text-sm">
                        <span className="truncate font-mono text-zinc-300">{match.external_home_team_id}</span>
                        <span className="font-bold text-zinc-100">
                          {match.status === 'finished' ? `${match.home_score} - ${match.away_score}` : 'vs'}
                        </span>
                        <span className="truncate text-right font-mono text-zinc-300">{match.external_away_team_id}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
