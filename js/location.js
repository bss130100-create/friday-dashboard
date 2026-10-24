// Ask the browser for the user's position. Rejects with a readable error.

const ERRORS = {
  1: 'Location permission denied. Allow location for this site and reload.',
  2: 'Location unavailable (no GPS/Wi-Fi fix).',
  3: 'Location request timed out.',
};

// precise: ask for the GPS chip (phones) and a fresh fix; otherwise a cheap, cached position is enough.
export function getLocation({ precise = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser has no geolocation support.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(ERRORS[err.code] ?? err.message)),
      precise
        ? { enableHighAccuracy: true, timeout: 30000, maximumAge: 60 * 1000 }
        : { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
