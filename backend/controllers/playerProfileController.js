// Backend/controllers/playerProfileController.js
const PlayerProfile = require('../models/PlayerProfile');

// GET /api/profile/me
async function getMyProfile(req, res) {
  try {
    const profile = await PlayerProfile.findOne({ user: req.user.id }).populate(
      'user',
      'username email role'
    );

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    res.json(profile);
  } catch (error) {
    console.error('getMyProfile error:', error);
    res.status(500).json({ message: 'Error al obtener perfil', error });
  }
}

// PUT /api/profile/progress
async function updateProgress(req, res) {
  try {
    const { level, timeSeconds, coinsCollected } = req.body;

    if (!level) {
      return res
        .status(400)
        .json({ message: 'level es obligatorio para actualizar progreso' });
    }

    const profile = await PlayerProfile.findOne({ user: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }

    // Nivel actual y niveles desbloqueados
    if (level > profile.currentLevel) {
      profile.currentLevel = level;
    }
    if (!profile.unlockedLevels.includes(level)) {
      profile.unlockedLevels.push(level);
    }

    // Monedas acumuladas
    if (typeof coinsCollected === 'number' && !isNaN(coinsCollected)) {
      profile.totalCoins += coinsCollected;
    }

    // Mejor tiempo del nivel
    if (typeof timeSeconds === 'number' && !isNaN(timeSeconds)) {
      const existing = profile.bestTimes.find((t) => t.level === level);
      if (!existing || timeSeconds < existing.timeSeconds) {
        if (existing) {
          existing.timeSeconds = timeSeconds;
        } else {
          profile.bestTimes.push({ level, timeSeconds });
        }
      }
    }

    await profile.save();

    res.json({ message: 'Progreso actualizado', profile });
  } catch (error) {
    console.error('updateProgress error:', error);
    res.status(500).json({ message: 'Error al actualizar progreso', error });
  }
}

module.exports = {
  getMyProfile,
  updateProgress,
};
