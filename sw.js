const CACHE_NAME = 'meal-ghpwa-v6';

// Scope ist bei GitHub Pages automatisch: https://tejari49.github.io/Meal/
const APP_SCOPE = self.registration.scope; // endet mit /
const APP_URL = APP_SCOPE;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
