import { useState, useEffect } from 'react'

const STORAGE_KEY = 'vmscore_favorites'

function leerStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(leerStorage)

  useEffect(() => {
    const sync = () => setFavorites(leerStorage())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function toggleFavorite(teamId) {
    const current = leerStorage()
    const updated = current.includes(teamId)
      ? current.filter((id) => id !== teamId)
      : [...current, teamId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setFavorites(updated)
    window.dispatchEvent(new Event('storage'))
  }

  return { favorites, toggleFavorite, isFavorite: (teamId) => favorites.includes(teamId) }
}
