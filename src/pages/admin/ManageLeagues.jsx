import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useSports } from '../../hooks/useSports'
import { useTeams } from '../../hooks/useTeams'
import { useLeagues, useCreateLeague, useUpdateLeague, useDeleteLeague } from '../../hooks/useLeagues'
import {
  useApproveLeague,
  useArchiveLeague,
  useOrganizations,
  useUnarchiveLeague,
} from '../../hooks/useOrganizations'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'

const STATUS_LABEL = { upcoming: 'Proxima', active: 'Activa', finished: 'Finalizada' }
const STATUS_VARIANT = { upcoming: 'warning', active: 'success', finished: 'default' }
const GENDER_LABEL = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' }
const APPROVAL_LABEL = { draft: 'Borrador', pending_review: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }
const APPROVAL_VARIANT = { draft: 'default', pending_review: 'warning', approved: 'success', rejected: 'danger' }

const COMP_TYPES = [
  { value: 'liga', label: 'Liga', icon: 'T', desc: 'Todos contra todos' },
  { value: 'copa', label: 'Copa', icon: 'C', desc: 'Eliminacion' },
  { value: 'torneo', label: 'Torneo', icon: 'F', desc: 'Formato libre' },
]

const EMPTY_FORM = {
  organization_id: '',
  sport_id: '',
  name: '',
  season: '',
  year: new Date().getFullYear(),
  gender: 'masculino',
  status: 'upcoming',
  champion_team_id: '',
  competition_type: 'liga',
}

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

function ChampionSelector({ sportId, organizationId, value, onChange }) {
  const { data: teams = [] } = useTeams({ sportId, organizationId })
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={INPUT}>
      <option value="">Sin campeon asignado</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>{team.name}</option>
      ))}
    </select>
  )
}

export default function ManageLeagues() {
  const navigate = useNavigate()
  const { isSuperAdmin, organizationId, organization } = useAuth()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [sportFilter, setSportFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const scopedOrgId = isSuperAdmin ? undefined : organizationId
  const { data: organizations = [] } = useOrganizations({ includeArchived: isSuperAdmin })
  const { data: sports = [] } = useSports({ organizationId: scopedOrgId })
  const { data: leagues = [], isLoading } = useLeagues({
    sportSlug: sportFilter || undefined,
    organizationId: scopedOrgId,
    includeArchived: showArchived,
  })

  const createLeague = useCreateLeague()
  const updateLeague = useUpdateLeague()
  const deleteLeague = useDeleteLeague()
  const approveLeague = useApproveLeague()
  const archiveLeague = useArchiveLeague()
  const unarchiveLeague = useUnarchiveLeague()

  function openCreate() {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      organization_id: isSuperAdmin ? '' : organizationId,
    })
    setModal(true)
  }

  function openEdit(league) {
    setEditing(league)
    setForm({
      organization_id: league.organization_id,
      sport_id: league.sport_id,
      name: league.name,
      season: league.season ?? '',
      year: league.year ?? new Date().getFullYear(),
      gender: league.gender,
      status: league.status,
      champion_team_id: league.champion_team_id ?? '',
      competition_type: league.competition_type ?? 'liga',
    })
    setModal(true)
  }

  async function save() {
    if (!form.organization_id || !form.sport_id || !form.name) return
    const selectedOrg = organizations.find((org) => org.id === form.organization_id) ?? organization
    if (!selectedOrg) return

    const payload = {
      ...form,
      champion_team_id: form.champion_team_id || null,
      season: form.season || null,
      city: selectedOrg.city,
      province: selectedOrg.province,
      country: selectedOrg.country || 'Argentina',
      approval_status: editing ? editing.approval_status : (isSuperAdmin ? 'approved' : 'pending_review'),
    }

    if (editing) await updateLeague.mutateAsync({ id: editing.id, ...payload })
    else await createLeague.mutateAsync(payload)
    setModal(false)
  }

  async function remove(league) {
    if (!window.confirm(`Eliminar "${league.name}"? Se borraran todos sus datos.`)) return
    await deleteLeague.mutateAsync(league.id)
  }

  async function archive(league) {
    const reason = window.prompt(`Motivo para archivar "${league.name}"`, league.archive_reason ?? '')
    if (reason === null) return
    await archiveLeague.mutateAsync({ id: league.id, reason })
  }

  async function unarchive(league) {
    if (!window.confirm(`Desarchivar "${league.name}"?`)) return
    await unarchiveLeague.mutateAsync(league.id)
  }

  const saving = createLeague.isPending || updateLeague.isPending
  const modalSports = isSuperAdmin && form.organization_id
    ? sports.filter((sport) => sport.organization_id === form.organization_id)
    : sports

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Ligas</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {isSuperAdmin ? 'Todas las organizaciones' : `${organization?.city ?? ''}, ${organization?.province ?? ''}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nueva Liga</Button>
      </div>

      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className={`mb-3 rounded-full px-3 py-1.5 text-xs font-semibold ${
            showArchived ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'
          }`}
        >
          {showArchived ? 'Mostrando archivadas' : 'Ver archivadas'}
        </button>
      )}

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        {[{ slug: '', name: 'Todas', icon: 'T' }, ...sports].map((sport) => (
          <button
            key={sport.slug}
            onClick={() => setSportFilter(sport.slug)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              sportFilter === sport.slug ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300 hover:bg-surface-700'
            }`}
          >
            {sport.icon} {sport.name}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner className="py-12" /> : leagues.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">No hay ligas todavia.</p>
      ) : (
        <div className="space-y-3">
          {leagues.map((league) => {
            const comp = COMP_TYPES.find((item) => item.value === (league.competition_type ?? 'liga'))
            return (
              <article key={league.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span>{league.sports?.icon}</span>
                      <span className="truncate text-sm font-semibold text-zinc-100">{league.name}</span>
                    </div>
                    <p className="mb-2 text-xs text-zinc-500">{league.season} {league.year ? `· ${league.year}` : ''}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={STATUS_VARIANT[league.status]}>{STATUS_LABEL[league.status]}</Badge>
                      <Badge>{GENDER_LABEL[league.gender]}</Badge>
                      <Badge variant={APPROVAL_VARIANT[league.approval_status]}>
                        {APPROVAL_LABEL[league.approval_status] ?? league.approval_status}
                      </Badge>
                      {league.is_archived && <Badge variant="danger">Archivada</Badge>}
                      {comp && <Badge variant="primary">{comp.icon} {comp.label}</Badge>}
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-500">
                      {league.organizations?.name ?? 'Sin organizacion'} · {league.city}, {league.province}
                    </p>
                    {league.archive_reason && (
                      <p className="mt-1 text-xs text-amber-300">Motivo: {league.archive_reason}</p>
                    )}
                  </div>
                  <div className="ml-2 flex shrink-0 flex-col items-end gap-1.5">
                    {isSuperAdmin && league.approval_status !== 'approved' && (
                      <button onClick={() => approveLeague.mutateAsync(league.id)} className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
                        Aprobar
                      </button>
                    )}
                    {isSuperAdmin && (
                      league.is_archived ? (
                        <button onClick={() => unarchive(league)} className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
                          Desarchivar
                        </button>
                      ) : (
                        <button onClick={() => archive(league)} className="text-xs font-medium text-amber-400 hover:text-amber-300">
                          Archivar
                        </button>
                      )
                    )}
                    <button onClick={() => navigate(`/admin/posiciones?liga=${league.id}`)} className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
                      Tabla
                    </button>
                    <button onClick={() => navigate(`/admin/goleadores?liga=${league.id}`)} className="text-xs font-medium text-amber-400 hover:text-amber-300">
                      Goleadores
                    </button>
                    <button onClick={() => openEdit(league)} className="text-xs font-medium text-primary hover:text-primary-400">
                      Editar
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => remove(league)} className="text-xs font-medium text-red-400 hover:text-red-300">
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Liga' : 'Nueva Liga'}>
        <div className="space-y-4">
          {isSuperAdmin ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Organizacion *</label>
              <select value={form.organization_id} onChange={(event) => setForm({ ...form, organization_id: event.target.value, sport_id: '' })} className={INPUT}>
                <option value="">Seleccionar...</option>
                {organizations.filter((org) => org.status === 'active').map((org) => (
                  <option key={org.id} value={org.id}>{org.name} · {org.city}, {org.province}</option>
                ))}
              </select>
            </div>
          ) : organization ? (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
              <p className="text-xs font-semibold text-primary">Organizacion</p>
              <p className="text-sm font-bold text-zinc-100">{organization.name}</p>
              <p className="text-xs text-zinc-400">{organization.city}, {organization.province}</p>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Deporte *</label>
            <select value={form.sport_id} onChange={(event) => setForm({ ...form, sport_id: event.target.value })} className={INPUT}>
              <option value="">Seleccionar...</option>
              {modalSports.map((sport) => <option key={sport.id} value={sport.id}>{sport.icon} {sport.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre *</label>
            <input
              type="text"
              value={form.name}
              placeholder="Liga de Futsal San Juan"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={INPUT}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Tipo de competencia *</label>
            <div className="grid grid-cols-3 gap-2">
              {COMP_TYPES.map((comp) => (
                <button
                  key={comp.value}
                  type="button"
                  onClick={() => setForm({ ...form, competition_type: comp.value })}
                  className={`rounded-lg border p-2 text-center transition-colors ${
                    form.competition_type === comp.value
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-600'
                  }`}
                >
                  <span className="block text-xs font-black">{comp.icon}</span>
                  <span className="block text-xs font-bold">{comp.label}</span>
                  <span className="block text-[9px] leading-tight opacity-70">{comp.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Temporada</label>
              <input type="text" value={form.season} placeholder="Apertura 2026"
                onChange={(event) => setForm({ ...form, season: event.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Anio</label>
              <input type="number" value={form.year}
                onChange={(event) => setForm({ ...form, year: parseInt(event.target.value) })} className={INPUT} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Division</label>
              <select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} className={INPUT}>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Estado</label>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={INPUT}>
                <option value="upcoming">Proxima</option>
                <option value="active">Activa</option>
                <option value="finished">Finalizada</option>
              </select>
            </div>
          </div>

          {form.status === 'finished' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Equipo campeon</label>
              <ChampionSelector
                sportId={form.sport_id}
                organizationId={form.organization_id}
                value={form.champion_team_id ?? ''}
                onChange={(value) => setForm({ ...form, champion_team_id: value })}
              />
            </div>
          )}

          {!isSuperAdmin && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-xs leading-relaxed text-amber-200">
                La liga quedara pendiente hasta que un superadmin la apruebe. La ubicacion queda fija segun tu organizacion.
              </p>
            </div>
          )}

          <Button onClick={save} disabled={saving || !form.organization_id || !form.sport_id || !form.name} className="w-full">
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : isSuperAdmin ? 'Crear Liga' : 'Enviar a aprobacion'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
