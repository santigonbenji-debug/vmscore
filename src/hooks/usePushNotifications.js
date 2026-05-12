import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFavorites } from './useFavorites'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const PUSH_ENABLED_KEY = 'vmscore_push_enabled'

function getStoredPushEnabled() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PUSH_ENABLED_KEY) === 'true'
}

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
  const [enabled, setEnabled] = useState(getStoredPushEnabled)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const registerCurrentSubscription = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return false

    const payload = serializeSubscription(subscription)
    if (!payload.endpoint || !payload.p256dh || !payload.auth) {
      throw new Error('No se pudo leer la suscripcion push.')
    }

    const { error } = await supabase.rpc('register_push_subscription', {
      p_endpoint: payload.endpoint,
      p_p256dh: payload.p256dh,
      p_auth: payload.auth,
      p_favorite_team_ids: favorites,
      p_user_agent: navigator.userAgent,
    })

    if (error) throw error
    return true
  }, [favorites])

  useEffect(() => {
    if (!supported || !enabled) return

    registerCurrentSubscription().catch((err) => {
      console.warn('No se pudieron sincronizar favoritos push', err)
    })
  }, [enabled, registerCurrentSubscription, supported])

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

      await registerCurrentSubscription()
      window.localStorage.setItem(PUSH_ENABLED_KEY, 'true')
      setEnabled(true)
      setMessage('Alertas activadas para tus equipos favoritos.')
    } catch (err) {
      setError(err?.message ?? 'No se pudieron activar las alertas.')
    } finally {
      setLoading(false)
    }
  }

  return {
    supported,
    enabled,
    loading,
    message,
    error,
    enableNotifications,
  }
}
