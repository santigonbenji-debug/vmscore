import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import { useTeams } from '../../hooks/useTeams'
import { useVenues } from '../../hooks/useVenues'
import { useReferees } from '../../hooks/useReferees'
import {
  useComputeExternalArchiveMatch,
  useExternalMatchArchive,
  useExternalSources,
  useExternalTeamMappings,
  useImportCopaFacilMatches,
  useOfficialMatchesForLeague,
  usePublishExternalArchiveMatch,
  useSaveExternalTeamMappings,
  useUpdateExternalArchiveMatch,
  useUpsertExternalSource,
} from '../../hooks/useExternalSources'
import { fetchCopaFacilMatches, parseCopaFacilUrl, summarizeExternalTeams } from '../../lib/copaFacil'

const TZ = 'America/Argentina/San_Luis'
const INPUT = 'w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-surface-800 text-zinc-100 border border-surface-700'

const EMPTY_FORM = {
  league_id: '',
  phase_id: '',
  label: '',
  source_url: '',
  min_round: 8,
}

function pairKey(match, homeKey = 'home_team_id', awayKey = 'away_team_id') {
  return [match[homeKey], match[awayKey]].filter(Boolean).sort().join('|')
}

function sameDay(left, right) {
  if (!left || !right) return false
  return format(toZonedTime(new Date(left), TZ), 'yyyy-MM-dd') === format(toZonedTime(new Date(right), TZ), 'yyyy-MM-dd')
}

function findArchiveConflicts(archiveRows, officialRows) {
  return archiveRows
    .filter((row) => row.review_status !== 'ignored')
    .map((row) => {
      const archivePair = pairKey(row, 'mapped_home_team_id', 'mapped_away_team_id')
      const official = officialRows.find((match) => (
        pairKey(match) === archivePair &&
        (
          sameDay(match.scheduled_at, row.scheduled_at) ||
          (match.round && row.round && Number(match.round) === Number(row.round))
        )
      ))
      return official ? { archive: row, official } : null
    })
    .filter(Boolean)
}

function normalizedValue(value) {
  return value === undefined ? null : value
}

function normalizedTime(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function findPreviewChanges(previewRows, archiveRows) {
  const archiveByExternalId = new Map(
    archiveRows.map((row) => [row.external_match_id, row])
  )

  return previewRows
    .map((match) => {
      const archived = archiveByExternalId.get(match.external_match_id)
      if (!archived) {
        return {
          type: 'new_match',
          priority: 2,
          label: 'Nuevo cruce',
          description: 'Copa Facil tiene este partido y todavia no esta en el archivo.',
          match,
          archived: null,
        }
      }

      const scoreChanged =
        normalizedValue(match.home_score) !== normalizedValue(archived.home_score) ||
        normalizedValue(match.away_score) !== normalizedValue(archived.away_score)
      const resultAppeared = archived.status !== 'finished' && match.status === 'finished'
      const dateChanged = normalizedTime(match.scheduled_at) !== normalizedTime(archived.scheduled_at)
      const statusChanged = match.status !== archived.status

      if (!scoreChanged && !resultAppeared && !dateChanged && !statusChanged) return null

      if (resultAppeared || scoreChanged) {
        return {
          type: resultAppeared ? 'new_result' : 'score_changed',
          priority: 4,
          label: resultAppeared ? 'Resultado nuevo' : 'Resultado actualizado',
          description: 'Revisalo antes de guardarlo o computarlo en la tabla.',
          match,
          archived,
        }
      }

      if (dateChanged) {
        return {
          type: 'date_changed',
          priority: 3,
          label: match.scheduled_at ? 'Fecha u horario actualizado' : 'Fecha pendiente',
          description: 'Copa Facil cambio el dato de dia u horario.',
          match,
          archived,
        }
      }

      return {
        type: 'status_changed',
        priority: 1,
        label: 'Estado actualizado',
        description: 'Copa Facil cambio el estado del partido.',
        match,
        archived,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return Number(a.match.round ?? 0) - Number(b.match.round ?? 0)
    })
}

export default function ManageExternalSources() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [preview, setPreview] = useState([])
  const [previewError, setPreviewError] = useState('')
  const [archiveActionError, setArchiveActionError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const [localMappings, setLocalMappings] = useState({})
  const [result, setResult] = useState(null)
  const [archiveTab, setArchiveTab] = useState('pending')
  const [archiveDate, setArchiveDate] = useState('')
  const [editingArchive, setEditingArchive] = useState(null)
  const [archiveForm, setArchiveForm] = useState({
    scheduledAtLocal: '',
    homeScore: '',
    awayScore: '',
    status: 'scheduled',
    reviewStatus: 'pending',
    venueId: '',
    refereeId: '',
    notes: '',
  })

  const { data: leagues = [] } = useLeagues()
  const { data: phases = [] } = usePhases(form.league_id)
  const { data: sources = [], isLoading: loadingSources } = useExternalSources()
  const selectedSource = sources.find((source) => source.id === selectedSourceId)
  const selectedLeague = leagues.find((league) => league.id === (selectedSource?.league_id ?? form.league_id))
  const { data: teams = [] } = useTeams({ sportId: selectedLeague?.sport_id })
  const { data: canchas = [] } = useVenues()
  const { data: arbitros = [] } = useReferees()
  const { data: savedMappings = [] } = useExternalTeamMappings(selectedSourceId)
  const { data: archive = [], isLoading: loadingArchive } = useExternalMatchArchive(selectedSourceId)
  const { data: officialMatches = [] } = useOfficialMatchesForLeague(selectedSource?.league_id)

  const upsertSource = useUpsertExternalSource()
  const saveMappings = useSaveExternalTeamMappings()
  const importMatches = useImportCopaFacilMatches()
  const updateArchiveMatch = useUpdateExternalArchiveMatch()
  const computeArchiveMatch = useComputeExternalArchiveMatch()
  const publishArchiveMatch = usePublishExternalArchiveMatch()

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
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const mappedCount = externalTeams.filter((team) => localMappings[team.external_team_id]).length
  const importableCount = preview.filter((match) =>
    localMappings[match.external_home_team_id] && localMappings[match.external_away_team_id]
  ).length
  const archiveCounts = useMemo(() => ({
    all: archive.length,
    pending: archive.filter((match) => match.review_status !== 'confirmed').length,
    confirmed: archive.filter((match) => match.review_status === 'confirmed').length,
  }), [archive])
  const filteredArchive = useMemo(() => {
    return archive
      .filter((match) => {
        if (archiveTab === 'pending') return match.review_status !== 'confirmed'
        if (archiveTab === 'confirmed') return match.review_status === 'confirmed'
        return true
      })
      .filter((match) => {
        if (!archiveDate) return true
        if (!match.scheduled_at) return false
        return format(toZonedTime(new Date(match.scheduled_at), TZ), 'yyyy-MM-dd') === archiveDate
      })
  }, [archive, archiveDate, archiveTab])
  const conflicts = useMemo(() => findArchiveConflicts(archive, officialMatches), [archive, officialMatches])
  const previewChanges = useMemo(() => findPreviewChanges(preview, archive), [preview, archive])

  function fillFromSource(source) {
    setSelectedSourceId(source.id)
    setForm({
      league_id: source.league_id,
      phase_id: source.phase_id,
      label: source.label ?? '',
      source_url: source.source_url,
      min_round: source.min_round ?? 1,
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
      min_round: Number(form.min_round) || 1,
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
        fresh: true,
      })
      setPreview(matches)
      setLastCheckedAt(new Date())
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
    setArchiveTab('pending')
  }

  function toLocalInput(value) {
    if (!value) return ''
    return format(toZonedTime(new Date(value), TZ), "yyyy-MM-dd'T'HH:mm")
  }

  function openArchiveEditor(match) {
    setArchiveActionError('')
    setEditingArchive(match)
    setArchiveForm({
      scheduledAtLocal: toLocalInput(match.scheduled_at),
      homeScore: match.home_score ?? '',
      awayScore: match.away_score ?? '',
      status: match.status ?? 'scheduled',
      reviewStatus: match.review_status ?? 'pending',
      venueId: match.venue_id ?? '',
      refereeId: match.referee_id ?? '',
      notes: match.admin_notes ?? '',
    })
  }

  async function saveArchiveEditor(markConfirmed = false, options = {}) {
    const { close = true } = options
    if (!editingArchive) return false
    const homeScore = archiveForm.homeScore === '' ? null : Number(archiveForm.homeScore)
    const awayScore = archiveForm.awayScore === '' ? null : Number(archiveForm.awayScore)
    const hasScore = homeScore !== null && awayScore !== null
    const scheduledAt = archiveForm.scheduledAtLocal
      ? fromZonedTime(new Date(archiveForm.scheduledAtLocal), TZ).toISOString()
      : null
    const reviewStatus = markConfirmed ? 'confirmed' : archiveForm.reviewStatus

    await updateArchiveMatch.mutateAsync({
      id: editingArchive.id,
      sourceId: selectedSourceId,
      values: {
        scheduled_at: scheduledAt,
        date_tbd: !scheduledAt,
        home_score: homeScore,
        away_score: awayScore,
        status: hasScore ? 'finished' : (archiveForm.status === 'finished' ? 'scheduled' : archiveForm.status),
        review_status: reviewStatus,
        venue_id: archiveForm.venueId || null,
        referee_id: archiveForm.refereeId || null,
        admin_notes: archiveForm.notes || null,
      },
    })
    if (close) {
      setEditingArchive(null)
    }
    return true
  }

  async function computeArchiveEditor() {
    if (!editingArchive) return
    setArchiveActionError('')
    try {
      const saved = await saveArchiveEditor(true, { close: false })
      if (!saved) return
      await computeArchiveMatch.mutateAsync({
        id: editingArchive.id,
        sourceId: selectedSourceId,
        leagueId: selectedSource?.league_id,
      })
      setEditingArchive(null)
    } catch (error) {
      setArchiveActionError(error?.message ?? 'No se pudo computar el partido en la tabla.')
    }
  }

  async function publishArchiveEditor() {
    if (!editingArchive) return
    setArchiveActionError('')
    try {
      const saved = await saveArchiveEditor(false, { close: false })
      if (!saved) return
      const matchId = await publishArchiveMatch.mutateAsync({
        id: editingArchive.id,
        sourceId: selectedSourceId,
        leagueId: selectedSource?.league_id,
      })
      setEditingArchive((current) => current ? { ...current, computed_match_id: matchId } : current)
    } catch (error) {
      setArchiveActionError(error?.message ?? 'No se pudo publicar el partido.')
    }
  }

  function teamName(teamId, externalId) {
    return teamMap.get(teamId)?.short_name || teamMap.get(teamId)?.name || externalId || 'Equipo'
  }

  function previewTeamName(externalId) {
    return teamName(localMappings[externalId], externalId)
  }

  function previewDateLabel(match) {
    if (!match.scheduled_at) return `Fecha ${match.round ?? '-'} · a definir`
    return `Fecha ${match.round ?? '-'} · ${format(toZonedTime(new Date(match.scheduled_at), TZ), 'dd/MM/yyyy HH:mm')}`
  }

  async function keepOfficial(conflict) {
    await updateArchiveMatch.mutateAsync({
      id: conflict.archive.id,
      sourceId: selectedSourceId,
      values: {
        review_status: 'ignored',
        preferred_display: false,
        admin_notes: 'Conflicto resuelto: se mantiene el partido oficial en VMScore.',
      },
    })
  }

  async function keepExternal(conflict) {
    await updateArchiveMatch.mutateAsync({
      id: conflict.archive.id,
      sourceId: selectedSourceId,
      values: {
        review_status: 'confirmed',
        preferred_display: true,
        admin_notes: 'Conflicto resuelto: se muestra el partido importado desde Copa Facil.',
      },
    })
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Importar Copa Facil</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Busca novedades, revisa cruces y despues decide que guardar, publicar o computar.
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
                    {source.leagues?.name} · {source.phases?.name} · archivo desde Fecha {source.min_round ?? 1}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedSourceId && (
          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">Historico externo</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Copa Facil queda aca como registro. Confirmar no modifica la tabla de posiciones.
                </p>
              </div>
              {loadingArchive && <Spinner />}
            </div>

            {conflicts.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="mb-2">
                  <h3 className="text-sm font-bold text-amber-200">Partidos duplicados</h3>
                  <p className="mt-1 text-xs text-amber-100/70">
                    Hay {conflicts.length} cruce{conflicts.length === 1 ? '' : 's'} que existe{conflicts.length === 1 ? '' : 'n'} en VMScore y Copa Facil.
                  </p>
                </div>
                <div className="space-y-2">
                  {conflicts.slice(0, 8).map((conflict) => (
                    <div key={conflict.archive.id} className="rounded-lg border border-amber-500/20 bg-surface-950 p-2">
                      <p className="text-xs font-semibold text-zinc-100">
                        {teamName(conflict.archive.mapped_home_team_id, conflict.archive.external_home_team_id)} vs {teamName(conflict.archive.mapped_away_team_id, conflict.archive.external_away_team_id)}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        VMScore: {conflict.official.home_score ?? '-'}-{conflict.official.away_score ?? '-'} · Copa Facil: {conflict.archive.home_score ?? '-'}-{conflict.archive.away_score ?? '-'}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => keepOfficial(conflict)} disabled={updateArchiveMatch.isPending}>
                          Usar VMScore
                        </Button>
                        <Button size="sm" onClick={() => keepExternal(conflict)} disabled={updateArchiveMatch.isPending}>
                          Usar Copa Facil
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {[
                ['pending', `Pendientes ${archiveCounts.pending}`],
                ['confirmed', `Confirmados ${archiveCounts.confirmed}`],
                ['all', `Todos ${archiveCounts.all}`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setArchiveTab(key)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                    archiveTab === key
                      ? 'bg-primary text-white'
                      : 'bg-surface-800 text-zinc-400 hover:bg-surface-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Filtrar por dia</label>
              <div className="grid grid-cols-[1fr,auto] gap-2">
                <input
                  type="date"
                  value={archiveDate}
                  onChange={(event) => setArchiveDate(event.target.value)}
                  className={INPUT}
                />
                <Button variant="secondary" onClick={() => setArchiveDate('')} disabled={!archiveDate}>
                  Limpiar
                </Button>
              </div>
            </div>

            {filteredArchive.length === 0 ? (
              <p className="rounded-lg border border-surface-800 bg-surface-950 p-3 text-xs text-zinc-500">
                No hay registros para este filtro.
              </p>
            ) : (
              <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {filteredArchive.map((match) => {
                  const complete = match.scheduled_at && match.home_score !== null && match.away_score !== null
                  const computed = !!match.computed_match_id
                  const matchDate = match.scheduled_at
                    ? format(toZonedTime(new Date(match.scheduled_at), TZ), "dd/MM/yyyy HH:mm")
                    : 'Fecha pendiente'
                  return (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => openArchiveEditor(match)}
                      className="w-full rounded-lg border border-surface-800 bg-surface-950 p-3 text-left hover:border-primary/50"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500">Fecha {match.round ?? '-'} · {matchDate}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        computed
                            ? 'bg-primary/15 text-primary'
                            : match.review_status === 'confirmed'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : complete
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-amber-500/15 text-amber-300'
                        }`}>
                          {computed ? 'Publicado' : match.review_status === 'confirmed' ? 'Confirmado' : complete ? 'Completo' : 'Pendiente'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 text-sm">
                        <span className="truncate font-semibold text-zinc-100">
                          {teamName(match.mapped_home_team_id, match.external_home_team_id)}
                        </span>
                        <span className="font-bold text-zinc-100">
                          {match.home_score !== null && match.away_score !== null ? `${match.home_score} - ${match.away_score}` : 'vs'}
                        </span>
                        <span className="truncate text-right font-semibold text-zinc-100">
                          {teamName(match.mapped_away_team_id, match.external_away_team_id)}
                        </span>
                      </div>
                      {match.venue_id && (
                        <p className="mt-2 truncate text-xs text-zinc-500">
                          Cancha: {canchas.find((cancha) => cancha.id === match.venue_id)?.name ?? 'Asignada'}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

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

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha vigente en VMScore</label>
              <input
                type="number"
                min="1"
                value={form.min_round}
                onChange={(event) => setForm({ ...form, min_round: event.target.value })}
                className={INPUT}
                placeholder="8"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Se guarda todo como archivo externo. El fixture oficial no cambia hasta publicarlo manualmente.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button onClick={saveSource} disabled={upsertSource.isPending}>
                {upsertSource.isPending ? 'Guardando...' : 'Guardar fuente'}
              </Button>
              <Button variant="secondary" onClick={loadPreview} disabled={previewLoading || (!selectedSource && !form.source_url)}>
                {previewLoading ? 'Buscando...' : 'Buscar novedades ahora'}
              </Button>
            </div>
            {lastCheckedAt && (
              <p className="text-[11px] text-zinc-500">
                Ultima lectura directa de Copa Facil: {format(lastCheckedAt, 'HH:mm:ss')}
              </p>
            )}
          </div>
        </section>

        {previewError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {previewError}
          </p>
        )}

        {preview.length > 0 && (
          <>
            <section className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">Actualizaciones detectadas</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {previewChanges.length === 0
                      ? 'No hay cambios contra lo que ya esta guardado.'
                      : `${previewChanges.length} novedad${previewChanges.length === 1 ? '' : 'es'} lista${previewChanges.length === 1 ? '' : 's'} para revisar.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={runImport}
                  disabled={!selectedSource || importableCount === 0 || importMatches.isPending}
                >
                  {importMatches.isPending ? 'Guardando...' : 'Guardar novedades'}
                </Button>
              </div>

              {previewChanges.length === 0 ? (
                <p className="rounded-lg border border-surface-800 bg-surface-950/80 p-3 text-xs text-zinc-500">
                  Si Copa Facil carga un resultado nuevo, toca "Buscar novedades ahora" y va a aparecer aca antes de guardarlo.
                </p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {previewChanges.slice(0, 20).map((change) => {
                    const ready = localMappings[change.match.external_home_team_id] && localMappings[change.match.external_away_team_id]
                    const previousScore = change.archived?.home_score != null && change.archived?.away_score != null
                      ? `${change.archived.home_score} - ${change.archived.away_score}`
                      : 'sin resultado'
                    const nextScore = change.match.status === 'finished'
                      ? `${change.match.home_score} - ${change.match.away_score}`
                      : 'sin resultado'

                    return (
                      <div key={`${change.type}-${change.match.external_match_id}`} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary-light">
                            {change.label}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                            {ready ? 'Mapeado' : 'Falta mapeo'}
                          </span>
                        </div>
                        <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 text-sm">
                          <span className="truncate font-semibold text-zinc-100">{previewTeamName(change.match.external_home_team_id)}</span>
                          <span className="font-black text-zinc-100">{nextScore}</span>
                          <span className="truncate text-right font-semibold text-zinc-100">{previewTeamName(change.match.external_away_team_id)}</span>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">{previewDateLabel(change.match)}</p>
                        {change.archived && (
                          <p className="mt-1 text-[11px] text-zinc-600">
                            Guardado antes: {previousScore}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">Mapeo de equipos</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {mappedCount}/{externalTeams.length} equipos vinculados. Se guardan todas las fechas.
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
                      <p className="truncate text-xs font-semibold text-zinc-100">
                        {localMappings[team.external_team_id] ? previewTeamName(team.external_team_id) : 'Equipo sin vincular'}
                      </p>
                      <p className="truncate text-[11px] text-zinc-600">
                        Copa Facil: {team.external_team_id} · {team.matches} partidos
                      </p>
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
                    {importableCount}/{preview.length} listos. Aca ya ves los cruces con nombres si estan mapeados.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={runImport}
                  disabled={!selectedSource || importableCount === 0 || importMatches.isPending}
                >
                  {importMatches.isPending ? 'Guardando...' : 'Guardar todo'}
                </Button>
              </div>

              {result && (
                <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  Archivados: {result.updated} · Omitidos por mapeo: {result.skipped}
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
                        <span className={`truncate ${ready ? 'font-semibold text-zinc-100' : 'font-mono text-zinc-400'}`}>
                          {previewTeamName(match.external_home_team_id)}
                        </span>
                        <span className="font-bold text-zinc-100">
                          {match.status === 'finished' ? `${match.home_score} - ${match.away_score}` : 'vs'}
                        </span>
                        <span className={`truncate text-right ${ready ? 'font-semibold text-zinc-100' : 'font-mono text-zinc-400'}`}>
                          {previewTeamName(match.external_away_team_id)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <Modal
        open={!!editingArchive}
        onClose={() => setEditingArchive(null)}
        title="Editar historico"
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
            <p className="text-xs text-zinc-500">Partido</p>
            <p className="mt-1 text-sm font-bold text-zinc-100">
              {editingArchive
                ? `${teamName(editingArchive.mapped_home_team_id, editingArchive.external_home_team_id)} vs ${teamName(editingArchive.mapped_away_team_id, editingArchive.external_away_team_id)}`
                : ''}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Dia y hora</label>
            <input
              type="datetime-local"
              value={archiveForm.scheduledAtLocal}
              onChange={(event) => setArchiveForm({ ...archiveForm, scheduledAtLocal: event.target.value })}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Cancha</label>
              <select
                value={archiveForm.venueId}
                onChange={(event) => setArchiveForm({ ...archiveForm, venueId: event.target.value })}
                className={INPUT}
              >
                <option value="">Sin asignar</option>
                {canchas.map((cancha) => (
                  <option key={cancha.id} value={cancha.id}>{cancha.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Arbitro</label>
              <select
                value={archiveForm.refereeId}
                onChange={(event) => setArchiveForm({ ...archiveForm, refereeId: event.target.value })}
                className={INPUT}
              >
                <option value="">Sin asignar</option>
                {arbitros.map((arbitro) => (
                  <option key={arbitro.id} value={arbitro.id}>{arbitro.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Goles local</label>
              <input
                type="number"
                min="0"
                value={archiveForm.homeScore}
                onChange={(event) => setArchiveForm({ ...archiveForm, homeScore: event.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Goles visitante</label>
              <input
                type="number"
                min="0"
                value={archiveForm.awayScore}
                onChange={(event) => setArchiveForm({ ...archiveForm, awayScore: event.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Estado partido</label>
              <select
                value={archiveForm.status}
                onChange={(event) => setArchiveForm({ ...archiveForm, status: event.target.value })}
                className={INPUT}
              >
                <option value="scheduled">Programado</option>
                <option value="in_progress">En vivo</option>
                <option value="finished">Finalizado</option>
                <option value="postponed">Postergado</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Revision</label>
              <select
                value={archiveForm.reviewStatus}
                onChange={(event) => setArchiveForm({ ...archiveForm, reviewStatus: event.target.value })}
                className={INPUT}
              >
                <option value="pending">Pendiente</option>
                <option value="confirmed">Confirmado</option>
                <option value="ignored">Ignorado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Notas internas</label>
            <textarea
              value={archiveForm.notes}
              onChange={(event) => setArchiveForm({ ...archiveForm, notes: event.target.value })}
              className={`${INPUT} min-h-20 resize-none`}
              placeholder="Dato pendiente, fuente, aclaracion..."
            />
          </div>

          <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-xs text-primary-light">
            Publicar crea o actualiza el partido oficial para cargar cancha, formacion y eventos sin tocar la tabla. Computar tabla se usa cuando el resultado ya esta confirmado.
          </div>

          {archiveActionError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {archiveActionError}
            </p>
          )}

          {editingArchive?.computed_match_id && (
            <Button
              variant="outline"
              onClick={() => { window.location.href = `/admin/resultado/${editingArchive.computed_match_id}` }}
              className="w-full"
            >
              Cargar detalles y eventos
            </Button>
          )}

          <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-4">
            <Button
              variant="secondary"
              onClick={() => saveArchiveEditor(false)}
              disabled={updateArchiveMatch.isPending || computeArchiveMatch.isPending || publishArchiveMatch.isPending}
            >
              Guardar
            </Button>
            <Button
              variant="secondary"
              onClick={publishArchiveEditor}
              disabled={updateArchiveMatch.isPending || computeArchiveMatch.isPending || publishArchiveMatch.isPending}
            >
              {publishArchiveMatch.isPending ? 'Publicando...' : editingArchive?.computed_match_id ? 'Actualizar oficial' : 'Publicar partido'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => saveArchiveEditor(true)}
              disabled={updateArchiveMatch.isPending || computeArchiveMatch.isPending || publishArchiveMatch.isPending}
            >
              Confirmar historico
            </Button>
            <Button
              onClick={computeArchiveEditor}
              disabled={updateArchiveMatch.isPending || computeArchiveMatch.isPending || publishArchiveMatch.isPending}
            >
              {computeArchiveMatch.isPending
                ? 'Computando...'
                : editingArchive?.computed_match_id
                  ? 'Actualizar tabla'
                  : 'Computar tabla'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
