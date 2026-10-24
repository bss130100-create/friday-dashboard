// Ask the browser for the user's position. Rejects with a readable error.

const ERRORS = {
  1: 'Location permission denied. Allow location for this site and reload.',
  2: 'Location unavailable (no GPS/Wi-Fi fix).',
  3: 'Location request timed out.',
};

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser has no geolocation support.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(ERRORS[err.code] ?? err.message)),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
