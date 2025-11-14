// src/Game/enemy.js
// Enemigo “hover”: altura mínima elevada + velocidad estable x1.2 en cualquier superficie.
// Incluye clamp para ignorar valores bajos que vengan desde World.spawnEnemies.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as CANNON from 'cannon-es'
import FinalPrizeParticles from '../Utils/FinalPrizeParticles.js'
import Sound from './Sound.js'

export default class Enemy {
  static _instances = new Set()
  static resetAllAudio() {
    for (const e of Enemy._instances) {
      try { e.proximitySound?.setVolume(0); e.proximitySound?.stop() } catch {}
      e._currentVolume = 0
      e._audioArmed = false
    }
  }

  constructor({
    scene,
    physicsWorld,
    playerRef,
    position = new THREE.Vector3(),
    experience,
    formationIndex = 0,
    formationSpacing = 2.4,

    // ⬆️ Alturas por defecto más altas
    targetHeight = 0.52,     // altura visual del modelo
    groundY = 0.28,          // Y base del “hover” del cuerpo físico
    floorEpsilon = 0.18,     // snap visual por encima del suelo

    playerRadius = 0.44,
    baseSpeed = 0.50,
    maxSpeed = 1.10,
    speedMultiplier = 1.2,   // x1.2 global
    animSlowdown = 0.90,
    alertDistance = 14,
    maxVolume = 0.9,
    minVolume = 0.15,
    soundFadeSpeed = 3.0,
    strafeRadius = 2.2,
    strafeSpeed = 0.6,
    wanderStrength = 0.8,
    wanderJitter = 0.9,
    seekWeight = 1.0,
    strafeWeight = 0.7,
    wanderWeight = 0.4,

    // Anti-atascos / hover
    enableHover = true,
    hoverAmplitude = 0.035,   // ~3.5cm
    unstuckCheckEvery = 0.35,
    unstuckSpeedEps = 0.12,
    unstuckNudgeUp = 0.10,
    unstuckNudgeSide = 0.75
  }) {
    this.experience = experience
    this.scene = scene
    this.physicsWorld = physicsWorld
    this.playerRef = playerRef

    // Movimiento / estado
    this.baseSpeed = baseSpeed * speedMultiplier
    this.maxSpeed = maxSpeed * speedMultiplier
    this.speedMultiplier = speedMultiplier
    this.speed = this.baseSpeed
    this.delayActivation = 0
    this._destroyed = false

    // Parámetros (con mínimos forzados por si World pasa valores bajos)
    const MIN_GROUND_Y = 0.28
    const MIN_FLOOR_EPS = 0.16
    const MIN_TARGET_H = 0.50
    this.formationIndex = formationIndex
    this.formationSpacing = formationSpacing
    this.groundY = Math.max(groundY, MIN_GROUND_Y)
    this.floorEpsilon = Math.max(floorEpsilon, MIN_FLOOR_EPS)
    this.targetHeight = Math.max(targetHeight, MIN_TARGET_H)
    this.playerRadius = playerRadius
    this.animSlowdown = animSlowdown * speedMultiplier

    // Hover / anti-atascos
    this.enableHover = enableHover
    this.hoverAmplitude = hoverAmplitude
    this._hoverTime = Math.random() * Math.PI * 2
    this._unstuckTimer = 0
    this._unstuckEvery = unstuckCheckEvery
    this.unstuckSpeedEps = unstuckSpeedEps
    this.unstuckNudgeUp = unstuckNudgeUp
    this.unstuckNudgeSide = unstuckNudgeSide
    this._lastPos = new CANNON.Vec3()

    // Sonido
    this.alertDistance = alertDistance
    this.maxVolume = Math.min(1, Math.max(0, maxVolume))
    this.minVolume = Math.min(this.maxVolume, Math.max(0, minVolume))
    this.soundFadeSpeed = soundFadeSpeed
    this._currentVolume = 0
    this._audioArmed = false

    // Steering
    this._seed = Math.random() * 1000 + (formationIndex * 137)
    this.strafeRadius = strafeRadius
    this.strafeSpeed =
      (0.5 + Math.random() * 0.6) *
      (strafeSpeed * speedMultiplier) *
      (Math.random() < 0.5 ? -1 : 1)
    this.wanderStrength = wanderStrength
    this.wanderJitter = wanderJitter * (0.8 + Math.random() * 0.4)
    this.seekWeight = seekWeight
    this.strafeWeight = strafeWeight
    this.wanderWeight = wanderWeight
    this._orbitAngle = Math.random() * Math.PI * 2

    // Audio proximidad (cambia tu ruta si lo necesitas)
    this.proximitySound = new Sound('/sounds/SONIDO DE SERPIENTE.mp3', { loop: true, volume: 0 })

    // ==== FÍSICAS =========================================================
    const enemyMaterial = new CANNON.Material('enemyMaterial')
    enemyMaterial.friction = 0.0

    // esfera pequeña = menos roce con aristas
    this.shapeRadius = Math.max(0.1, this.targetHeight * 0.33)
    const shape = new CANNON.Sphere(this.shapeRadius)
    this.body = new CANNON.Body({
      mass: 5,
      shape,
      material: enemyMaterial,
      position: new CANNON.Vec3(position.x, this.groundY, position.z),
      linearDamping: 0.02
    })
    if (this.formationIndex !== 0) {
      this.body.position.x += this.formationIndex * this.formationSpacing
    }
    this.body.sleepSpeedLimit = 0.0
    this.body.wakeUp()
    this.physicsWorld.addBody(this.body)
    this._lastPos.copy(this.body.position)

    // Mantén velocidad estable sin importar la superficie:
    // fricción 0 entre enemigo y cualquier otro material
    try {
      const contact = new CANNON.ContactMaterial(enemyMaterial, enemyMaterial, {
        friction: 0.0,
        restitution: 0.0
      })
      if (!this.physicsWorld.contactmaterials.includes?.(contact)) {
        this.physicsWorld.addContactMaterial(contact)
      }
    } catch {}

    // ==== MODELO + ANIMS ==================================================
    this.model = null
    this.mixer = null
    this._activeAction = null
    this._actions = []
    this._clipNames = [
      'Armature_y333000_p00|Overworld Animations',
      'Armature_y333000_p00|Blasters Mode Animations',
      'Armature_y333000_p00|Battle Animations'
    ]
    this._clipIndex = 0
    this._loadModel('/models/Enemy/Enemy.glb')

    // Colisión con jugador
    this._onCollide = (event) => {
      if (this._destroyed) return
      if (event.body === this.playerRef?.body) this._killPlayer()
    }
    this.body.addEventListener('collide', this._onCollide)

    Enemy._instances.add(this)
  }

  _killPlayer() {
    if (this._destroyed) return
    if (typeof this.playerRef?.die === 'function') this.playerRef.die()
    try { this.proximitySound?.setVolume(0); this.proximitySound?.stop() } catch {}
    if (this.model?.parent) {
      new FinalPrizeParticles({
        scene: this.scene,
        targetPosition: this.body.position,
        sourcePosition: this.body.position,
        experience: this.experience
      })
    }
    this.destroy()
  }

  _loadModel(path) {
    const loader = new GLTFLoader()
    loader.load(
      path,
      (gltf) => {
        if (this._destroyed) return
        this.model = gltf.scene || gltf.scenes?.[0]
        this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })

        // Escala a altura objetivo
        this.model.updateMatrixWorld(true)
        const box0 = new THREE.Box3().setFromObject(this.model)
        const rawHeight = Math.max(0.001, box0.max.y - box0.min.y)
        const s = this.targetHeight / rawHeight
        this.model.scale.setScalar(s)

        // Snap elevado
        this.model.position.set(this.body.position.x, 0, this.body.position.z)
        this.model.updateMatrixWorld(true)
        const boxScaled = new THREE.Box3().setFromObject(this.model)
        const minY = boxScaled.min.y
        const yOffset = (this.groundY + this.floorEpsilon) - minY
        this.model.position.y += yOffset

        this.model.userData.physicsBody = this.body
        this.scene.add(this.model)

        // Animaciones algo más rápidas
        this.mixer = new THREE.AnimationMixer(this.model)
        this.mixer.timeScale = this.animSlowdown

        const clips = gltf.animations || []
        const findClip = (name) => clips.find(c => c.name === name)
        this._clipNames.forEach((name) => {
          const clip = findClip(name)
          if (clip) {
            const action = this.mixer.clipAction(clip)
            action.setLoop(THREE.LoopOnce, 0)
            action.clampWhenFinished = true
            action.enabled = true
            this._actions.push(action)
          }
        })
        if (this._actions.length === 0 && clips.length > 0) {
          for (const clip of clips) {
            const action = this.mixer.clipAction(clip)
            action.setLoop(THREE.LoopOnce, 0)
            action.clampWhenFinished = true
            action.enabled = true
            this._actions.push(action)
          }
        }
        this._playNextClip()
        this.mixer.addEventListener('finished', () => this._playNextClip())
      },
      undefined,
      (err) => console.error('[Enemy] Error cargando GLB:', err)
    )
  }

  _playNextClip() {
    if (!this.mixer || this._actions.length === 0) return
    if (this._activeAction) this._activeAction.stop()
    const action = this._actions[this._clipIndex]
    this._clipIndex = (this._clipIndex + 1) % this._actions.length
    if (this._activeAction) { this._activeAction.crossFadeTo(action, 0.3, false); action.reset().play() }
    else { action.reset().play() }
    this._activeAction = action
  }

  _noise(t) {
    const a = Math.sin((t + this._seed) * 1.3)
    const b = Math.sin((t * 0.7 + this._seed * 0.37) * 2.0)
    return (a + b * 0.5) * 0.5
  }

  _applyUnstuck(delta, seekLen) {
    this._unstuckTimer += delta
    if (this._unstuckTimer < this._unstuckEvery) return
    this._unstuckTimer = 0

    const dx = this.body.position.x - this._lastPos.x
    const dz = this.body.position.z - this._lastPos.z
    const moved = Math.hypot(dx, dz)
    this._lastPos.copy(this.body.position)

    if (moved < this.unstuckSpeedEps && seekLen > 1.2) {
      // micro-salto + empuje lateral
      this.body.position.y = this.groundY + this.unstuckNudgeUp
      const dir = Math.random() < 0.5 ? 1 : -1
      this.body.velocity.x += dir * this.unstuckNudgeSide
      this.body.velocity.z -= dir * this.unstuckNudgeSide
    }
  }

  update(delta) {
    if (this._destroyed) return
    if (this.delayActivation > 0) {
      this.delayActivation -= delta
      this.mixer?.update(delta)
      return
    }
    if (!this.body || !this.playerRef?.body) {
      this.mixer?.update(delta)
      return
    }

    // Altura constante + hover leve (siempre por encima del suelo)
    if (this.enableHover) {
      this._hoverTime += delta
      const wobble = Math.sin(this._hoverTime * 2.2) * this.hoverAmplitude
      this.body.position.y = this.groundY + wobble
    } else {
      this.body.position.y = this.groundY
    }
    this.body.velocity.y = 0

    const playerPos = this.playerRef.body.position
    const enemyPos = this.body.position

    // SEEK
    const seek = new CANNON.Vec3(playerPos.x - enemyPos.x, 0, playerPos.z - enemyPos.z)
    const seekLen = seek.length()
    if (seekLen > 0.0001) seek.scale(1 / seekLen, seek)

    // STRAFE
    this._orbitAngle += this.strafeSpeed * delta
    const strafeTargetX = playerPos.x + Math.cos(this._orbitAngle) * this.strafeRadius
    const strafeTargetZ = playerPos.z + Math.sin(this._orbitAngle) * this.strafeRadius
    const strafe = new CANNON.Vec3(strafeTargetX - enemyPos.x, 0, strafeTargetZ - enemyPos.z)
    const strafeLen = strafe.length()
    if (strafeLen > 0.0001) strafe.scale(1 / strafeLen, strafe)

    // WANDER
    const t = performance.now() * 0.001 * this.wanderJitter
    const wnX = this._noise(t), wnZ = this._noise(t + 42.17)
    const wander = new CANNON.Vec3(wnX, 0, wnZ)
    const wLen = wander.length()
    if (wLen > 0.0001) wander.scale(1 / wLen, wander)
    wander.scale(this.wanderStrength, wander)

    // Combinación
    const steer = new CANNON.Vec3(
      seek.x * this.seekWeight + strafe.x * this.strafeWeight + wander.x * this.wanderWeight,
      0,
      seek.z * this.seekWeight + strafe.z * this.strafeWeight + wander.z * this.wanderWeight
    )
    const steerLen = steer.length()
    if (steerLen > 0.0001) steer.scale(1 / steerLen, steer)

    // Velocidad (curva suave) – estable en cualquier superficie
    const approachRadius = 6
    const nearBoost = Math.max(0, Math.min(1, (approachRadius - seekLen) / approachRadius))
    const factor = Math.pow(nearBoost, 1.15)
    this.speed = this.baseSpeed + (this.maxSpeed - this.baseSpeed) * factor

    this.body.velocity.x = steer.x * this.speed
    this.body.velocity.z = steer.z * this.speed

    // Anti-atascos
    this._applyUnstuck(delta, seekLen)

    // Audio proximidad
    const insideAlert = seekLen <= this.alertDistance
    if (insideAlert && !this._audioArmed && this.proximitySound) {
      try { this.proximitySound.play() } catch {}
      this._audioArmed = true
    }
    const targetVol = insideAlert
      ? this.minVolume + (this.maxVolume - this.minVolume) * (1 - Math.min(1, seekLen / this.alertDistance))
      : 0
    const tv = Math.min(1, this.soundFadeSpeed * delta)
    this._currentVolume += (targetVol - this._currentVolume) * tv
    this.proximitySound?.setVolume(this._currentVolume)

    // Kill por distancia
    const killThreshold = (this.shapeRadius + this.playerRadius) * 0.95
    if (seekLen <= killThreshold) this._killPlayer()

    // Sincronizar modelo (snap elevado)
    if (this.model) {
      this.model.position.x = this.body.position.x
      this.model.position.z = this.body.position.z
      this.model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(this.model)
      const minY = box.min.y
      const desired =
        this.groundY +
        this.floorEpsilon +
        (this.enableHover ? Math.sin(this._hoverTime * 2.2) * this.hoverAmplitude : 0)
      this.model.position.y += (desired - minY)

      const lookAtTmp = new THREE.Vector3(playerPos.x, this.groundY, playerPos.z)
      this.model.lookAt(lookAtTmp)
    }

    this.mixer?.update(delta)
  }

  destroy() {
    if (this._destroyed) return
    this._destroyed = true
    try { this.proximitySound?.setVolume(0); this.proximitySound?.stop() } catch {}
    this._currentVolume = 0
    this._audioArmed = false

    if (this.model) {
      this.scene.remove(this.model)
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model) }
      this.model = null
    }
    if (this.body) {
      this.body.removeEventListener('collide', this._onCollide)
      if (this.physicsWorld.bodies.includes(this.body)) {
        this.physicsWorld.removeBody(this.body)
      }
      this.body = null
    }

    this.mixer = null
    this._actions = []
    this._activeAction = null
    Enemy._instances.delete(this)
  }
}
