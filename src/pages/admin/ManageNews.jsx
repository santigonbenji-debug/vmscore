import { useState } from 'react'
import { useAllNews, useCreateNews, useUpdateNews, useDeleteNews } from '../../hooks/useNews'
import { useTeams } from '../../hooks/useTeams'
import { useLeagues } from '../../hooks/useLeagues'
import Modal   from '../../components/ui/Modal'
import Button  from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const TZ = 'America/Argentina/San_Luis'

const FORM_VACIO = {
  title: '',
  body: '',
  image_url: '',
  link_url: '',
  team_id: '',
  league_id: '',
  match_id: '',
  pinned: false,
  publish_at_local: '', // local datetime string (yyyy-MM-ddTHH:mm)
}

const INPUT = "w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"

function nowLocalIsoMin() {
  const z = toZonedTime(new Date(), TZ)
  return format(z, "yyyy-MM-dd'T'HH:mm")
}

function isoToLocalInput(iso) {
  if (!iso) return ''
  const z = toZonedTime(new Date(iso), TZ)
  return format(z, "yyyy-MM-dd'T'HH:mm")
}

function localInputToIso(local) {
  if (!local) return null
  return fromZonedTime(new Date(local), TZ).toISOString()
}

export default function ManageNews() {
  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm]         = useState(FORM_VACIO)

  const { data: news = [], isLoading } = useAllNews()
  const { data: teams = [] }           = useTeams()
  const { data: leagues = [] }         = useLeagues()

  const crear   = useCreateNews()
  const editar  = useUpdateNews()
  const borrar  = useDeleteNews()

  function abrirCrear() {
    setEditando(null)
    setForm({ ...FORM_VACIO, publish_at_local: nowLocalIsoMin() })
    setModal(true)
  }

  function abrirEditar(n) {
    setEditando(n)
    setForm({
      title:     n.title ?? '',
      body:      n.body ?? '',
      image_url: n.image_url ?? '',
      link_url:  n.link_url ?? '',
      team_id:   n.team_id ?? '',
      league_id: n.league_id ?? '',
      match_id:  n.match_id ?? '',
      pinned:    !!n.pinned,
      publish_at_local: isoToLocalInput(n.publish_at),
    })
    setModal(true)
  }

  async function guardar() {
    if (!form.title?.trim()) return
    const payload = {
      title:     form.title.trim(),
      body:      form.body?.trim() || null,
      image_url: form.image_url?.trim() || null,
      link_url:  form.link_url?.trim() || null,
      team_id:   form.team_id || null,
      league_id: form.league_id || null,
      match_id:  form.match_id || null,
      pinned:    !!form.pinned,
      publish_at: form.publish_at_local
        ? localInputToIso(form.publish_at_local)
        : new Date().toISOString(),
    }
    if (editando) await editar.mutateAsync({ id: editando.id, ...payload })
    else          await crear.mutateAsync(payload)
    setModal(false)
  }

  async function eliminar(n) {
    if (!window.confirm(`¿Eliminar la noticia "${n.title}"?`)) return
    await borrar.mutateAsync(n.id)
  }

  const guardando = crear.isPending || editar.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">📰 Noticias</h1>
        <Button size="sm" onClick={abrirCrear}>+ Nueva Noticia</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : news.length === 0 ? (
        <div className="bg-surface-900 border border-surface-800 border-dashed rounded-xl p-8 text-center">
          <p className="text-3xl mb-2">📰</p>
          <p className="text-sm text-zinc-300 font-medium">No hay noticias todavía</p>
          <p className="text-xs text-zinc-500 mt-1 mb-4">
            Las noticias aparecen en el carrusel de la pantalla principal.
          </p>
          <Button size="sm" onClick={abrirCrear}>Publicar la primera</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((n) => {
            const futura = n.publish_at && new Date(n.publish_at) > new Date()
            return (
              <div key={n.id} className="bg-surface-900 rounded-xl border border-surface-800 p-3 flex gap-3">
                {n.image_url ? (
                  <img src={n.image_url} alt="" className="w-20 h-20 rounded-lg object-cover bg-surface-800 shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center shrink-0">
                    <span className="text-2xl">📰</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    {n.pinned && <span className="text-primary text-sm shrink-0">📌</span>}
                    <p className="font-bold text-sm text-zinc-100 leading-tight line-clamp-2 flex-1">{n.title}</p>
                  </div>
                  {n.body && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{n.body}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[10px]">
                    {n.publish_at && (
                      <span className={futura ? 'text-amber-400' : 'text-zinc-500'}>
                        {futura ? '⏱ Programada · ' : ''}
                        {format(toZonedTime(new Date(n.publish_at), TZ), "d MMM yyyy · HH:mm", { locale: es })}
                      </span>
                    )}
                    {n.teams?.short_name && <span className="text-zinc-500">· {n.teams.short_name}</span>}
                    {n.leagues?.name && <span className="text-zinc-500">· {n.leagues.name}</span>}
                    {n.link_url && <span className="text-primary">· con link</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => abrirEditar(n)}
                    className="text-xs text-primary font-medium hover:text-primary-400">Editar</button>
                  <button onClick={() => eliminar(n)}
                    className="text-xs text-red-400 font-medium hover:text-red-300">Borrar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar Noticia' : 'Nueva Noticia'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Título *</label>
            <input type="text" value={form.title}
              placeholder="Goleada histórica de River en la final"
              onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT} />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Cuerpo</label>
            <textarea value={form.body} rows={4}
              placeholder="Contale a tus seguidores qué pasó..."
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={`${INPUT} resize-none`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Imagen (URL)</label>
            <input type="url" value={form.image_url} placeholder="https://..."
              onChange={(e) => setForm({ ...form, image_url: e.target.value })} className={INPUT} />
            {form.image_url && (
              <img src={form.image_url} alt="" className="mt-2 w-full max-h-40 object-cover rounded-lg border border-surface-800 bg-surface-800" />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Link externo (opcional)</label>
            <input type="url" value={form.link_url} placeholder="https://..."
              onChange={(e) => setForm({ ...form, link_url: e.target.value })} className={INPUT} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Equipo (opcional)</label>
              <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} className={INPUT}>
                <option value="">—</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Liga (opcional)</label>
              <select value={form.league_id} onChange={(e) => setForm({ ...form, league_id: e.target.value })} className={INPUT}>
                <option value="">—</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}{l.season ? ` · ${l.season}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Fecha de publicación</label>
            <input type="datetime-local" value={form.publish_at_local}
              onChange={(e) => setForm({ ...form, publish_at_local: e.target.value })} className={INPUT} />
            <p className="text-[10px] text-zinc-500 mt-1">
              Si la fecha es futura, la noticia queda programada (no se ve en Home hasta esa hora).
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="w-4 h-4 accent-primary" />
            <span className="text-sm text-zinc-200">📌 Destacar (aparece primero en el carrusel)</span>
          </label>

          <Button onClick={guardar} disabled={guardando || !form.title.trim()} className="w-full">
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Publicar Noticia'}
          </Button>

          {(crear.isError || editar.isError) && (
            <p className="text-red-400 text-xs text-center">
              Error al guardar: {(crear.error ?? editar.error)?.message}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
