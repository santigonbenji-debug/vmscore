import { useNavigate } from 'react-router-dom'

export default function Contacto() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 py-8 flex-1">

        <button onClick={() => navigate(-1)}
          className="text-primary hover:text-primary-400 text-sm font-medium mb-6 flex items-center gap-1 transition-colors">
          ← Volver
        </button>

        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">🏆</span>
          <h1 className="text-2xl font-extrabold mb-2 text-zinc-100">
            ¿Tenés un club o un torneo?
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Sumá tu liga a VMScore y llevá las estadísticas de tu torneo
            al siguiente nivel. Resultados en tiempo real, tabla de
            posiciones automática y goleadores.
          </p>
        </div>

        <div className="bg-surface-900 rounded-2xl border border-surface-800 shadow-sm p-5 mb-5">
          <h2 className="font-bold text-sm mb-4 text-zinc-100">¿Qué incluye?</h2>
          <div className="space-y-3">
            {[
              { icon: '📅', text: 'Fixture y calendario de partidos' },
              { icon: '⚽', text: 'Carga de resultados y eventos en tiempo real' },
              { icon: '🏅', text: 'Tabla de posiciones automática' },
              { icon: '👟', text: 'Tabla de goleadores' },
              { icon: '👕', text: 'Perfil de equipos con logo y colores' },
              { icon: '📱', text: 'App instalable desde el celular (PWA)' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className="text-sm text-zinc-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary to-primary-700 rounded-2xl p-5 text-white text-center mb-4 shadow-xl shadow-primary/20">
          <p className="text-sm font-medium opacity-80 mb-1">
            Contactanos por WhatsApp
          </p>
          <p className="text-3xl font-extrabold tracking-tight mb-4">
            2657-392998
          </p>
          <a
            href="https://wa.me/5492657392998?text=Hola!%20Quiero%20registrar%20mi%20club%2Ftorneo%20en%20VMScore"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-primary font-bold px-6 py-3 rounded-xl text-sm shadow-sm active:scale-95 transition-transform">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.528 5.843L.057 23.571l5.9-1.547A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.886 0-3.65-.49-5.18-1.346l-.371-.22-3.502.919.934-3.41-.242-.393A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Escribinos por WhatsApp
          </a>
        </div>

        <p className="text-xs text-zinc-500 text-center">
          VMScore · Villa Mercedes, San Luis 🇦🇷
        </p>
      </div>
    </div>
  )
}
