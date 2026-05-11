import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFavorites } from './useFavorites'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const normalized = String(base64String ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s/g, '')

  if (!normalized) {
    throw new Error('Falta configurar la clave publica de notificaciones.')
  }

  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function serializeSubscription(subscription) {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  }
}

export function usePushNotifications() {
  const { favorites } = useFavorites()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  async function enableNotifications() {
    setMessage('')
    setError('')

    if (!supported) {
      setError('Este navegador no soporta notificaciones push web.')
      return
    }

    if (!VAPID_PUBLIC_KEY) {
      setError('Falta configurar VITE_VAPID_PUBLIC_KEY.')
      return
    }

    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Permiso de notificaciones denegado.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const payload = serializeSubscription(subscription)
      if (!payload.endpoint || !payload.p256dh || !payload.auth) {
        throw new Error('No se pudo leer la suscripcion push.')
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          ...payload,
          favorite_team_ids: favorites,
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' })

      if (error) throw error
      setMessage('Alertas activadas para tus equipos favoritos.')
    } catch (err) {
      setError(err?.message ?? 'No se pudieron activar las alertas.')
    } finally {
      setLoading(false)
    }
  }

  return {
    supported,
    loading,
    message,
    error,
    enableNotifications,
  }
}
