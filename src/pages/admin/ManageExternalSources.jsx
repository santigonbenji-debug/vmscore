import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { CalendarDays, DatabaseZap, MapPin, RefreshCw, Shield, Trophy } from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import { useTeams } from '../../hooks/useTeams'
import { useVenues } from '../../hooks/useVenues'
import { useReferees } from '../../hooks/useReferees'
import { useLeagueTeams } from '../../hooks/useRosters'
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
import { parseCopaFacilUrl, summarizeExternalTeams } from '../../lib/copaFacil'
import { deepScrapeCopaFacil } from '../../lib/copaFacilDeepScrape'
import {
  fetchLocosVmPublicSnapshot,
  locosCategoryKey,
  locosSnapshotToExternalMatches,
} from '../../lib/locosVm'

const TZ = 'America/Argentina/San_Luis'
const INPUT = 'w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-surface-800 text-zinc-100 border border-surface-700'
const EMPTY_MAPPINGS = []

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

function findPreviewChanges(previewRows, archiveRows, providerLabel = 'Copa Facil') {
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
          description: `${providerLabel} tiene este partido y todavia no esta en el archivo.`,
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
          description: `${providerLabel} cambio el dato de dia u horario.`,
          match,
          archived,
        }
      }

      return {
        type: 'status_changed',
        priority: 1,
        label: 'Estado actualizado',
        description: `${providerLabel} cambio el estado del partido.`,
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

function externalProviderLabel(source) {
  if (source?.provider === 'locos_vm') return 'Locos VM'
  return 'Copa Facil'
}

const LOCOS_TABS = [
  ['categories', 'Categorias'],
  ['matches', 'Partidos'],
  ['teams', 'Equipos'],
  ['venues', 'Sedes'],
  ['coverage', 'Cobertura'],
]

function locosStatusLabel(status) {
  if (status === 'finished') return 'Finalizado'
  if (status === 'live') return 'En vivo'
  if (status === 'upcoming') return 'Programado'
  return status || 'Sin estado'
}

function LocosVmReviewPanel({
  snapshot,
  loading,
  error,
  onScan,
  categoryFilter,
  onCategoryChange,
  onPrepare,
  preparing,
  canPrepare,
  destination,
}) {
  const [activeTab, setActiveTab] = useState('categories')
  const categories = snapshot?.summaries?.categories ?? []
  const matches = useMemo(() => snapshot?.data?.matches ?? [], [snapshot])
  const selectedKey = locosCategoryKey(categoryFilter)
  const scopedMatches = useMemo(() => {
    if (selectedKey === 'all') return matches
    return matches.filter((match) => locosCategoryKey(match.category) === selectedKey)
  }, [matches, selectedKey])
  const scopedTeamIds = useMemo(() => {
    const ids = new Set()
    scopedMatches.forEach((match) => {
      if (match.homeTeamId) ids.add(match.homeTeamId)
      if (match.awayTeamId) ids.add(match.awayTeamId)
    })
    return ids
  }, [scopedMatches])
  const scopedTeams = useMemo(
    () => (snapshot?.data?.teams ?? []).filter((team) => selectedKey === 'all' || scopedTeamIds.has(team.id)),
    [scopedTeamIds, selectedKey, snapshot]
  )
  const scopedVenues = useMemo(() => {
    const venues = new Map()
    scopedMatches.forEach((match) => {
      const key = String(match.venue ?? '').trim() || 'Sin sede'
      venues.set(key, (venues.get(key) ?? 0) + 1)
    })
    return [...venues.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  }, [scopedMatches])
  const visibleMatches = useMemo(
    () => [...scopedMatches].sort((a, b) => String(b.scheduledAt ?? b.date ?? '').localeCompare(String(a.scheduledAt ?? a.date ?? ''))),
    [scopedMatches]
  )
  const chosenCategory = categoryFilter === 'all' ? 'Todas las categorias' : categoryFilter

  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Bandeja Locos VM</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500">
            Revisa datos deportivos publicos y prepara una categoria. Nada modifica VMScore hasta que guardes la importacion.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onScan} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Leyendo...' : 'Actualizar'}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {!snapshot ? (
        <div className="rounded-lg border border-dashed border-surface-700 bg-surface-950 px-4 py-5 text-center">
          <DatabaseZap className="mx-auto h-5 w-5 text-primary" />
          <p className="mt-2 text-sm font-bold text-zinc-200">Todavia no hiciste el barrido</p>
          <p className="mt-1 text-xs text-zinc-500">
            Vamos a leer equipos, escudos, partidos, resultados, sedes y estado en vivo publicado.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Categorias', snapshot.counts.categories ?? 0],
              ['Partidos', snapshot.counts.matches ?? 0],
              ['Finalizados', snapshot.counts.finished_matches ?? 0],
              ['Programados', snapshot.counts.upcoming_matches ?? 0],
              ['Equipos', snapshot.counts.teams ?? 0],
              ['Sedes', snapshot.counts.venues ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-surface-800 bg-surface-950 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase text-zinc-500">{label}</p>
                <p className="mt-1 text-lg font-black text-zinc-100">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-primary/25 bg-primary/10 p-3">
            <div className="grid gap-3 lg:grid-cols-[1fr,auto]">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-300">Categoria a preparar</label>
                <select
                  value={categoryFilter}
                  onChange={(event) => onCategoryChange(event.target.value)}
                  className={INPUT}
                >
                  <option value="all">Todas las categorias detectadas</option>
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.key} - {category.count} partidos
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Destino: {destination}. Primero queda en revision; despues elegis que publicar o computar.
                </p>
              </div>
              <div className="flex items-end">
                <Button onClick={onPrepare} disabled={preparing || !canPrepare} className="w-full lg:w-auto">
                  {preparing ? 'Preparando...' : `Preparar ${chosenCategory}`}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-surface-800 pb-2">
            {LOCOS_TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  activeTab === key ? 'bg-primary text-white' : 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'categories' && (
            <div className="grid gap-2 md:grid-cols-2">
              {categories.map((category) => {
                const selected = locosCategoryKey(categoryFilter) === locosCategoryKey(category.key)
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => onCategoryChange(category.key)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected ? 'border-primary bg-primary/10' : 'border-surface-800 bg-surface-950 hover:border-surface-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-zinc-100">{category.key}</span>
                      <span className="rounded-full bg-surface-800 px-2 py-0.5 text-[11px] font-black text-zinc-200">
                        {category.count}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                      <span>{category.teams ?? 0} equipos</span>
                      <span>{category.finished ?? 0} finalizados</span>
                      <span>{category.upcoming ?? 0} programados</span>
                      <span>{category.rounds?.length ?? 0} fechas</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {activeTab === 'matches' && (
            <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {visibleMatches.map((match) => (
                <div key={match.id} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-zinc-500">
                      {match.date || 'Sin fecha'} {match.time || ''} {match.round != null ? `- Fecha ${match.round}` : ''}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${
                      match.status === 'finished'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : match.status === 'live'
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-sky-500/15 text-sky-300'
                    }`}>
                      {locosStatusLabel(match.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 text-sm">
                    <span className="truncate font-semibold text-zinc-100">{match.homeTeam?.shortName || match.homeTeam?.name || 'Local'}</span>
                    <span className="font-black text-zinc-100">
                      {match.homeScore != null && match.awayScore != null ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                    </span>
                    <span className="truncate text-right font-semibold text-zinc-100">{match.awayTeam?.shortName || match.awayTeam?.name || 'Visitante'}</span>
                  </div>
                  <p className="mt-2 truncate text-[11px] text-zinc-500">
                    {match.category} - {match.venue || 'Sede sin informar'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {scopedTeams.map((team) => (
                <div key={team.id} className="flex items-center gap-3 rounded-lg border border-surface-800 bg-surface-950 p-3">
                  {team.logoUrl ? (
                    <img src={team.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-contain p-1" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-800">
                      <Shield className="h-4 w-4 text-zinc-500" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-100">{team.name || team.shortName}</p>
                    <p className="truncate text-[11px] text-zinc-500">{team.shortName || 'Sin nombre corto'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'venues' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {scopedVenues.map((venue) => (
                <div key={venue.key} className="flex items-center justify-between gap-3 rounded-lg border border-surface-800 bg-surface-950 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-sm font-semibold text-zinc-200">{venue.key}</span>
                  </div>
                  <span className="shrink-0 text-xs font-black text-zinc-400">{venue.count}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'coverage' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [Shield, 'Escudos', snapshot.summaries?.field_coverage?.teams_with_logo ?? 0, snapshot.counts.teams ?? 0],
                [CalendarDays, 'Partidos con fecha', snapshot.summaries?.field_coverage?.matches_with_date ?? 0, snapshot.counts.matches ?? 0],
                [MapPin, 'Partidos con sede', snapshot.summaries?.field_coverage?.matches_with_venue ?? 0, snapshot.counts.matches ?? 0],
                [Trophy, 'Partidos con resultado', snapshot.summaries?.field_coverage?.matches_with_score ?? 0, snapshot.counts.matches ?? 0],
                [DatabaseZap, 'Estados en vivo publicados', snapshot.counts.matches_with_live_state ?? 0, snapshot.counts.matches ?? 0],
                [RefreshCw, 'Repeticiones publicadas', snapshot.counts.matches_with_vod_url ?? 0, snapshot.counts.matches ?? 0],
              ].map(([Icon, label, value, total]) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border border-surface-800 bg-surface-950 p-3">
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-bold text-zinc-200">{label}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{value} de {total}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-zinc-600">
            Tambien se detectaron {snapshot.counts.sponsors ?? 0} patrocinadores publicos y {snapshot.counts.sponsor_links ?? 0} asociaciones con partidos. Los videos y creditos quedan fuera de la importacion deportiva.
          </p>
        </div>
      )}
    </section>
  )
}

export default function ManageExternalSources() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [selectedSourceDraft, setSelectedSourceDraft] = useState(null)
  const [preview, setPreview] = useState([])
  const [previewError, setPreviewError] = useState('')
  const [archiveActionError, setArchiveActionError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const [previewRoundFilter, setPreviewRoundFilter] = useState('all')
  const [localMappings, setLocalMappings] = useState({})
  const [result, setResult] = useState(null)
  const [archiveTab, setArchiveTab] = useState('pending')
  const [archiveRoundFilter, setArchiveRoundFilter] = useState('all')
  const [archiveDate, setArchiveDate] = useState('')
  const [editingArchive, setEditingArchive] = useState(null)
  const [locosSnapshot, setLocosSnapshot] = useState(null)
  const [locosLoading, setLocosLoading] = useState(false)
  const [locosError, setLocosError] = useState('')
  const [locosCategoryFilter, setLocosCategoryFilter] = useState('all')
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
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? selectedSourceDraft
  const selectedLeague = leagues.find((league) => league.id === (selectedSource?.league_id ?? form.league_id))
  const { data: teams = [] } = useTeams({ sportId: selectedLeague?.sport_id })
  const { data: leagueTeams = [] } = useLeagueTeams(selectedSource?.league_id ?? form.league_id)
  const { data: canchas = [] } = useVenues()
  const { data: arbitros = [] } = useReferees()
  const { data: savedMappingsData } = useExternalTeamMappings(selectedSourceId)
  const savedMappings = savedMappingsData ?? EMPTY_MAPPINGS
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
    if (!selectedSourceId) return
    const next = {}
    savedMappings.forEach((mapping) => {
      next[mapping.external_team_id] = mapping.team_id
    })
    setLocalMappings(next)
  }, [savedMappings, selectedSourceId])

  const externalTeams = useMemo(() => summarizeExternalTeams(preview), [preview])
  const mappingTeams = useMemo(() => {
    const leagueOptions = leagueTeams.map((team) => ({
      id: team.team_id,
      name: team.team_name,
      short_name: team.team_short_name,
      logo_url: team.team_logo_url,
      fromLeague: true,
    }))
    const leagueIds = new Set(leagueOptions.map((team) => team.id))
    const sportOptions = teams
      .filter((team) => !leagueIds.has(team.id))
      .map((team) => ({
        id: team.id,
        name: team.name,
        short_name: team.short_name,
        logo_url: team.logo_url,
        fromLeague: false,
      }))
    return [...leagueOptions, ...sportOptions]
  }, [leagueTeams, teams])
  const teamMap = useMemo(() => new Map(mappingTeams.map((team) => [team.id, team])), [mappingTeams])
  const mappedCount = externalTeams.filter((team) => localMappings[team.external_team_id]).length
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
        if (archiveRoundFilter === 'all') return true
        return Number(match.round) === Number(archiveRoundFilter)
      })
      .filter((match) => {
        if (!archiveDate) return true
        if (!match.scheduled_at) return false
        return format(toZonedTime(new Date(match.scheduled_at), TZ), 'yyyy-MM-dd') === archiveDate
      })
  }, [archive, archiveDate, archiveRoundFilter, archiveTab])
  const conflicts = useMemo(() => findArchiveConflicts(archive, officialMatches), [archive, officialMatches])
  const roundOptions = useMemo(() => {
    const rounds = new Set()
    Array.from({ length: 30 }, (_, index) => index + 1).forEach((round) => rounds.add(round))
    ;[...preview, ...archive].forEach((match) => {
      if (match.round != null) rounds.add(Number(match.round))
    })
    return [...rounds].sort((a, b) => a - b)
  }, [archive, preview])
  const previewForReview = useMemo(() => {
    if (previewRoundFilter === 'all') return preview
    return preview.filter((match) => Number(match.round) === Number(previewRoundFilter))
  }, [preview, previewRoundFilter])
  const previewChanges = useMemo(
    () => findPreviewChanges(previewForReview, archive, externalProviderLabel(selectedSource)),
    [archive, previewForReview, selectedSource]
  )
  const importableCount = previewForReview.filter((match) =>
    localMappings[match.external_home_team_id] && localMappings[match.external_away_team_id]
  ).length

  function fillFromSource(source) {
    setSelectedSourceId(source.id)
    setSelectedSourceDraft(null)
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
    if (source.provider === 'locos_vm') setLocosCategoryFilter(source.division_code || 'all')
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
    setSelectedSourceDraft(source)
    setPreviewError('')
  }

  async function scanLocosVm() {
    setLocosError('')
    setLocosLoading(true)
    try {
      setLocosSnapshot(await fetchLocosVmPublicSnapshot())
    } catch (error) {
      setLocosError(error?.message ?? 'No se pudo leer Locos VM.')
    } finally {
      setLocosLoading(false)
    }
  }

  async function saveLocosSource() {
    if (!form.league_id || !form.phase_id) {
      setLocosError('Selecciona liga y fase destino antes de guardar Locos VM.')
      return null
    }

    const categoryCode = locosCategoryFilter === 'all' ? 'all' : locosCategoryKey(locosCategoryFilter)
    const categoryLabel = locosCategoryFilter === 'all' ? 'Todos' : locosCategoryFilter
    const source = await upsertSource.mutateAsync({
      provider: 'locos_vm',
      league_id: form.league_id,
      phase_id: form.phase_id,
      label: form.label || `Locos VM - ${categoryLabel}`,
      source_url: 'https://www.locosporelfutbolvm.com/',
      event_code: form.league_id,
      division_code: categoryCode,
      min_round: Number(form.min_round) || 1,
      sync_enabled: false,
      updated_at: new Date().toISOString(),
    })
    setSelectedSourceId(source.id)
    setSelectedSourceDraft(source)
    setPreviewError('')
    setLocosError('')
    return source
  }

  async function loadLocosPreview() {
    setLocosError('')
    setPreviewError('')
    setPreviewLoading(true)
    setResult(null)
    try {
      const snapshot = locosSnapshot ?? await fetchLocosVmPublicSnapshot()
      setLocosSnapshot(snapshot)
      const source = selectedSource?.provider === 'locos_vm' ? selectedSource : await saveLocosSource()
      if (!source) return
      const matches = locosSnapshotToExternalMatches(snapshot, { category: locosCategoryFilter })
      setPreview(matches)
      setLastCheckedAt(new Date())
      if (matches.length === 0) {
        setPreviewError('No se encontraron partidos de Locos VM para esa categoria.')
      }
    } catch (error) {
      setLocosError(error?.message ?? 'No se pudo usar Locos VM.')
    } finally {
      setPreviewLoading(false)
    }
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
      let matches = []
      if (sourceLike.provider === 'locos_vm') {
        const snapshot = locosSnapshot ?? await fetchLocosVmPublicSnapshot()
        setLocosSnapshot(snapshot)
        matches = locosSnapshotToExternalMatches(snapshot, { category: sourceLike.division_code || locosCategoryFilter })
      } else {
        const snapshot = await deepScrapeCopaFacil(sourceLike.source_url ?? form.source_url)
        matches = snapshot?.extracted?.matches ?? []
      }
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
    if (!selectedSource || previewForReview.length === 0) return
    await saveMappingChanges()
    const summary = await importMatches.mutateAsync({
      source: selectedSource,
      matches: previewForReview,
      mappings: localMappings,
    })
    setResult(summary)
    setArchiveTab('pending')
    setArchiveRoundFilter(previewRoundFilter)
    setArchiveDate('')
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
    const external = externalTeams.find((team) => team.external_team_id === externalId)
    return teamName(
      localMappings[externalId],
      external?.external_team_short_name || external?.external_team_name || externalId
    )
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
        admin_notes: `Conflicto resuelto: se muestra el partido importado desde ${externalProviderLabel(selectedSource)}.`,
      },
    })
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Importar datos externos</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Busca novedades, revisa cruces y despues decide que guardar, publicar o computar.
        </p>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-zinc-100">1. Elegir torneo</h2>
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
                    {source.label || source.leagues?.name || externalProviderLabel(source)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {externalProviderLabel(source)} · {source.leagues?.name} · {source.phases?.name} · archivo desde Fecha {source.min_round ?? 1}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedSource && (
          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <h2 className="text-sm font-bold text-zinc-100">Opciones de sincronizacion</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Esta fuente puede alimentar fixture, resultados y vivo. La tabla solo cambia cuando publicas o computas un partido.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                <p className="text-xs font-bold text-emerald-300">Importar partidos</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Guarda cruces, fechas, sedes detectables y resultados en revision.
                </p>
              </div>
              <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                <p className="text-xs font-bold text-emerald-300">Vincular y sincronizar</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Copa Facil puede detectar goles y final. Locos VM queda como archivo publico mientras no entregue vivo real.
                </p>
              </div>
              <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                <p className="text-xs font-bold text-amber-300">Computar tabla</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Manual y confirmado. Asi juveniles, futsal o primera no rompen posiciones por error.
                </p>
              </div>
              <div className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                <p className="text-xs font-bold text-amber-300">Crear nuevas ligas</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Si una fuente tiene juveniles u otro torneo, primero creas la liga/fase y luego guardas esta fuente.
                </p>
              </div>
            </div>
          </section>
        )}

        {selectedSourceId && (
          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">Historico externo</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  La fuente externa queda aca como registro. Confirmar no modifica la tabla de posiciones.
                </p>
              </div>
              {loadingArchive && <Spinner />}
            </div>

            {conflicts.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="mb-2">
                  <h3 className="text-sm font-bold text-amber-200">Partidos duplicados</h3>
                  <p className="mt-1 text-xs text-amber-100/70">
                    Hay {conflicts.length} cruce{conflicts.length === 1 ? '' : 's'} que existe{conflicts.length === 1 ? '' : 'n'} en VMScore y {externalProviderLabel(selectedSource)}.
                  </p>
                </div>
                <div className="space-y-2">
                  {conflicts.slice(0, 8).map((conflict) => (
                    <div key={conflict.archive.id} className="rounded-lg border border-amber-500/20 bg-surface-950 p-2">
                      <p className="text-xs font-semibold text-zinc-100">
                        {teamName(conflict.archive.mapped_home_team_id, conflict.archive.external_home_team_id)} vs {teamName(conflict.archive.mapped_away_team_id, conflict.archive.external_away_team_id)}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        VMScore: {conflict.official.home_score ?? '-'}-{conflict.official.away_score ?? '-'} · {externalProviderLabel(selectedSource)}: {conflict.archive.home_score ?? '-'}-{conflict.archive.away_score ?? '-'}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => keepOfficial(conflict)} disabled={updateArchiveMatch.isPending}>
                          Usar VMScore
                        </Button>
                        <Button size="sm" onClick={() => keepExternal(conflict)} disabled={updateArchiveMatch.isPending}>
                          Usar {externalProviderLabel(selectedSource)}
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

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto]">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">Filtrar por fecha</label>
                <select
                  value={archiveRoundFilter}
                  onChange={(event) => setArchiveRoundFilter(event.target.value)}
                  className={INPUT}
                >
                  <option value="all">Todas las fechas</option>
                  {roundOptions.map((round) => (
                    <option key={round} value={round}>Fecha {round}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">Filtrar por dia</label>
                <input
                  type="date"
                  value={archiveDate}
                  onChange={(event) => setArchiveDate(event.target.value)}
                  className={INPUT}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setArchiveDate('')
                    setArchiveRoundFilter('all')
                  }}
                  disabled={!archiveDate && archiveRoundFilter === 'all'}
                  className="w-full"
                >
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
          <h2 className="mb-3 text-sm font-bold text-zinc-100">2. Configurar destino y fuentes</h2>
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

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha a revisar</label>
              <select
                value={previewRoundFilter}
                onChange={(event) => setPreviewRoundFilter(event.target.value)}
                className={INPUT}
              >
                <option value="all">Todas las fechas</option>
                {roundOptions.map((round) => (
                  <option key={round} value={round}>Fecha {round}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-500">
                Para revisar una sola jornada, elegi la fecha y toca buscar novedades.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button onClick={saveSource} disabled={upsertSource.isPending}>
                {upsertSource.isPending ? 'Guardando...' : 'Guardar fuente'}
              </Button>
              <Button variant="secondary" onClick={loadPreview} disabled={previewLoading || (!selectedSource && !form.source_url)}>
                {previewLoading ? 'Buscando...' : selectedSource?.provider === 'locos_vm' ? 'Buscar Locos VM ahora' : 'Buscar novedades ahora'}
              </Button>
            </div>
            {lastCheckedAt && (
              <p className="text-[11px] text-zinc-500">
                Ultima lectura directa: {format(lastCheckedAt, 'HH:mm:ss')}
              </p>
            )}
          </div>
        </section>

        <LocosVmReviewPanel
          snapshot={locosSnapshot}
          loading={locosLoading}
          error={locosError}
          onScan={scanLocosVm}
          categoryFilter={locosCategoryFilter}
          onCategoryChange={setLocosCategoryFilter}
          onPrepare={loadLocosPreview}
          preparing={previewLoading || upsertSource.isPending}
          canPrepare={Boolean(form.league_id && form.phase_id)}
          destination={`${selectedLeague?.name || 'Selecciona una liga'} - ${phases.find((phase) => phase.id === form.phase_id)?.name || 'selecciona una fase'}`}
        />

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
                  <h2 className="text-sm font-bold text-zinc-100">3. Novedades para confirmar</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {previewChanges.length === 0
                      ? `No hay cambios${previewRoundFilter === 'all' ? '' : ` en Fecha ${previewRoundFilter}`} contra lo que ya esta guardado.`
                      : `${previewChanges.length} novedad${previewChanges.length === 1 ? '' : 'es'}${previewRoundFilter === 'all' ? '' : ` en Fecha ${previewRoundFilter}`} lista${previewChanges.length === 1 ? '' : 's'} para revisar.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={runImport}
                  disabled={!selectedSource || importableCount === 0 || importMatches.isPending}
                >
                  {importMatches.isPending ? 'Guardando...' : previewRoundFilter === 'all' ? 'Guardar novedades' : `Guardar Fecha ${previewRoundFilter}`}
                </Button>
              </div>

              {previewChanges.length === 0 ? (
                <p className="rounded-lg border border-surface-800 bg-surface-950/80 p-3 text-xs text-zinc-500">
                  Si la fuente carga un resultado nuevo, toca "Buscar novedades ahora" y va a aparecer aca antes de guardarlo.
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
                    {mappedCount}/{externalTeams.length} equipos vinculados. Primero aparecen los equipos de esta liga.
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
                        Externo: {team.external_team_short_name || team.external_team_name || team.external_team_id} · {team.matches} partidos
                      </p>
                    </div>
                    <select
                      value={localMappings[team.external_team_id] ?? ''}
                      onChange={(event) => {
                        const teamId = event.target.value
                        setLocalMappings((current) => ({
                          ...current,
                          [team.external_team_id]: teamId,
                        }))
                      }}
                      className={INPUT}
                    >
                      <option value="">Sin mapear</option>
                      {mappingTeams.map((vmTeam) => (
                        <option key={vmTeam.id} value={vmTeam.id}>
                          {vmTeam.fromLeague ? 'Liga - ' : 'Otro - '}{vmTeam.name}
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
                  <h2 className="text-sm font-bold text-zinc-100">Cruces leidos</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {importableCount}/{previewForReview.length} listos{previewRoundFilter === 'all' ? '' : ` en Fecha ${previewRoundFilter}`}. Aca ya ves los cruces con nombres si estan mapeados.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={runImport}
                  disabled={!selectedSource || importableCount === 0 || importMatches.isPending}
                >
                  {importMatches.isPending ? 'Guardando...' : previewRoundFilter === 'all' ? 'Guardar todo' : `Guardar Fecha ${previewRoundFilter}`}
                </Button>
              </div>

              {result && (
                <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  Archivados: {result.updated} · Omitidos por mapeo: {result.skipped}
                </p>
              )}

              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {previewForReview.slice(0, 80).map((match) => {
                  const ready = localMappings[match.external_home_team_id] && localMappings[match.external_away_team_id]
                  return (
                    <div key={match.external_match_id} className="rounded-lg border border-surface-800 bg-surface-950 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500">{previewDateLabel(match)}</span>
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
        eyebrow="Importacion"
        description="Revisa un partido importado antes de publicarlo, confirmarlo o computarlo en la tabla oficial."
        icon={<DatabaseZap className="h-5 w-5" />}
        size="lg"
        guide={[
          { title: 'Datos', text: 'Dia, cancha y arbitro.' },
          { title: 'Publicar', text: 'Lo lleva al fixture oficial.' },
          { title: 'Tabla', text: 'Computa solo cuando corresponde.' },
        ]}
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
            Publicar crea o actualiza el partido oficial para cargar cancha, convocados y eventos. Al finalizar, el resultado oficial actualiza la tabla.
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
