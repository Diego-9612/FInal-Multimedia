// Backend/routes/profileRoutes.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/playerProfileController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Perfil del usuario logueado
router.get('/me', requireAuth, profileController.getMyProfile);

// Actualizar progreso (nivel, monedas, tiempo)
router.put('/progress', requireAuth, profileController.updateProgress);

module.exports = router;
