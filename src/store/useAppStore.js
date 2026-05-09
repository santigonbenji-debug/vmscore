import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAppStore = create(
  persist(
    (set) => ({
      deporteActivo: 'futbol',
      setDeporteActivo: (slug) => set({ deporteActivo: slug }),
      generoActivo: 'masculino',
      setGeneroActivo: (genero) => set({ generoActivo: genero }),
      ligaActiva: null,
      setLigaActiva: (id) => set({ ligaActiva: id }),
    }),
    { name: 'vmscore-app-store' }
  )
)

export default useAppStore
