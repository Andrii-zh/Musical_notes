const mongoose = require('mongoose');

// Схема для вокальної доріжки
const vocalTrackSchema = new mongoose.Schema({
  trackIndex: {
    type: Number,
    required: true,
  },
  filePath: {
    type: String,
    default: null,
  },
  volume: {
    type: Number,
    default: 1,
    min: 0,
    max: 1,
  },
});

// Схема проекту
const projectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Будь ласка, вкажіть назву проекту'],
    trim: true,
  },
  lyrics: {
    type: String,
    default: '',
  },
  instrumentalPath: {
    type: String,
    default: null,
  },
  instrumentalVolume: {
    type: Number,
    default: 1,
    min: 0,
    max: 1,
  },
  vocalTracks: [vocalTrackSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Оновлення updatedAt перед збереженням
projectSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);
