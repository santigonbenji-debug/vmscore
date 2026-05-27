import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarPlus, ChevronLeft, GitBranch, Plus, Trophy, Users } from 'lucide-react'
import {
  useCreatePhase,
  useDeletePhase,
  useLeague,
  usePhases,
  useUpdatePhase,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { useLeagueMatches } from '../../hooks/useMatches'
import { useTeams } from '../../hooks/useTeams'
import { useAddTeamToLeague, useLeagueTeams, useRemoveTeamFromLeague } from '../../hooks/useRosters'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import TeamLogo from '../../components/teams/TeamLogo'

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

const TYPE_LABEL = {
  liga: 'Liga',
  copa: 'Copa',
  torneo: 'Torneo',
  campeonato: 'Campeonato',
}

const FORMAT_LABEL = {
  round_robin: 'Todos contra todos',
  playoffs: 'Eliminacion directa',
  championship: 'Grupos y definicion',
}

const PHASE_TYPES = [
  { value: 'round_robin', label: 'Tabla / todos contra todos' },
  { value: 'groups', label: 'Fase de grupos' },
  { value: 'knockout', label: 'Eliminatoria' },
]

const KNOCKOUT_PHASES = ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final']

function initialPhaseForm(league, phases) {
  return {
    name: league?.format === 'playoffs' ? 'Semifinal' : 'Nueva fase',
    type: league?.format === 'playoffs' ? 'knockout' : 'round_robin',
    phase_order: (phases?.length ?? 0) + 1,
  }
}

function StepCard({ number, title, text, ready, children }) {
  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
          ready ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/15 text-primary'
        }`}>
          {ready ? 'OK' : number}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-zinc-100">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{text}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function ManageCompetition() {
  const { leagueId } = useParams()
  const { isSuperAdmin } = useAuth()
  const { data: league, isLoading: loadingLeague } = useLeague(leagueId)
  const { data: phases = [], isLoading: loadingPhases } = usePhases(leagueId)
  const { data: enrolled = [], isLoading: loadingEnrolled } = useLeagueTeams(leagueId)
  const { data: matches = [] } = useLeagueMatches(leagueId)
  const { data: candidateTeams = [] } = useTeams({
    sportId: isSuperAdmin ? undefined : league?.sport_id,
    organizationId: isSuperAdmin ? undefined : league?.organization_id,
  })

  const addTeam = useAddTeamToLeague()
  const removeTeam = useRemoveTeamFromLeague()
  const createPhase = useCreatePhase()
  const updatePhase = useUpdatePhase()
  const deletePhase = useDeletePhase()
  const [teamId, setTeamId] = useState('')
  const [phaseModal, setPhaseModal] = useState(false)
  const [editingPhase, setEditingPhase] = useState(null)
  const [phaseForm, setPhaseForm] = useState({ name: '', type: 'round_robin', phase_order: 1 })
  const [error, setError] = useState('')

  const enrolledIds = useMemo(() => new Set(enrolled.map((team) => team.team_id)), [enrolled])
  const teams = isSuperAdmin
    ? candidateTeams.filter((team) => team.sports?.slug === league?.sports?.slug)
    : candidateTeams
  const availableTeams = teams.filter((team) => !enrolledIds.has(team.id))
  const matchesByPhase = useMemo(() => {
    const totals = {}
    matches.forEach((match) => { totals[match.phase_id] = (totals[match.phase_id] ?? 0) + 1 })
    return totals
  }, [matches])
  const missingKnockoutPhases = useMemo(() => {
    if (league?.format !== 'playoffs') return []
    const existingNames = new Set(phases.filter((phase) => phase.type === 'knockout').map((phase) => phase.name))
    const firstRoundIndex = KNOCKOUT_PHASES.findIndex((name) => existingNames.has(name))
    if (firstRoundIndex < 0) return []
    return KNOCKOUT_PHASES.slice(firstRoundIndex + 1).filter((name) => !existingNames.has(name))
  }, [league?.format, phases])

  async function enroll() {
    if (!teamId) return
    setError('')
    try {
      await addTeam.mutateAsync({ leagueId, teamId })
      setTeamId('')
    } catch (err) {
      setError(err.message || 'No se pudo inscribir el equipo.')
    }
  }

  async function unenroll(team) {
    const used = matches.some((match) => match.home_team_id === team.team_id || match.away_team_id === team.team_id)
    if (used) {
      setError('No se puede quitar un equipo que ya tiene cruces cargados.')
      return
    }
    if (!window.confirm(`Quitar a ${team.team_name} de esta competencia?`)) return
    await removeTeam.mutateAsync({ leagueId, leagueTeamId: team.id })
  }

  function openCreatePhase() {
    setEditingPhase(null)
    setPhaseForm(initialPhaseForm(league, phases))
    setPhaseModal(true)
  }

  function openEditPhase(phase) {
    setEditingPhase(phase)
    setPhaseForm({ name: phase.name, type: phase.type, phase_order: phase.phase_order })
    setPhaseModal(true)
  }

  async function savePhase() {
    if (!phaseForm.name.trim()) return
    setError('')
    const payload = {
      league_id: leagueId,
      name: phaseForm.name.trim(),
      type: phaseForm.type,
      phase_order: Number(phaseForm.phase_order) || 1,
    }
    try {
      if (editingPhase) await updatePhase.mutateAsync({ id: editingPhase.id, ...payload })
      else await createPhase.mutateAsync(payload)
      setPhaseModal(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar la fase.')
    }
  }

  async function completeKnockoutBracket() {
    if (missingKnockoutPhases.length === 0) return
    setError('')
    let order = Math.max(0, ...phases.map((phase) => phase.phase_order ?? 0))
    try {
      for (const name of missingKnockoutPhases) {
        order += 1
        await createPhase.mutateAsync({
          league_id: leagueId,
          name,
          type: 'knockout',
          phase_order: order,
        })
      }
    } catch (err) {
      setError(err.message || 'No se pudo completar el cuadro eliminatorio.')
    }
  }

  async function removePhase(phase) {
    if (matchesByPhase[phase.id]) {
      setError('Esta fase ya tiene partidos. Primero corregi los cruces antes de eliminarla.')
      return
    }
    if (!window.confirm(`Eliminar la fase "${phase.name}"?`)) return
    await deletePhase.mutateAsync({ id: phase.id, league_id: leagueId })
  }

  if (loadingLeague) return <Spinner className="py-16" />
  if (!league) return <p className="px-4 py-12 text-center text-sm text-zinc-500">Competencia no encontrada.</p>

  const hasTeams = enrolled.length > 0
  const hasPhases = phases.length > 0
  const canLoadMatches = hasTeams && hasPhases && league.approval_status === 'approved'

  return (
    <div className="space-y-4 px-4 py-5 pb-28">
      <Link to="/admin/ligas" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ChevronLeft className="h-4 w-4" /> Competiciones
      </Link>

      <header className="rounded-xl border border-surface-800 bg-surface-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-primary">{TYPE_LABEL[league.competition_type] ?? 'Competencia'}</p>
            <h1 className="mt-1 text-xl font-black text-zinc-100">{league.name}</h1>
            <p className="mt-1 text-xs text-zinc-400">{league.sports?.name} · {league.season || league.year} · {league.gender}</p>
          </div>
          <Trophy className="h-8 w-8 shrink-0 text-primary" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="primary">{FORMAT_LABEL[league.format] ?? league.format}</Badge>
          <Badge variant={league.approval_status === 'approved' ? 'success' : 'warning'}>
            {league.approval_status === 'approved' ? 'Aprobada' : 'Pendiente de aprobacion'}
          </Badge>
        </div>
      </header>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

      <StepCard
        number="1"
        title="Equipos participantes"
        text={isSuperAdmin
          ? 'Podes reutilizar equipos existentes de cualquier localidad o crear uno nuevo.'
          : 'Usa equipos de tu organizacion o crea uno nuevo y luego inscribilo aqui.'}
        ready={hasTeams}
      >
        <div className="flex gap-2">
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={`${INPUT} min-w-0 flex-1`}>
            <option value="">{availableTeams.length ? 'Elegir equipo existente...' : 'No hay equipos disponibles'}</option>
            {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <Button onClick={enroll} disabled={!teamId || addTeam.isPending}>
            <Plus className="h-4 w-4" /> Inscribir
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Link to="/admin/equipos" className="text-xs font-semibold text-primary">Crear equipo nuevo</Link>
          <span className="text-xs text-zinc-500">{enrolled.length} inscriptos</span>
        </div>
        {loadingEnrolled ? <Spinner className="py-3" /> : enrolled.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {enrolled.map((team) => (
              <div key={team.id} className="flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-950 p-2">
                <TeamLogo logoUrl={team.team_logo_url} name={team.team_name} color={team.primary_color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-200">{team.team_name}</span>
                <button type="button" onClick={() => unenroll(team)} className="text-xs text-zinc-500 hover:text-red-400">Quitar</button>
              </div>
            ))}
          </div>
        )}
      </StepCard>

      <StepCard number="2" title="Fases y rondas" text="En una copa podes comenzar directamente en la ronda que ya se esta jugando." ready={hasPhases}>
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          {missingKnockoutPhases.length > 0 && (
            <Button size="sm" onClick={completeKnockoutBracket} disabled={createPhase.isPending}>
              <GitBranch className="h-4 w-4" /> Completar llaves
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={openCreatePhase}><Plus className="h-4 w-4" /> Agregar fase</Button>
        </div>
        {loadingPhases ? <Spinner className="py-3" /> : (
          <div className="space-y-2">
            {phases.map((phase, index) => (
              <div key={phase.id} className="flex items-center gap-3 rounded-lg border border-surface-800 bg-surface-950 p-3">
                <GitBranch className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-100">{phase.name}</p>
                  <p className="text-xs text-zinc-500">{PHASE_TYPES.find((type) => type.value === phase.type)?.label} · {matchesByPhase[phase.id] ?? 0} partidos</p>
                </div>
                <span className="text-xs text-zinc-500">{index + 1}</span>
                <button type="button" onClick={() => openEditPhase(phase)} className="text-xs font-semibold text-primary">Editar</button>
                {phases.length > 1 && (
                  <button type="button" onClick={() => removePhase(phase)} className="text-xs text-red-400">Quitar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </StepCard>

      <StepCard number="3" title="Cruces y resultados" text="Carga horarios, sedes y resultados dentro de cada fase." ready={matches.length > 0}>
        {!canLoadMatches && league.approval_status !== 'approved' && (
          <p className="mb-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
            Cuando el superadmin apruebe la competencia se habilitara la carga oficial de partidos.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-zinc-400"><Users className="h-4 w-4" /> {matches.length} cruces cargados</p>
          <Link to={`/admin/partidos?liga=${leagueId}${phases[0]?.id ? `&fase=${phases[0].id}` : ''}`}>
            <Button disabled={!canLoadMatches}><CalendarPlus className="h-4 w-4" /> Gestionar cruces</Button>
          </Link>
        </div>
      </StepCard>

      <Modal open={phaseModal} onClose={() => setPhaseModal(false)} title={editingPhase ? 'Editar fase' : 'Nueva fase'}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre *</label>
            {league.format === 'playoffs' ? (
              <select value={phaseForm.name} onChange={(event) => setPhaseForm({ ...phaseForm, name: event.target.value })} className={INPUT}>
                {KNOCKOUT_PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
              </select>
            ) : (
              <input value={phaseForm.name} onChange={(event) => setPhaseForm({ ...phaseForm, name: event.target.value })} className={INPUT} />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Tipo de fase *</label>
            <select value={phaseForm.type} onChange={(event) => setPhaseForm({ ...phaseForm, type: event.target.value })} className={INPUT}>
              {PHASE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Orden</label>
            <input type="number" min="1" value={phaseForm.phase_order} onChange={(event) => setPhaseForm({ ...phaseForm, phase_order: event.target.value })} className={INPUT} />
          </div>
          <Button onClick={savePhase} disabled={!phaseForm.name.trim() || createPhase.isPending || updatePhase.isPending} className="w-full">
            Guardar fase
          </Button>
        </div>
      </Modal>
    </div>
  )
}
