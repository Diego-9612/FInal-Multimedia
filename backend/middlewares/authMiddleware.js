// Backend/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const token = header.split(' ')[1];

    const payload = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    req.user = {
      id: user._id,
      username: user.username,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res
      .status(401)
      .json({ message: 'Token inválido o expirado', error: error.message });
  }
}

module.exports = {
  requireAuth,
};
