// src/Experience/Utils/progressSync.js

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * Sincroniza el progreso del jugador con el backend.
 *
 * Se puede llamar de varias formas:
 *   syncProfileProgress(120)
 *   syncProfileProgress({ elapsedSeconds: 120 })
 *   syncProfileProgress({ timeSeconds: 120, level: 3 })
 */
export async function syncProfileProgress(arg) {
  // 🕒 Normalizamos tiempo
  const elapsedSeconds =
    typeof arg === 'number'
      ? arg
      : arg?.elapsedSeconds ?? arg?.timeSeconds ?? 0

  // 👀 Si estamos en modo offline o sin token, no enviamos nada
  if (!window.auth || window.auth.isOffline || !window.auth.token) {
    console.log('⏭️ Modo offline o sin token: no se envía progreso al backend.')
    return
  }

  // Info del mundo actual (nivel y puntos)
  const world = window.experience?.world
  const levelFromWorld = world?.levelManager?.currentLevel ?? 1
  const pointsFromWorld = world?.points ?? world?.robot?.points ?? 0

  const level =
    typeof arg === 'object' && arg?.level != null
      ? arg.level
      : levelFromWorld

  // 👇 Ajusta los nombres de campos si tu backend espera otros
  const payload = {
    level,                // 🔥 obligatorio según tu backend
    timeSeconds: elapsedSeconds,
    points: pointsFromWorld
  }

  console.log('📡 Enviando progreso al backend:', payload)

  try {
    const res = await fetch(`${API_BASE}/api/profile/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${window.auth.token}`
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      let text = ''
      try {
        text = await res.text()
      } catch {
        // ignore
      }
      console.warn(
        `⚠️ Error al sincronizar progreso: ${res.status} ${text || ''}`
      )
      return
    }

    const data = await res.json().catch(() => null)
    console.log('✅ Progreso sincronizado correctamente:', data)
  } catch (error) {
    console.error('❌ Error de red al sincronizar progreso:', error)
  }
}
