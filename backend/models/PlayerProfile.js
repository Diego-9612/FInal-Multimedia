// Backend/models/PlayerProfile.js
const mongoose = require('mongoose');

const bestTimeSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true },
    timeSeconds: { type: Number, required: true },
  },
  { _id: false }
);

const playerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },

    currentLevel: { type: Number, default: 1 },
    unlockedLevels: { type: [Number], default: [1] },

    totalCoins: { type: Number, default: 0 },

    bestTimes: {
      type: [bestTimeSchema],
      default: [],
    },

    settings: {
      cameraMode: { type: String, default: 'third_person' },
      volume: { type: Number, default: 1 },
      // aquí puedes agregar más ajustes
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlayerProfile', playerProfileSchema);
