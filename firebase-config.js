// Konfigurasi publik Firebase, bukan kredensial server.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC6ea0-3QFnFR3ZUfv4fKYSIX4vTD-ZCwA",
  authDomain: "kubah-admin-app.firebaseapp.com",
  projectId: "kubah-admin-app",
  storageBucket: "kubah-admin-app.firebasestorage.app",
  messagingSenderId: "477747088600",
  appId: "1:477747088600:web:9d6d6e6e3fc56bfbab9bad"
};
// Localhost ALWAYS uses the demo emulator project. Never writes to production from local tests.
window.KUBAH_EMULATOR = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
if (window.KUBAH_EMULATOR) window.FIREBASE_CONFIG = {
  apiKey:'demo-api-key', projectId:'demo-kubah-nabawi', authDomain:'demo-kubah-nabawi.firebaseapp.com',
  storageBucket:'demo-kubah-nabawi.appspot.com', appId:'demo-app-id'
};

// Versi ini memakai Auth + Firestore; tidak memanggil Cloud Functions/Storage.

window.KUBAH_NO_BLAZE=true;
window.KUBAH_RELEASE='manual-20260908-1';
