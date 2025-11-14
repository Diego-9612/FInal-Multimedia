// Experience.js
import * as THREE from 'three'
import Debug from './Utils/Debug.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import VRIntegration from '../integrations/VRIntegration.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import ModalManager from './Utils/ModalManager.js'
import World from './World/World.js'
import Resources from './Utils/Resources.js'
import sources from './sources.js'
import Sounds from './World/Sound.js'
import Raycaster from './Utils/Raycaster.js'
import KeyboardControls from './Utils/KeyboardControls.js'
import GameTracker from './Utils/GameTracker.js'
import Physics from './Utils/Physics.js'
import cannonDebugger from 'cannon-es-debugger'
import CircularMenu from '../controls/CircularMenu.js'
import { Howler } from 'howler'
// import SocketManager from '../network/SocketManager.js'

let instance = null

export default class Experience {
  constructor(_canvas) {
    if (instance) return instance
    instance = this

    // Global access
    window.experience = this
    this.canvas = _canvas

    // Flag de interacción
    window.userInteracted = false

    // Core setup
    this.debug = new Debug()
    this.sizes = new Sizes()
    this.time = new Time()
    this.scene = new THREE.Scene()
    this.physics = new Physics()
    this.debugger = cannonDebugger(this.scene, this.physics.world, { color: 0x00ff00 })
    this.keyboard = new KeyboardControls()

    this.scene.background = new THREE.Color('#87ceeb')

    // Recursos
    this.resources = new Resources(sources)

    this.resources.on('ready', () => {
      // Mostrar modal solo cuando los recursos estén listos
      this.modal.show({
        icon: '🚀',
        message: 'Recoge todas las monedas\n¡y evita los obstáculos!',
        buttons: [
          {
            text: '▶️ Iniciar juego',
            onClick: () => this.startGame()
          }
        ]
      })

      // Ocultar precarga si existe
      const overlay = document.querySelector('.loader-overlay')
      if (overlay) {
        overlay.classList.add('fade-out')
        setTimeout(() => overlay.remove(), 1000)
      }
    })

    // Cámara y renderer
    this.camera = new Camera(this)
    this.renderer = new Renderer(this)

    // Dolly para VR
    this.vrDolly = new THREE.Group()
    this.vrDolly.name = 'VR_DOLLY'
    this.vrDolly.add(this.camera.instance)
    this.scene.add(this.vrDolly)

    // Socket (opcional)
    // this.socketManager = new SocketManager(this)

    // Raycaster
    this.raycaster = new Raycaster(this)

    // Modal y VR
    this.modal = new ModalManager({ container: document.body })
    this.vr = new VRIntegration({
      renderer: this.renderer.instance,
      scene: this.scene,
      camera: this.camera.instance,
      vrDolly: this.vrDolly,
      modalManager: this.modal,
      experience: this
    })

    // Menú
    this.menu = new CircularMenu({
      container: document.body,
      vrIntegration: this.vr,
      onAudioToggle: () => this.world.toggleAudio(),
      onWalkMode: () => {
        this.resumeAudioContext()
        this.toggleWalkMode()
      },
      onFullscreen: () => {
        if (!document.fullscreenElement) {
          document.body.requestFullscreen()
        } else {
          document.exitFullscreen()
        }
      },
      onCancelGame: () => this.tracker.handleCancelGame()
    })

    // Generar obstáculos
    this._startObstacleWaves()

    // Tracker
    if (this.tracker) this.tracker.destroy()
    this.tracker = new GameTracker({ modal: this.modal, menu: this.menu })

    // Mundo
    this.world = new World(this)

    // Flag tercera persona
    this.isThirdPerson = false

    // Iniciar loop adecuado
    this.startLoop()

    // Resize
    this.sizes.on('resize', () => this.resize())

    // Sonidos
    this.sounds = new Sounds({ time: this.time, debug: this.debug })

    // Detectar primer gesto del usuario (audio)
    window.addEventListener('click', this.handleFirstInteraction, { once: true })
    window.addEventListener('touchstart', this.handleFirstInteraction, { once: true })
  }

  // ---- Audio ----
  handleFirstInteraction() {
    const ctx = Howler.ctx
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('🔊 AudioContext reanudado por interacción del usuario.')
      }).catch((err) => {
        console.warn('⚠️ Error reanudando AudioContext:', err)
      })
    }
    window.userInteracted = true
  }

  resumeAudioContext() {
    const ctx = Howler.ctx
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('🔊 AudioContext reanudado manualmente')
      }).catch((err) => {
        console.warn('⚠️ Error reanudando AudioContext:', err)
      })
    }
  }

  // ---- Modo caminar / órbita ----
  toggleWalkMode() {
    this.isThirdPerson = !this.isThirdPerson

    const controls = this.camera.controls
    const cam = this.camera.instance

    if (this.isThirdPerson) {
      controls.enabled = false
      console.log('🟡 Tercera persona ON')
    } else {
      controls.enabled = true
      controls.enableRotate = true
      controls.enableZoom = true
      controls.enablePan = false
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI * 0.9

      cam.position.set(12, 5, 10)
      cam.up.set(0, 1, 0)
      controls.target.set(0, 0, 0)
      cam.lookAt(controls.target)
      controls.update()

      console.log('🟢 Vista global restaurada')
    }
  }

  // ---- Loop principal ----
  startLoop() {
    this.vr.setUpdateCallback((delta) => this.update(delta))

    this.time.on('tick', () => {
      if (!this.renderer.instance.xr.isPresenting) {
        const delta = this.time.delta * 0.001
        this.update(delta)
      }
    })
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
  }

  update(delta) {
    if (!this.isThirdPerson && !this.renderer.instance.xr.isPresenting) {
      this.camera.update()
    }

    if (this.renderer.instance.xr.isPresenting) {
      this.adjustCameraForVR()
    }

    this.world.update(delta)
    this.renderer.update()
    this.physics.update(delta)

    this.socketManager?.update()
    // if (this.debugger) this.debugger.update()
  }

  adjustCameraForVR() {
    if (this.renderer.instance.xr.isPresenting && this.world.robot?.group) {
      const pos = this.world.robot.group.position
      this.camera.instance.position.copy(pos).add(new THREE.Vector3(0, 1.6, 0))
      this.camera.instance.lookAt(pos.clone().add(new THREE.Vector3(0, 1.6, -1)))
    }
  }

  // ---- Obstáculos aleatorios por oleadas ----
  _startObstacleWaves() {
    this.obstacleWaveCount = 10
    this.maxObstacles = 50
    this.currentObstacles = []
    const delay = 30000

    const spawnWave = () => {
      if (this.obstacleWavesDisabled) return

      for (let i = 0; i < this.obstacleWaveCount; i++) {
        const obstacle = this.raycaster.generateRandomObstacle?.()
        if (obstacle) {
          this.currentObstacles.push(obstacle)
        }
      }

      while (this.currentObstacles.length > this.maxObstacles) {
        const oldest = this.currentObstacles.shift()
        if (oldest) this.raycaster._removeObstacle(oldest)
      }

      this.obstacleWaveTimeout = setTimeout(spawnWave, delay)
    }

    this.obstacleWaveTimeout = setTimeout(spawnWave, 30000)
  }

  // ---- Teardown ----
  destroy() {
    this.sizes.off('resize')
    this.time.off('tick')

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose && mat.dispose())
        } else {
          child.material.dispose?.()
        }
      }
    })

    this.camera.controls.dispose()
    this.renderer.instance.dispose()
    if (this.debug.active) this.debug.ui.destroy()
  }

  // ---- Inicio de partida ----
  startGame() {
    console.log('🎮 Juego iniciado')
    this.isThirdPerson = true
    this.tracker.start()
    this._startObstacleWaves()
    if (this.menu && this.menu.toggleButton && this.menu.toggleButton.style) {
      this.menu.toggleButton.style.display = 'block'
    }
    if (this.world) this.world.gameStarted = true
  }

  // ---- Reinicio total (volver a crear Experience) ----
  resetGame() {
    console.log('♻️ Reiniciando juego…')
    this.socketManager?.socket?.disconnect()
    if (this.menu) this.menu.destroy()
    if (this.tracker) this.tracker.destroy()
    if (this.socketManager) this.socketManager.destroy()

    this.destroy()
    instance = null
    const newExperience = new Experience(this.canvas)
    newExperience.isThirdPerson = true

    const cancelBtn = document.getElementById('cancel-button')
    if (cancelBtn) cancelBtn.remove()

    newExperience.tracker?.hideGameButtons?.()
  }

  // ---- Respawn limpio al Nivel 1 ----
  async resetGameToFirstLevel() {
    console.log('♻️ Reiniciando al Nivel 1…')

    // 1) limpiar enemigos existentes
    if (Array.isArray(this.world.enemies)) {
      this.world.enemies.forEach(e => e?.destroy?.())
      this.world.enemies = []
    } else {
      this.world.enemy?.destroy?.()
      this.world.enemy = null
    }

    // 2) flags y puntaje
    this.world.defeatTriggered = false
    this.world.gameFinished = false
    this.world.allowPrizePickup = false
    this.world.points = 0
    if (this.world.robot) this.world.robot.points = 0

    // 3) establecer nivel y limpiar escena
    this.world.levelManager.currentLevel = 1
    this.world.clearCurrentScene()

    // 4) cargar nivel 1 (bloques, spawnpoint, monedas)
    await this.world.loadLevel(1)

    // 5) respawn de enemigos (usa helper si existe, sino fallback)
    if (typeof this.world.respawnEnemies === 'function') {
      this.world.respawnEnemies()
    } else {
      const enemiesCountEnv = parseInt(import.meta.env.VITE_ENEMIES_COUNT || '3', 10)
      const n = Number.isFinite(enemiesCountEnv) && enemiesCountEnv > 0 ? enemiesCountEnv : 3
      this.world.spawnEnemies(n)
    }

    // 6) revivir personaje y colocar en spawn (loadLevel ya llama resetRobotPosition)
    this.world.robot?.revive?.()

    // 7) HUD y tracker
    this.menu?.setStatus?.(`🎖️ Puntos: 0 / ${this.world.levelManager.getCurrentLevelTargetPoints()}`)
    if (this.tracker) this.tracker.destroy()
    this.tracker = new GameTracker({ modal: this.modal, menu: this.menu })
    this.tracker.start()

    // 8) flags de juego
    this.world.allowPrizePickup = true
    this.world.gameStarted = true

    console.log('✅ Juego reiniciado en Nivel 1.')
  }
}
