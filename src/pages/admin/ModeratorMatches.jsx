import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, MapPin, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLeague, usePhases } from '../../hooks/useLeagues'
import { useLeagueMatches, usePostponeMatch, useSaveMatchScore, useUpdateMatchDetails } from '../../hooks/useMatches'
import { useMyModeratorLeagues } from '../../hooks/useModerators'
import { useCreateVenue, useVenues } from '../../hooks/useVenues'
import { useReferees } from '../../hooks/useReferees'
import { formatFechaHora, labelStatus, utcToInputLocal } from '../../lib/helpers'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import TeamLogo from '../../components/teams/TeamLogo'

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

const STATUS_VARIANT = {
  scheduled: 'default',
  in_progress: 'live',
  finished: 'success',
  postponed: 'warning',
  cancelled: 'danger',
}

const EMPTY_FORM = {
  scheduledAtLocal: '',
  round: '',
  venue_id: '',
  referee_id: '',
  status: 'scheduled',
  notes: '',
  home_technical_director: '',
  away_technical_director: '',
  home_score: '',
  away_score: '',
}

const EMPTY_VENUE_FORM = {
  name: '',
  address: '',
  city: '',
  capacity: '',
}

export default function ModeratorMatches() {
  const { leagueId, moderatorLeagueIds } = useAuth()
  const [selectedLeagueId, setSelectedLeagueId] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creatingVenue, setCreatingVenue] = useState(false)
  const [venueForm, setVenueForm] = useState(EMPTY_VENUE_FORM)
  const { data: moderatorLeagues = [], isLoading: loadingModeratorLeagues } = useMyModeratorLeagues()
  const activeLeagueId = selectedLeagueId || moderatorLeagues[0]?.id || leagueId || moderatorLeagueIds[0] || ''
  const { data: league, isLoading: loadingLeague } = useLeague(activeLeagueId)
  const { data: phases = [] } = usePhases(activeLeagueId)
  const { data: matches = [], isLoading: loadingMatches } = useLeagueMatches(activeLeagueId)
  const { data: venues = [] } = useVenues({ organizationId: league?.organization_id })
  const { data: referees = [] } = useReferees({ organizationId: league?.organization_id })
  const updateDetails = useUpdateMatchDetails()
  const saveScore = useSaveMatchScore()
  const postponeMatch = usePostponeMatch()
  const createVenue = useCreateVenue()

  useEffect(() => {
    if (selectedLeagueId) return
    if (moderatorLeagues[0]?.id) setSelectedLeagueId(moderatorLeagues[0].id)
  }, [moderatorLeagues, selectedLeagueId])

  const visibleMatches = useMemo(() => (
    matches
      .filter((match) => phaseFilter === 'all' || match.phase_id === phaseFilter)
      .sort((a, b) => {
        const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
        const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
        return aTime - bTime
      })
  ), [matches, phaseFilter])

  const availableRounds = useMemo(() => {
    const rounds = [...new Set(
      visibleMatches
        .map((match) => match.round)
        .filter((round) => round !== null && round !== undefined && round !== ''),
    )]
    return rounds.sort((a, b) => Number(a) - Number(b))
  }, [visibleMatches])

  const hasUnassignedRound = useMemo(() => (
    visibleMatches.some((match) => match.round === null || match.round === undefined || match.round === '')
  ), [visibleMatches])

  const filteredMatches = useMemo(() => {
    if (roundFilter === 'all') return visibleMatches
    if (roundFilter === 'none') {
      return visibleMatches.filter((match) => match.round === null || match.round === undefined || match.round === '')
    }
    return visibleMatches.filter((match) => String(match.round) === String(roundFilter))
  }, [roundFilter, visibleMatches])

  useEffect(() => {
    const roundValues = availableRounds.map((round) => String(round))
    if (roundFilter === 'all') return
    if (roundFilter === 'none' && hasUnassignedRound) return
    if (roundValues.includes(String(roundFilter))) return
    setRoundFilter(roundValues[0] ?? (hasUnassignedRound ? 'none' : 'all'))
  }, [availableRounds, hasUnassignedRound, roundFilter])

  const matchesByRound = useMemo(() => {
    const groups = new Map()
    filteredMatches.forEach((match) => {
      const key = match.round ?? 'none'
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: match.round ? `Fecha ${match.round}` : 'Sin fecha asignada',
          matches: [],
        })
      }
      groups.get(key).matches.push(match)
    })

    return [...groups.values()]
      .sort((a, b) => {
        if (a.key === 'none') return 1
        if (b.key === 'none') return -1
        return Number(a.key) - Number(b.key)
      })
      .map((group) => ({
        ...group,
        matches: group.matches.sort((a, b) => {
          const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
          const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
          return aTime - bTime
        }),
      }))
  }, [filteredMatches])

  function openEdit(match) {
    setEditing(match)
    setForm({
      scheduledAtLocal: utcToInputLocal(match.scheduled_at),
      round: match.round ?? '',
      venue_id: match.venue_id ?? '',
      referee_id: match.referee_id ?? '',
      status: match.status ?? 'scheduled',
      notes: match.notes ?? '',
      home_technical_director: match.home_technical_director ?? '',
      away_technical_director: match.away_technical_director ?? '',
      home_score: match.home_score ?? '',
      away_score: match.away_score ?? '',
    })
    setVenueForm({
      ...EMPTY_VENUE_FORM,
      city: league?.organizations?.city ?? '',
    })
    setCreatingVenue(false)
  }

  async function createVenueFromEdit() {
    const name = venueForm.name.trim()
    if (!name) return alert('Escribe el nombre de la cancha.')
    if (!league?.organization_id) return alert('Esta liga no tiene una organizacion asignada para guardar la cancha.')

    try {
      const venue = await createVenue.mutateAsync({
        organization_id: league.organization_id,
        name,
        address: venueForm.address.trim() || null,
        city: venueForm.city.trim() || league.organizations?.city || null,
        capacity: venueForm.capacity ? parseInt(venueForm.capacity) : null,
      })
      setForm((current) => ({ ...current, venue_id: venue.id }))
      setVenueForm({
        ...EMPTY_VENUE_FORM,
        city: league?.organizations?.city ?? '',
      })
      setCreatingVenue(false)
    } catch (err) {
      console.error(err)
      alert('No se pudo crear la cancha. Revisa los datos e intenta de nuevo.')
    }
  }

  async function save() {
    if (!editing) return
    if (form.status !== 'postponed' && !form.scheduledAtLocal) {
      alert('La fecha y hora son obligatorias. Usa Postergado si queda a definir.')
      return
    }
    const hasScore = form.home_score !== '' || form.away_score !== ''
    if (hasScore && (form.home_score === '' || form.away_score === '')) {
      alert('Carga los goles de ambos equipos.')
      return
    }

    await updateDetails.mutateAsync({
      id: editing.id,
      scheduledAtLocal: form.scheduledAtLocal,
      round: form.round === '' ? null : parseInt(form.round),
      venue_id: form.venue_id || null,
      referee_id: form.referee_id || null,
      status: form.status,
      notes: form.notes || null,
      home_technical_director: form.home_technical_director || null,
      away_technical_director: form.away_technical_director || null,
    })
    if (hasScore) {
      await saveScore.mutateAsync({
        id: editing.id,
        homeScore: form.home_score,
        awayScore: form.away_score,
        status: form.status === 'finished' ? 'finished' : 'in_progress',
      })
    }
    setEditing(null)
  }

  async function postpone() {
    if (!editing || !window.confirm('Marcar este partido como suspendido con nueva fecha a definir?')) return
    await postponeMatch.mutateAsync({ id: editing.id })
    setEditing(null)
  }

  if (loadingModeratorLeagues || loadingLeague || loadingMatches) return <Spinner className="py-24" />

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-wide text-primary">Moderacion</p>
        <h1 className="mt-1 text-xl font-bold text-zinc-100">{league?.name || 'Partidos de mi liga'}</h1>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Edita horarios, sedes y resultados. Para publicar goles o cargar convocados entra a Eventos y vivo.
        </p>
      </div>

      {moderatorLeagues.length > 1 && (
        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold text-zinc-400">Liga a operar</label>
          <select
            value={activeLeagueId}
            onChange={(event) => {
              setSelectedLeagueId(event.target.value)
              setPhaseFilter('all')
              setRoundFilter('all')
            }}
            className="w-full rounded-xl border border-surface-700 bg-surface-900 px-3 py-3 text-sm font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {moderatorLeagues.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} - {item.organization_city}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        <button
          onClick={() => {
            setPhaseFilter('all')
            setRoundFilter('all')
          }}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${phaseFilter === 'all' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
        >
          Todas las fases
        </button>
        {phases.map((phase) => (
          <button
            key={phase.id}
            onClick={() => {
              setPhaseFilter(phase.id)
              setRoundFilter('all')
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${phaseFilter === phase.id ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
          >
            {phase.name}
          </button>
        ))}
      </div>

      {visibleMatches.length > 0 && (
        <div className="mb-5 rounded-xl border border-surface-800 bg-surface-900 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Fechas</p>
              <p className="mt-0.5 text-xs text-zinc-400">Elegí una fecha para operar sus partidos.</p>
            </div>
            <span className="rounded-full bg-surface-800 px-2.5 py-1 text-[11px] font-black text-zinc-300">
              {filteredMatches.length}
            </span>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            <button
              onClick={() => setRoundFilter('all')}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${roundFilter === 'all' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
            >
              Todas
            </button>
            {availableRounds.map((round) => (
              <button
                key={round}
                onClick={() => setRoundFilter(String(round))}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${String(roundFilter) === String(round) ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                Fecha {round}
              </button>
            ))}
            {hasUnassignedRound && (
              <button
                onClick={() => setRoundFilter('none')}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${roundFilter === 'none' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                Sin fecha
              </button>
            )}
          </div>
        </div>
      )}

      {visibleMatches.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">No hay partidos publicados en esta liga.</p>
      ) : (
        <div className="space-y-5">
          {matchesByRound.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-black text-zinc-100">{group.label}</h2>
                <span className="text-xs text-zinc-500">{group.matches.length} partido{group.matches.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-3">
                {group.matches.map((match) => (
                  <article key={match.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-400">{match.phase_name}{match.round ? ` - Fecha ${match.round}` : ''}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                    <CalendarClock className="h-3.5 w-3.5 text-primary" />
                    {match.date_tbd ? 'Fecha nueva a definir' : formatFechaHora(match.scheduled_at)}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[match.status] ?? 'default'}>{labelStatus(match.status)}</Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TeamLogo logoUrl={match.home_team_logo_url} name={match.home_team_name} />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-100">{match.home_team_short_name ?? match.home_team_name}</p>
                  <p className="text-lg font-black text-zinc-100">{match.home_score ?? '-'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <TeamLogo logoUrl={match.away_team_logo_url} name={match.away_team_name} />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-100">{match.away_team_short_name ?? match.away_team_name}</p>
                  <p className="text-lg font-black text-zinc-100">{match.away_score ?? '-'}</p>
                </div>
              </div>

              <p className="mt-3 flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {match.venue_name || 'Cancha sin asignar'}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(match)}>Editar detalles</Button>
                <Link to={`/admin/resultado/${match.id}`}>
                  <Button size="sm" className="w-full">Eventos y vivo</Button>
                </Link>
              </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar partido"
        eyebrow="Moderacion"
        description="Resuelve horario, sede, estado y marcador sin salir de la bandeja."
        icon={<SlidersHorizontal className="h-5 w-5" />}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha y hora</label>
              <input type="datetime-local" value={form.scheduledAtLocal} onChange={(event) => setForm({ ...form, scheduledAtLocal: event.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha / jornada</label>
              <input type="number" value={form.round} onChange={(event) => setForm({ ...form, round: event.target.value })} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-zinc-400">Cancha</label>
                <button
                  type="button"
                  onClick={() => setCreatingVenue((value) => !value)}
                  className="text-xs font-bold text-primary hover:text-orange-300"
                >
                  {creatingVenue ? 'Cancelar nueva' : '+ Crear cancha'}
                </button>
              </div>
              <select value={form.venue_id} onChange={(event) => setForm({ ...form, venue_id: event.target.value })} className={INPUT}>
                <option value="">Sin asignar</option>
                {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Arbitro</label>
              <select value={form.referee_id} onChange={(event) => setForm({ ...form, referee_id: event.target.value })} className={INPUT}>
                <option value="">Sin asignar</option>
                {referees.map((referee) => <option key={referee.id} value={referee.id}>{referee.name}</option>)}
              </select>
            </div>
          </div>
          {creatingVenue && (
            <div className="rounded-xl border border-primary/25 bg-primary/10 p-3">
              <div className="mb-3">
                <p className="text-sm font-black text-zinc-100">Nueva cancha</p>
                <p className="mt-0.5 text-xs text-zinc-500">Se guarda en la organizacion de esta liga y queda seleccionada para el partido.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre *</label>
                  <input
                    type="text"
                    value={venueForm.name}
                    placeholder="Polideportivo Municipal"
                    onChange={(event) => setVenueForm({ ...venueForm, name: event.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">Direccion</label>
                  <input
                    type="text"
                    value={venueForm.address}
                    placeholder="Av. Principal 1200"
                    onChange={(event) => setVenueForm({ ...venueForm, address: event.target.value })}
                    className={INPUT}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-400">Ciudad</label>
                    <input
                      type="text"
                      value={venueForm.city}
                      onChange={(event) => setVenueForm({ ...venueForm, city: event.target.value })}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-400">Capacidad</label>
                    <input
                      type="number"
                      min="0"
                      value={venueForm.capacity}
                      onChange={(event) => setVenueForm({ ...venueForm, capacity: event.target.value })}
                      className={INPUT}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={createVenueFromEdit}
                  disabled={createVenue.isPending || !venueForm.name.trim()}
                  className="w-full"
                >
                  {createVenue.isPending ? 'Creando cancha...' : 'Guardar cancha y usarla'}
                </Button>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Estado</label>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={INPUT}>
              <option value="scheduled">Programado</option>
              <option value="in_progress">En vivo</option>
              <option value="finished">Finalizado</option>
              <option value="postponed">Postergado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          {form.status !== 'postponed' && form.status !== 'cancelled' && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
              <p className="mb-3 text-sm font-black text-zinc-100">Marcador</p>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="0" value={form.home_score} onChange={(event) => setForm({ ...form, home_score: event.target.value })} className={`${INPUT} text-center text-xl font-black`} placeholder="Local" />
                <input type="number" min="0" value={form.away_score} onChange={(event) => setForm({ ...form, away_score: event.target.value })} className={`${INPUT} text-center text-xl font-black`} placeholder="Visit." />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input value={form.home_technical_director} onChange={(event) => setForm({ ...form, home_technical_director: event.target.value })} className={INPUT} placeholder="DT local" />
            <input value={form.away_technical_director} onChange={(event) => setForm({ ...form, away_technical_director: event.target.value })} className={INPUT} placeholder="DT visitante" />
          </div>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`${INPUT} min-h-20 resize-none`} placeholder="Notas internas" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={postpone} disabled={postponeMatch.isPending}>Suspender</Button>
            <Button onClick={save} disabled={updateDetails.isPending || saveScore.isPending}>Guardar cambios</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
