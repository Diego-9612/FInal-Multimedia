export default class LevelManager {
  constructor(experience) {
    this.experience = experience;
    this.currentLevel = 1;   // Inicias en el nivel 1
    this.totalLevels = 3;    // ⬅️ ahora hay 3 niveles

    // 🎯 metas por nivel
    this.pointsToComplete = {
      1: 3,  // 3 monedas abren portal a L2
      2: 5,  // 5 monedas abren portal a L3
      3: 6,  // 6 monedas => fin del juego (sin portal)
    };
  }

  nextLevel() {
    if (this.currentLevel < this.totalLevels) {
      this.currentLevel++;

      // Limpia escena del nivel anterior y carga el nuevo
      this.experience.world.clearCurrentScene();
      this.experience.world.loadLevel(this.currentLevel);

      // Reubicar tras corto delay (ajusta si quieres spawns por-nivel)
      setTimeout(() => {
        this.experience.world.resetRobotPosition({ x: -17, y: 1.5, z: -67 });
      }, 800);
    }
  }

  resetLevel() {
    this.currentLevel = 1;
    this.experience.world.loadLevel(this.currentLevel);
  }

  getCurrentLevelTargetPoints() {
    return this.pointsToComplete?.[this.currentLevel] ?? 3;
  }
}
