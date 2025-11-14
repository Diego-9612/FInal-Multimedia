// Experience/Utils/Physics.js
import * as CANNON from 'cannon-es'

export default class Physics {
  constructor() {
    this.world = new CANNON.World()
    this.world.gravity.set(0, -9.82, 0)

    // Solver más estable
    const solver = new CANNON.GSSolver()
    solver.iterations = 12          // más iteraciones = contactos más estables
    solver.tolerance = 1e-3
    this.world.solver = solver
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)

    // Sleep para quietud (menos jitter)
    this.world.allowSleep = true
    this.world.defaultContactMaterial.contactEquationStiffness = 1e6
    this.world.defaultContactMaterial.contactEquationRelaxation = 4

    // Materiales
    this.defaultMaterial = new CANNON.Material('default')
    const defaultContact = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.6,
        restitution: 0.0,
        contactEquationStiffness: 1e6,
        contactEquationRelaxation: 4,
        frictionEquationStiffness: 1e5,
        frictionEquationRelaxation: 3
      }
    )
    this.world.defaultContactMaterial = defaultContact
    this.world.addContactMaterial(defaultContact)

    this.robotMaterial = new CANNON.Material('robot')
    this.obstacleMaterial = new CANNON.Material('obstacle')
    this.wallMaterial = new CANNON.Material('wall')

    const robotObstacleContact = new CANNON.ContactMaterial(
      this.robotMaterial,
      this.obstacleMaterial,
      {
        friction: 0.8,                 // más adherencia
        restitution: 0.0,              // sin rebote
        contactEquationStiffness: 8e5, // menos “explosivo”
        contactEquationRelaxation: 5,
        frictionEquationStiffness: 1e5,
        frictionEquationRelaxation: 3
      }
    )
    this.world.addContactMaterial(robotObstacleContact)

    const robotWallContact = new CANNON.ContactMaterial(
      this.robotMaterial,
      this.wallMaterial,
      {
        friction: 0.8,
        restitution: 0.0,
        contactEquationStiffness: 8e5,
        contactEquationRelaxation: 5,
        frictionEquationStiffness: 1e5,
        frictionEquationRelaxation: 3
      }
    )
    this.world.addContactMaterial(robotWallContact)
  }

  update(delta) {
    // Filtrar cuerpos corruptos
    this.world.bodies = this.world.bodies.filter(body => {
      if (!body || !Array.isArray(body.shapes) || body.shapes.length === 0) return false
      for (const shape of body.shapes) {
        if (!shape || !shape.body || shape.body !== body) return false
      }
      return true
    })

    try {
      // substeps pequeños para estabilidad
      this.world.step(1 / 60, delta, 4)
    } catch (err) {
      if (err?.message?.includes('wakeUpAfterNarrowphase')) {
        console.warn('⚠️ Cannon encontró un shape corrupto residual. Ignorado.')
      } else {
        console.error('🚫 Cannon step error:', err)
      }
    }
  }
}
