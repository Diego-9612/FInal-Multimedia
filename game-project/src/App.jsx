// src/App.jsx
import { useEffect, useRef, useState } from 'react'
import Experience from './Experience/Experience'
import './styles/loader.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const App = () => {
  const canvasRef = useRef(null)
  const experienceRef = useRef(null)

  // 🔐 Estado de autenticación
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: ''
  })
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [allowOffline, setAllowOffline] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  // ⏳ Loader del juego (recursos Three.js)
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(false)

  // Asegurar objeto global de auth
  useEffect(() => {
    if (!window.auth) {
      window.auth = { user: null, token: null, isOffline: false }
    }
  }, [])

  // Instanciar Experience SOLO cuando:
  //  - el usuario está autenticado (user + token) O
  //  - se activó modo sin conexión
  useEffect(() => {
    if (!canvasRef.current) return
    if (experienceRef.current) return
    if (!user && !isOffline) return

    console.log('🎮 Creando Experience (Three.js) ...')
    const experience = new Experience(canvasRef.current)
    experienceRef.current = experience


    //Activar loader minetras se cargan los recuersos
    setLoading(true)

    const handleProgress = (e) => {
      const value = typeof e.detail === 'number' ? e.detail : 0
      setProgress(value)
    }

    const handleComplete = () => {
      setLoading(false)
    }

    window.addEventListener('resource-progress', handleProgress)
    window.addEventListener('resource-complete', handleComplete)

    return () => {
      window.removeEventListener('resource-progress', handleProgress)
      window.removeEventListener('resource-complete', handleComplete)
      // Si alguna vez desmontas App, podrías destruir la experiencia:
      // experience.destroy?.()
    }
  }, [user, isOffline])

  // Handlers formulario
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }
// Implementacion de hanlAthsuccess
  const handleAuthSuccess = (data) => {
    const receivedUser = data.user || data.profile || { email: form.email }
    const receivedToken = data.token || data.access_token || data.jwt

    if (!receivedToken) {
      throw new Error('La respuesta del servidor no contiene token.')
    }

    setUser(receivedUser)
    setToken(receivedToken)
    setAuthError('')
    setIsOffline(false)
    setAllowOffline(false)

    window.auth = {
      user: receivedUser,
      token: receivedToken,
      isOffline: false
    }

    console.log('✅ Autenticado, listo para iniciar el juego')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsSubmitting(true)
    setAllowOffline(false)

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // 👈 tu backend espera usernameOrEmail
          usernameOrEmail: form.email,
          password: form.password
        })
      })

      if (!res.ok) {
        let message = 'Error de autenticación.'
        try {
          const data = await res.json()
          message = data.message || message
        } catch {
          const text = await res.text()
          if (text) message = text
        }
        setAuthError(message)
        return
      }

      const data = await res.json()
      handleAuthSuccess(data)
    } catch (err) {
      console.error('❌ Error de red en login:', err)
      setAuthError(
        'No se pudo conectar con el servidor. Puedes intentar más tarde o usar el modo sin conexión.'
      )
      setAllowOffline(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsSubmitting(true)
    setAllowOffline(false)

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          // 👇 por si tu backend usa username
          username: form.email,
          password: form.password
        })
      })

      if (!res.ok) {
        let message = 'Error al registrarse.'
        try {
          const data = await res.json()
          message = data.message || message
        } catch {
          const text = await res.text()
          if (text) message = text
        }
        setAuthError(message)
        return
      }

      const data = await res.json()
      // Muchos backends hacen login automático tras registrarse
      handleAuthSuccess(data)
    } catch (err) {
      console.error('❌ Error de red en registro:', err)
      setAuthError(
        'No se pudo conectar con el servidor. Puedes intentar más tarde o usar el modo sin conexión.'
      )
      setAllowOffline(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePlayOffline = () => {
    console.log('📴 Iniciando juego en modo sin conexión...')
    setIsOffline(true)
    setUser(null)
    setToken(null)
    setAuthError('')

    window.auth = {
      user: null,
      token: null,
      isOffline: true
    }
  }

  // 🔹 Estilos inline para no tocar tus CSS globales
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background:
      'radial-gradient(circle at top, rgba(0,255,247,0.25), rgba(0,0,0,0.95))',
    display: user || isOffline ? 'none' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
    backdropFilter: 'blur(6px)'
  }

  const cardStyle = {
    width: '100%',
    maxWidth: '420px',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: '16px',
    padding: '24px 28px',
    color: '#ffffff',
    boxShadow: '0 0 25px rgba(0,255,247,0.4)',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    marginBottom: '10px',
    borderRadius: '8px',
    border: '1px solid rgba(0,255,247,0.4)',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    outline: 'none',
    fontSize: '14px'
  }

  const buttonPrimary = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    marginTop: '8px',
    background: 'linear-gradient(135deg, #00fff7, #00bcd4)',
    color: '#000',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '15px',
    boxShadow: '0 0 12px rgba(0,255,247,0.7)'
  }

  const modeButton = (active) => ({
    flex: 1,
    padding: '8px 10px',
    borderRadius: '999px',
    border: active
      ? '1px solid rgba(0,255,247,0.9)'
      : '1px solid rgba(255,255,255,0.2)',
    background: active ? 'rgba(0,255,247,0.2)' : 'transparent',
    color: active ? '#00fff7' : '#ffffff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500
  })

  const smallButton = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#ffffff',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '8px'
  }

  return (
    <>
      {/* 🔐 Overlay de Login / Registro */}
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>
            🚀 Inicia sesión para jugar
          </h2>
          <p
            style={{
              marginTop: 0,
              marginBottom: 16,
              fontSize: 13,
              opacity: 0.8
            }}
          >
            Tu progreso se guardará en el backend cuando el servidor esté disponible.
          </p>

          {/* Toggle Login / Registro */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 16,
              background: 'rgba(255,255,255,0.04)',
              padding: 4,
              borderRadius: 999
            }}
          >
            <button
              type="button"
              style={modeButton(authMode === 'login')}
              onClick={() => setAuthMode('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              style={modeButton(authMode === 'register')}
              onClick={() => setAuthMode('register')}
            >
              Registrarme
            </button>
          </div>

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
            {authMode === 'register' && (
              <div style={{ marginBottom: 8 }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 4,
                    fontSize: 13,
                    opacity: 0.9
                  }}
                >
                  Nombre
                </label>
                <input
                  style={inputStyle}
                  type="text"
                  name="name"
                  placeholder="Tu nombre"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontSize: 13,
                  opacity: 0.9
                }}
              >
                Correo
              </label>
              <input
                style={inputStyle}
                type="email"
                name="email"
                placeholder="tucorreo@ejemplo.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div style={{ marginBottom: 4 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontSize: 13,
                  opacity: 0.9
                }}
              >
                Contraseña
              </label>
              <input
                style={inputStyle}
                type="password"
                name="password"
                placeholder="********"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            {authError && (
              <div
                style={{
                  marginTop: 6,
                  marginBottom: 6,
                  fontSize: 12,
                  color: '#ff8a80'
                }}
              >
                {authError}
              </div>
            )}

            <button type="submit" style={buttonPrimary} disabled={isSubmitting}>
              {isSubmitting
                ? authMode === 'login'
                  ? 'Iniciando sesión...'
                  : 'Registrando...'
                : authMode === 'login'
                  ? 'Iniciar sesión'
                  : 'Registrarme'}
            </button>
          </form>

          {allowOffline && (
            <button type="button" style={smallButton} onClick={handlePlayOffline}>
              📴 Jugar en modo sin conexión
            </button>
          )}

          <p
            style={{
              marginTop: 10,
              fontSize: 11,
              opacity: 0.6,
              lineHeight: 1.4
            }}
          >
            Si el servidor no está disponible podrás jugar igual, pero tu progreso se
            guardará solo de manera local.
          </p>
        </div>
      </div>

      {/* Loader del juego (solo cuando se están cargando los assets de Three.js) */}
      {loading && (
        <div id="loader-overlay">
          <div id="loader-bar" style={{ width: `${progress}%` }}></div>
          <div id="loader-text">Cargando... {progress}%</div>
        </div>
      )}

      {/* Canvas del juego */}
      <canvas ref={canvasRef} className="webgl" />
    </>
  )
}

export default App
