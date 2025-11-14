// src/Game/World/World.js
import * as THREE from 'three'
import Environment from './Environment.js'
import Fox from './Fox.js'
import Robot from './Robot.js'
import ToyCarLoader from '../../loaders/ToyCarLoader.js'
import Floor from './Floor.js'
import ThirdPersonCamera from './ThirdPersonCamera.js'
import Sound from './Sound.js'
import AmbientSound from './AmbientSound.js'
import MobileControls from '../../controls/MobileControls.js'
import LevelManager from './LevelManager.js'
import BlockPrefab from './BlockPrefab.js'
import FinalPrizeParticles from '../Utils/FinalPrizeParticles.js'
import Enemy from './Enemy.js'

export default class World {
  constructor(experience) {
    this.experience = experience
    this.scene = this.experience.scene
    this.blockPrefab = new BlockPrefab(this.experience)
    this.resources = this.experience.resources
    this.levelManager = new LevelManager(this.experience)
    this.finalPrizeActivated = false
    this.gameStarted = false
    this.gameFinished = false
    this.enemies = []

    this.coinSound = new Sound('/sounds/coin.ogg')
    this.ambientSound = new AmbientSound('/sounds/ambiente.mp3')
    this.winner = new Sound('/sounds/winner.mp3')
    this.portalSound = new Sound('/sounds/portal.mp3')
    this.loseSound = new Sound('/sounds/lose.ogg')

    this.allowPrizePickup = false
    this.hasMoved = false

    // ====== Portal fijo L1 (como lo tenías) ======
    this.PORTAL_LEVEL1_POS = new THREE.Vector3(41.0336, 0.3423, 41.3490)

    // ====== Ancla/posición para portal L2 → L3 ======
    this.PORTAL_L2_ANCHOR_NAME = 'baked_lev1_lev2'
    this.PORTAL_L2_FALLBACK = new THREE.Vector3(
      41.03361511230469,
      0.3423145115375519,
      41.3490104675293
    )

    this.portalActive = false
    this.portalGroup = null
    this.portalTrigger = null
    this.portalTriggerRadius = 1.8
    this.teleporting = false

    setTimeout(() => { this.allowPrizePickup = true }, 2000)

    this.resources.on('ready', async () => {
      this.floor = new Floor(this.experience)
      this.environment = new Environment(this.experience)

      this.loader = new ToyCarLoader(this.experience)
      await this.loader.loadFromAPI()

      this.fox = new Fox(this.experience)
      this.robot = new Robot(this.experience)

      // Enemigos (plantilla simple)
      this.enemyTemplate = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      )

      // Spawnea por primera vez
      const enemiesCountEnv = parseInt(import.meta.env.VITE_ENEMIES_COUNT || '3', 10)
      const enemiesCount = Number.isFinite(enemiesCountEnv) && enemiesCountEnv > 0 ? enemiesCountEnv : 3
      this.spawnEnemies(enemiesCount)

      this.experience.vr.bindCharacter(this.robot)
      this.thirdPersonCamera = new ThirdPersonCamera(this.experience, this.robot.group)

      this.mobileControls = new MobileControls({
        onUp: (pressed) => { this.experience.keyboard.keys.up = pressed },
        onDown: (pressed) => { this.experience.keyboard.keys.down = pressed },
        onLeft: (pressed) => { this.experience.keyboard.keys.left = pressed },
        onRight: (pressed) => { this.experience.keyboard.keys.right = pressed }
      })

      if (!this.experience.physics || !this.experience.physics.world) {
        console.error('🚫 Sistema de físicas no está inicializado al cargar el mundo.')
        return
      }

      this._checkVRMode()
      this.experience.renderer.instance.xr.addEventListener('sessionstart', () => {
        this._checkVRMode()
      })
    })
  }

  // ==================== Limpieza de premios/monedas ====================
  _disposeObj(obj) {
    if (!obj) return
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m?.dispose?.())
      else obj.material.dispose?.()
    }
  }

  _cleanupAllPrizes() {
    if (this.loader && Array.isArray(this.loader.prizes)) {
      for (const p of this.loader.prizes) {
        try {
          if (p.model) {
            this.scene.remove(p.model)
            this._disposeObj(p.model)
            p.model = null
          }
          if (p.pivot) {
            const toKill = []
            p.pivot.traverse(o => toKill.push(o))
            toKill.forEach(o => {
              if (o !== p.pivot) this._disposeObj(o)
              p.pivot.remove(o)
            })
            if (p.pivot.parent) p.pivot.parent.remove(p.pivot)
            this._disposeObj(p.pivot)
            p.pivot = null
          }
        } catch (e) {
          console.warn('⚠️ Error limpiando prize:', e)
        }
      }
      this.loader.prizes.length = 0
    }

    // Barrido defensivo
    const garbage = []
    this.scene.traverse(obj => {
      const n = (obj.name || '').toLowerCase()
      const role = obj.userData?.role
      const isPrizeish =
        role === 'finalPrize' ||
        role === 'default' ||
        n.includes('prize') ||
        n.includes('coin')
      if (isPrizeish) garbage.push(obj)
    })
    garbage.forEach(g => {
      if (g.parent) g.parent.remove(g)
      this._disposeObj(g)
    })
  }
  // ======================================================================

  // ====== Portal helpers ======
  _getAnchorPositionByName(name, fallbackVec3) {
    const target = (name || '').toLowerCase()
    let found = null
    this.scene.traverse(obj => {
      if (!found && obj.name && obj.name.toLowerCase() === target) found = obj
    })
    if (found) {
      const wp = new THREE.Vector3()
      found.getWorldPosition(wp)
      return wp
    }
    return fallbackVec3.clone()
  }

  _getPortalPositionForLevel(level) {
    if (level === 1) {
      return this.PORTAL_LEVEL1_POS.clone()
    }
    if (level === 2) {
      // L2 → L3: usar el ancla "baked_lev1_lev2" o fallback
      return this._getAnchorPositionByName(
        this.PORTAL_L2_ANCHOR_NAME,
        this.PORTAL_L2_FALLBACK
      )
    }
    if (level === 3) {
      return null
    }
  }

  _spawnPortalAt(position) {
    if (this.portalActive) return
    this.portalActive = true

    this.portalGroup = new THREE.Group()
    this.portalGroup.position.copy(position)
    this.portalGroup.userData.levelObject = true
    this.scene.add(this.portalGroup)

    const trigGeom = new THREE.CylinderGeometry(this.portalTriggerRadius, this.portalTriggerRadius, 2.2, 16)
    const trigMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.06 })
    this.portalTrigger = new THREE.Mesh(trigGeom, trigMat)
    this.portalTrigger.position.set(0, 1.1, 0)
    this.portalTrigger.visible = false
    this.portalTrigger.userData.levelObject = true
    this.portalGroup.add(this.portalTrigger)

    new FinalPrizeParticles({
      scene: this.scene,
      targetPosition: position.clone(),
      sourcePosition: this.robot?.body?.position,
      experience: this.experience
    })

    this._buildPortalLights(this.portalGroup)

    if (window.userInteracted) this.portalSound.play()
    console.log('🌀 Portal creado en', position.toArray())
  }

  _buildPortalLights(group) {
    const disco = new THREE.Group()
    group.add(disco)

    const rayMaterial = new THREE.MeshBasicMaterial({
      color: 0xaa00ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    })

    const rayCount = 4
    for (let i = 0; i < rayCount; i++) {
      const cone = new THREE.ConeGeometry(0.2, 4, 6, 1, true)
      const ray = new THREE.Mesh(cone, rayMaterial)

      ray.position.set(0, 2, 0)
      ray.rotation.x = Math.PI / 2
      ray.rotation.z = (i * Math.PI * 2) / rayCount

      const spot = new THREE.SpotLight(0xaa00ff, 2, 12, Math.PI / 7, 0.2, 0.5)
      spot.castShadow = false
      spot.shadow.mapSize.set(1, 1)
      spot.position.copy(ray.position)
      spot.target.position.set(Math.cos(ray.rotation.z) * 10, 2, Math.sin(ray.rotation.z) * 10)

      ray.userData.spot = spot
      disco.add(ray)
      disco.add(spot)
      disco.add(spot.target)
    }

    this.discoRaysGroup = disco
  }

  _despawnPortal() {
    if (!this.portalGroup) return

    if (this.portalTrigger) {
      this.portalTrigger.geometry?.dispose?.()
      this.portalTrigger.material?.dispose?.()
      this.portalGroup.remove(this.portalTrigger)
      this.portalTrigger = null
    }

    if (this.discoRaysGroup) {
      this.discoRaysGroup.traverse(obj => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.()
          obj.material?.dispose?.()
        }
      })
      this.portalGroup.remove(this.discoRaysGroup)
      this.discoRaysGroup = null
    }

    this.scene.remove(this.portalGroup)
    this.portalGroup = null
    this.portalActive = false
    this.teleporting = false
  }

  _tryTeleportThroughPortal(playerPos) {
    if (!this.portalActive || !this.portalGroup || this.teleporting) return
    const portalPos = this.portalGroup.position
    const dist = portalPos.distanceTo(playerPos)
    if (dist <= this.portalTriggerRadius) {
      this.teleporting = true
      if (window.userInteracted) this.portalSound.play()

      new FinalPrizeParticles({
        scene: this.scene,
        targetPosition: portalPos.clone(),
        sourcePosition: playerPos.clone(),
        experience: this.experience
      })

      this.levelManager.nextLevel()
      setTimeout(() => { this.teleporting = false }, 1500)
    }
  }
  // ====== /Portal helpers ======

  // ====== Enemigos ======
  destroyAllEnemies() {
    if (this.enemies?.length) {
      this.enemies.forEach(e => e?.destroy?.())
      this.enemies = []
    }
    if (typeof Enemy.resetAllAudio === 'function') Enemy.resetAllAudio()
  }

  respawnEnemies(count) {
    this.destroyAllEnemies()
    const envCount = parseInt(import.meta.env.VITE_ENEMIES_COUNT || '3', 10)
    const n = Number.isFinite(count) ? count : (Number.isFinite(envCount) && envCount > 0 ? envCount : 3)
    this.spawnEnemies(n)
  }

  // Crear varios enemigos (levemente por encima del suelo para evitar “pegas”)
  spawnEnemies(count = 3) {
    if (!this.robot?.body?.position) return
    const playerPos = this.robot.body.position
    const minRadius = 25
    const maxRadius = 40

    // Siempre limpia antes (defensivo)
    if (this.enemies?.length) {
      this.enemies.forEach(e => e?.destroy?.())
      this.enemies = []
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = minRadius + Math.random() * (maxRadius - minRadius)
      const x = playerPos.x + Math.cos(angle) * radius
      const z = playerPos.z + Math.sin(angle) * radius
      const y = 2.0 // modelo inicia un poco arriba; el body usa groundY

      const enemy = new Enemy({
        scene: this.scene,
        physicsWorld: this.experience.physics.world,
        playerRef: this.robot,
        model: this.enemyTemplate,
        position: new THREE.Vector3(x, y, z),
        experience: this.experience,
        // Eleva ligeramente para evitar bug en estructuras
        groundY: 0.05,
        floorEpsilon: 0.04,
        targetHeight: 0.42
      })

      enemy.delayActivation = 1.0 + i * 0.5
      this.enemies.push(enemy)
    }
  }
  // ====== /Enemigos ======

  toggleAudio() { this.ambientSound.toggle() }

  update(delta) {
    this.fox?.update()
    this.robot?.update()
    this.blockPrefab?.update()

    if (this.gameStarted) {
      this.enemies?.forEach(e => e.update(delta))

      const distToClosest = this.enemies?.reduce((min, e) => {
        if (!e?.body?.position || !this.robot?.body?.position) return min
        const d = e.body.position.distanceTo(this.robot.body.position)
        return Math.min(min, d)
      }, Infinity) ?? Infinity

      if (distToClosest < 1.0 && !this.defeatTriggered) {
        this.defeatTriggered = true

        if (window.userInteracted && this.loseSound) this.loseSound.play()

        const firstEnemy = this.enemies?.[0]
        const enemyMesh = firstEnemy?.model || firstEnemy?.group
        if (enemyMesh) {
          enemyMesh.scale.set(1.3, 1.3, 1.3)
          setTimeout(() => { enemyMesh.scale.set(1, 1, 1) }, 500)
        }

        this.experience.modal.show({
          icon: '💀',
          message: '¡El enemigo te atrapó!\n¿Quieres intentarlo otra vez?',
          buttons: [
            { text: '🔁 Reintentar', onClick: () => this.experience.resetGameToFirstLevel() },
            { text: '❌ Salir', onClick: () => this.experience.resetGame() }
          ]
        })
        return
      }
    }

    if (this.thirdPersonCamera && this.experience.isThirdPerson && !this.experience.renderer.instance.xr.isPresenting) {
      this.thirdPersonCamera.update()
    }

    this.loader?.prizes?.forEach(p => p.update(delta))

    if (!this.allowPrizePickup || !this.loader || !this.robot || !this.robot.body) return

    let pos = null
    if (this.experience.renderer.instance.xr.isPresenting) {
      pos = this.experience.camera.instance.position
    } else if (this.robot?.body?.position) {
      pos = this.robot.body.position
    } else {
      return
    }

    const speed = this.robot?.body?.velocity?.length?.() || 0
    const moved = speed > 0.5

    this.loader.prizes.forEach((prize) => {
      if (!prize.pivot) return

      const dist = prize.pivot.position.distanceTo(pos)
      if (dist < 1.2 && moved && !prize.collected) {
        prize.collect()
        prize.collected = true

        if (prize.role === 'default') {
          this.points = (this.points || 0) + 1
          this.robot.points = this.points

          const pointsTarget = this.levelManager.getCurrentLevelTargetPoints()
          console.log(`🎯 Monedas recolectadas: ${this.points} / ${pointsTarget}`)

          // Apertura de portal / fin de juego por nivel
          if (!this.portalActive && this.points >= pointsTarget) {
            if (this.levelManager.currentLevel === 1) {
              this._spawnPortalAt(this.PORTAL_LEVEL1_POS)
            } else if (this.levelManager.currentLevel === 2) {
              const p = this._getPortalPositionForLevel(2)
              if (p) this._spawnPortalAt(p)
            } else if (this.levelManager.currentLevel === 3) {
              if (!this.gameFinished) {
                this.gameFinished = true
                const elapsed = this.experience.tracker.stop()
                this.experience.tracker.saveTime(elapsed)
                this.experience.tracker.showEndGameModal(elapsed)
                this.experience.obstacleWavesDisabled = true
                clearTimeout(this.experience.obstacleWaveTimeout)
                this.experience.raycaster?.removeAllObstacles?.()
                if (window.userInteracted) this.winner.play()
              }
            }
          }
        }

        if (prize.role === 'finalPrize') {
          if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
            this.levelManager.nextLevel()
            this.points = 0
            this.robot.points = 0
          } else {
            if (!this.gameFinished) {
              this.gameFinished = true
              const elapsed = this.experience.tracker.stop()
              this.experience.tracker.saveTime(elapsed)
              this.experience.tracker.showEndGameModal(elapsed)
              this.experience.obstacleWavesDisabled = true
              clearTimeout(this.experience.obstacleWaveTimeout)
              this.experience.raycaster?.removeAllObstacles?.()
              if (window.userInteracted) this.winner.play()
            }
          }
        }

        if (this.experience.raycaster?.removeRandomObstacles) {
          const reduction = 0.2 + Math.random() * 0.1
          this.experience.raycaster.removeRandomObstacles(reduction)
        }

        if (window.userInteracted) this.coinSound.play()
        this.experience.menu.setStatus?.(
          `🎖️ Puntos: ${this.points} / ${this.levelManager.getCurrentLevelTargetPoints()}`
        )
      }
    })

    // FinalPrize autovisible si recoges todas
    if (!this.finalPrizeActivated && this.loader?.prizes) {
      const totalDefault = this.loader.prizes.filter(p => p.role === 'default').length
      const collectedDefault = this.loader.prizes.filter(p => p.role === 'default' && p.collected).length

      if (totalDefault > 0 && collectedDefault === totalDefault) {
        const finalCoin = this.loader.prizes.find(p => p.role === 'finalPrize')
        if (finalCoin && !finalCoin.collected && finalCoin.pivot) {
          finalCoin.pivot.visible = true
          if (finalCoin.model) finalCoin.model.visible = true
          this.finalPrizeActivated = true

          new FinalPrizeParticles({
            scene: this.scene,
            targetPosition: finalCoin.pivot.position,
            sourcePosition: this.experience.vrDolly?.position ?? this.experience.camera.instance.position,
            experience: this.experience
          })

          this._buildPortalLights(finalCoin.pivot)
          if (window.userInteracted) this.portalSound.play()
          console.log('🪙 FinalPrize activado automáticamente desde VR.')
        }
      }
    }

    if (this.discoRaysGroup) this.discoRaysGroup.rotation.y += delta * 0.5

    if (pos) this._tryTeleportThroughPortal(pos)

    const playerPos = this.experience.renderer.instance.xr.isPresenting
      ? this.experience.camera.instance.position
      : this.robot?.body?.position

    this.scene.traverse((obj) => {
      if (obj.userData?.levelObject && obj.userData.physicsBody) {
        const dist = obj.position.distanceTo(playerPos)
        const shouldEnable = dist < 40 && obj.visible
        const body = obj.userData.physicsBody
        if (shouldEnable && !body.enabled) body.enabled = true
        else if (!shouldEnable && body.enabled) body.enabled = false
      }
    })
  }

  async loadLevel(level) {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      const apiUrl = `${backendUrl}/api/blocks?level=${level}`

      // 🔥 Limpieza previa
      this.destroyAllEnemies()
      this._cleanupAllPrizes()
      this._despawnPortal()
      this.finalPrizeActivated = false
      this.gameFinished = false

      let data
      try {
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error('Error desde API')
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          const preview = (await res.text()).slice(0, 120)
          throw new Error(`Respuesta no-JSON desde API (${apiUrl}): ${preview}`)
        }
        data = await res.json()
        console.log(`📦 Datos del nivel ${level} cargados desde API`)
      } catch (error) {
        console.warn(`⚠️ No se pudo conectar con el backend. Usando datos locales para nivel ${level}...`)
        const publicPath = (p) => {
          const base = import.meta.env.BASE_URL || '/'
          return `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`
        }

        const localUrl = publicPath('data/toy_car_blocks.json')
        const localRes = await fetch(localUrl)
        if (!localRes.ok) {
          const preview = (await localRes.text()).slice(0, 120)
          throw new Error(`No se pudo cargar ${localUrl} (HTTP ${localRes.status}). Vista previa: ${preview}`)
        }
        const localCt = localRes.headers.get('content-type') || ''
        if (!localCt.includes('application/json')) {
          const preview = (await localRes.text()).slice(0, 120)
          throw new Error(`Contenido no JSON en ${localUrl}. Vista previa: ${preview}`)
        }
        const allBlocks = await localRes.json()
        data = { blocks: allBlocks }
      }

      // Solo bloques del nivel solicitado
      if (Array.isArray(data?.blocks)) {
        data.blocks = data.blocks.filter(b => Number(b.level) === Number(level))
      }

      const spawnPoint = data.spawnPoint || { x: -17, y: 1.5, z: -67 }
      this.points = 0
      this.robot.points = 0
      this.experience.menu.setStatus?.(`🎖️ Puntos: ${this.points} / ${this.levelManager.getCurrentLevelTargetPoints()}`)

      if (Array.isArray(data.blocks)) {
        const publicPath = (p) => {
          const base = import.meta.env.BASE_URL || '/'
          return `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`
        }
        const preciseUrl = publicPath('config/precisePhysicsModels.json')
        const preciseRes = await fetch(preciseUrl)
        if (!preciseRes.ok) {
          const preview = (await preciseRes.text()).slice(0, 120)
          throw new Error(`No se pudo cargar ${preciseUrl} (HTTP ${preciseRes.status}). Vista previa: ${preview}`)
        }
        const preciseCt = preciseRes.headers.get('content-type') || ''
        if (!preciseCt.includes('application/json')) {
          const preview = (await preciseRes.text()).slice(0, 120)
          throw new Error(`Contenido no JSON en ${preciseUrl}. Vista previa: ${preview}`)
        }
        const preciseModels = await preciseRes.json()

        // Re-limpia por si el loader ya creó algo
        this._cleanupAllPrizes()
        this.loader._processBlocks(data.blocks, preciseModels)
      } else {
        this._cleanupAllPrizes()
        await this.loader.loadFromURL(apiUrl)
      }

      // Inicializa prizes del nivel
      if (this.loader && Array.isArray(this.loader.prizes)) {
        this.loader.prizes.forEach(p => {
          if (p.model) p.model.visible = (p.role !== 'finalPrize')
          p.collected = false
          if (p.pivot) p.pivot.userData.levelObject = true
          if (p.model) p.model.userData.levelObject = true
        })
      }

      this.totalDefaultCoins = this.loader?.prizes?.filter(p => p.role === 'default').length || 0
      console.log(`🎯 Total de monedas default para el nivel ${level}: ${this.totalDefaultCoins}`)

      this.resetRobotPosition(spawnPoint)
      console.log(`✅ Nivel ${level} cargado con spawn en`, spawnPoint)

      // Regenerar enemigos para el nuevo mundo
      this.respawnEnemies()

      this.experience.menu.setStatus?.(
        `🎖️ Puntos: ${this.points} / ${this.levelManager.getCurrentLevelTargetPoints()}`
      )
    } catch (error) {
      console.error('❌ Error cargando nivel:', error)
    }
  }

  clearCurrentScene() {
    if (!this.experience || !this.scene || !this.experience.physics || !this.experience.physics.world) {
      console.warn('⚠️ No se puede limpiar: sistema de físicas no disponible.')
      return
    }

    // También limpiar enemigos al limpiar escena
    this.destroyAllEnemies()

    this._cleanupAllPrizes()
    this._despawnPortal()
    this.finalPrizeActivated = false

    let visualObjectsRemoved = 0
    let physicsBodiesRemoved = 0

    const childrenToRemove = []
    this.scene.children.forEach((child) => {
      if (child.userData && child.userData.levelObject) {
        childrenToRemove.push(child)
      }
    })

    childrenToRemove.forEach((child) => {
      this._disposeObj(child)
      this.scene.remove(child)
      if (child.userData.physicsBody) {
        this.experience.physics.world.removeBody(child.userData.physicsBody)
      }
      visualObjectsRemoved++
    })

    if (this.experience.physics && this.experience.physics.world && Array.isArray(this.experience.physics.bodies)) {
      const survivingBodies = []
      let bodiesBefore = this.experience.physics.bodies.length

      this.experience.physics.bodies.forEach((body) => {
        if (body.userData && body.userData.levelObject) {
          this.experience.physics.world.removeBody(body)
          physicsBodiesRemoved++
        } else {
          survivingBodies.push(body)
        }
      })

      this.experience.physics.bodies = survivingBodies

      console.log(`🧹 Physics Cleanup Report:`)
      console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`)
      console.log(`🎯 Cuerpos físicos sobrevivientes: ${survivingBodies.length}`)
      console.log(`📦 Estado inicial: ${bodiesBefore} → Estado final: ${survivingBodies.length}`)
    } else {
      console.warn('⚠️ Physics system no disponible o sin cuerpos activos, omitiendo limpieza física.')
    }

    console.log(`🧹 Escena limpiada.`)
    console.log(`✅ Objetos 3D eliminados: ${visualObjectsRemoved}`)
    console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`)

    this._cleanupAllPrizes()
  }

  resetRobotPosition(spawn = { x: -17, y: 1.5, z: -67 }) {
    if (!this.robot?.body || !this.robot?.group) return
    this.robot.body.position.set(spawn.x, spawn.y, spawn.z)
    this.robot.body.velocity.set(0, 0, 0)
    this.robot.body.angularVelocity.set(0, 0, 0)
    this.robot.body.quaternion.setFromEuler(0, 0, 0)
    this.robot.group.position.set(spawn.x, spawn.y, spawn.z)
    this.robot.group.rotation.set(0, 0, 0)
  }

  async _processLocalBlocks(blocks) {
    const lvl = this.levelManager.currentLevel
    const filtered = Array.isArray(blocks) ? blocks.filter(b => Number(b.level) === Number(lvl)) : []

    const preciseRes = await fetch('/config/precisePhysicsModels.json')
    const preciseModels = await preciseRes.json()

    this._cleanupAllPrizes()
    this.loader._processBlocks(filtered, preciseModels)

    if (this.loader?.prizes) {
      this.loader.prizes.forEach(p => {
        if (p.model) p.model.visible = (p.role !== 'finalPrize')
        p.collected = false
        if (p.pivot) p.pivot.userData.levelObject = true
        if (p.model) p.model.userData.levelObject = true
      })
    }

    this.totalDefaultCoins = this.loader?.prizes?.filter(p => p.role === 'default').length || 0
    console.log(`🎯 Total de monedas default para el nivel local(${lvl}): ${this.totalDefaultCoins}`)
  }

  _checkVRMode() {
    const isVR = this.experience.renderer.instance.xr.isPresenting
    if (isVR) {
      if (this.robot?.group) this.robot.group.visible = false
      if (this.enemy) this.enemy.delayActivation = 10.0
      this.experience.camera.instance.position.set(5, 1.6, 5)
      this.experience.camera.instance.lookAt(new THREE.Vector3(5, 1.6, 4))
    } else {
      if (this.robot?.group) this.robot.group.visible = true
    }
  }
}
