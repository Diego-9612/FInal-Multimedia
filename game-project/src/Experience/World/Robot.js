// Robot.js
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Sound from './Sound.js'

export default class Robot {
  constructor(experience) {
    this.experience = experience
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.physics = this.experience.physics
    this.keyboard = this.experience.keyboard
    this.debug = this.experience.debug
    this.points = 0

    // Estado de vida/controles
    this.isDead = false
    this.controlsEnabled = true

    this.setModel()
    this.setSounds()
    this.setPhysics()
    this.setAnimation()
  }

  setModel() {
    this.model = this.resources.items.robotModel.scene
    this.model.scale.set(0.3, 0.3, 0.3)
    this.model.position.set(0, -0.1, 0)

    this.group = new THREE.Group()
    this.group.add(this.model)
    this.scene.add(this.group)

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
      }
    })
  }

  setPhysics() {
    // esfera estable para caminar
    const shape = new CANNON.Sphere(0.4)

    this.body = new CANNON.Body({
      mass: 2,
      shape,
      position: new CANNON.Vec3(0, 1.2, 0),
      linearDamping: 0.05,
      angularDamping: 0.9
    })

    this.body.angularFactor.set(0, 1, 0)
    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.body.sleep()
    this.body.material = this.physics.robotMaterial

    this.physics.world.addBody(this.body)

    // wake up suavemente
    setTimeout(() => {
      try { this.body?.wakeUp() } catch {}
    }, 100)
  }

  setSounds() {
    this.walkSound = new Sound('/sounds/robot/walking.mp3', { loop: true, volume: 0.5 })
    this.jumpSound = new Sound('/sounds/robot/jump.mp3', { volume: 0.8 })
  }

  setAnimation() {
    this.animation = {}
    this.animation.mixer = new THREE.AnimationMixer(this.model)

    this.animation.actions = {}
    this.animation.actions.dance = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[0])
    this.animation.actions.death = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[1])
    this.animation.actions.idle = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[2])
    this.animation.actions.jump = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[3])
    this.animation.actions.walking = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[10])

    this.animation.actions.current = this.animation.actions.idle
    this.animation.actions.current.play()

    this.animation.actions.jump.setLoop(THREE.LoopOnce)
    this.animation.actions.jump.clampWhenFinished = true
    this.animation.actions.jump.onFinished = () => {
      this.animation.play('idle')
    }

    this.animation.play = (name) => {
      const newAction = this.animation.actions[name]
      const oldAction = this.animation.actions.current
      newAction.reset()
      newAction.play()
      newAction.crossFadeFrom(oldAction, 0.3)
      this.animation.actions.current = newAction

      if (name === 'walking') this.walkSound.play()
      else this.walkSound.stop()

      if (name === 'jump') this.jumpSound.play()
    }
  }

  // helper para reconstruir físicas si fue eliminado el body
  _ensurePhysics() {
    if (!this.body) this.setPhysics()
  }

  update() {
    const delta = this.time.delta * 0.001
    this.animation.mixer.update(delta)

    // si está muerto, no procesa input ni movimiento (pero deja anim mixer)
    if (this.isDead || !this.controlsEnabled || !this.body) {
      // Sincronizar visual con última posición si hubiera (por seguridad)
      if (this.body) this.group.position.copy(this.body.position)
      return
    }

    const keys = this.keyboard.getState()
    const moveForce = 80
    const turnSpeed = 2.5
    let isMoving = false

    // Limitar velocidad máxima (suave)
    const maxSpeed = 15
    this.body.velocity.x = Math.max(Math.min(this.body.velocity.x, maxSpeed), -maxSpeed)
    this.body.velocity.z = Math.max(Math.min(this.body.velocity.z, maxSpeed), -maxSpeed)

    // vector de avance según rotación actual
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)

    // Salto con anti "volar" (solo si está casi en el piso)
    const onGround = this.body.position.y <= 0.51 && Math.abs(this.body.velocity.y) < 0.05
    if (keys.space && onGround) {
      this.body.applyImpulse(new CANNON.Vec3(forward.x * 0.5, 3.4, forward.z * 0.5))
      this.animation.play('jump')
      // no return; dejamos que siga leyendo movimiento
    }

    // Recolocar si cae fuera
    if (this.body.position.y > 10) {
      console.warn(' Robot fuera del escenario. Reubicando…')
      this.body.position.set(0, 1.2, 0)
      this.body.velocity.set(0, 0, 0)
    }

    // Movimiento hacia adelante
    if (keys.up) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
      this.body.applyForce(new CANNON.Vec3(fwd.x * moveForce, 0, fwd.z * moveForce), this.body.position)
      isMoving = true
    }

    // Movimiento hacia atrás
    if (keys.down) {
      const bwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion)
      this.body.applyForce(new CANNON.Vec3(bwd.x * moveForce, 0, bwd.z * moveForce), this.body.position)
      isMoving = true
    }

    // Rotación en Y
    if (keys.left) {
      this.group.rotation.y += turnSpeed * delta
      this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
    }
    if (keys.right) {
      this.group.rotation.y -= turnSpeed * delta
      this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
    }

    // Animación
    if (isMoving) {
      if (this.animation.actions.current !== this.animation.actions.walking) {
        this.animation.play('walking')
      }
    } else {
      if (this.animation.actions.current !== this.animation.actions.idle) {
        this.animation.play('idle')
      }
    }

    // Sincronización física → visual
    this.group.position.copy(this.body.position)
  }

  // Movimiento externo para VR
  moveInDirection(dir, speed) {
    if (!window.userInteracted || !this.experience.renderer.instance.xr.isPresenting) return

    const mobile = window.experience?.mobileControls
    if (mobile?.intensity > 0) {
      const dir2D = mobile.directionVector
      const dir3D = new THREE.Vector3(dir2D.x, 0, dir2D.y).normalize()

      const adjustedSpeed = 250 * mobile.intensity
      const force = new CANNON.Vec3(dir3D.x * adjustedSpeed, 0, dir3D.z * adjustedSpeed)

      this._ensurePhysics()
      this.body.applyForce(force, this.body.position)

      if (this.animation.actions.current !== this.animation.actions.walking) {
        this.animation.play('walking')
      }

      const angle = Math.atan2(dir3D.x, dir3D.z)
      this.group.rotation.y = angle
      this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
    }
  }

  // Muerte controlada
  die() {
    if (this.isDead) return
    this.isDead = true
    this.controlsEnabled = false

    // Animación de muerte (si existe)
    if (this.animation?.actions?.death && this.animation.actions.current !== this.animation.actions.death) {
      this.animation.actions.current.fadeOut(0.2)
      this.animation.actions.death.reset().fadeIn(0.2).play()
      this.animation.actions.current = this.animation.actions.death
    }
    this.walkSound.stop()

    // Quitar cuerpo del mundo para evitar colisiones residuales
    if (this.body && this.physics.world.bodies.includes(this.body)) {
      this.physics.world.removeBody(this.body)
    }
    this.body = null // permite reconstruir luego en revive()

    // Feedback visual opcional
    this.group.position.y = Math.max(0, this.group.position.y - 0.5)
    this.group.rotation.x = -Math.PI / 2

    console.log('💥 Robot ha muerto')
  }

  // Revivir para nuevo intento
  revive() {
    // reconstruye físicas si no existen
    this._ensurePhysics()

    // reset flags
    this.isDead = false
    this.controlsEnabled = true

    // reset velocidades y rotación
    if (this.body) {
      this.body.velocity.set(0, 0, 0)
      this.body.angularVelocity.set(0, 0, 0)
      this.body.quaternion.setFromEuler(0, 0, 0)
      try { this.body.wakeUp() } catch {}
    }
    if (this.group) {
      this.group.rotation.set(0, 0, 0)
    }

    // volver a idle
    if (this.animation?.actions?.idle) {
      this.animation.actions.current?.stop?.()
      this.animation.actions.idle.reset().fadeIn(0.2).play()
      this.animation.actions.current = this.animation.actions.idle
    }

    console.log('✅ Robot revivido')
  }
}
