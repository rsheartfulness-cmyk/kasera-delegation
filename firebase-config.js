// Firebase web configuration. Paste the configuration object from Firebase Console here.
// Leave the values blank to use this application in local-browser mode while testing.
export const firebaseConfig = {
  apiKey: "AIzaSyASrZ6TarUz_bPj3lXNfEoNwHYawXtNXHk",
  authDomain: "kasera-lead-tracker.firebaseapp.com",
  projectId: "kasera-lead-tracker",
  storageBucket: "kasera-lead-tracker.firebasestorage.app",
  messagingSenderId: "933789206173",
  appId: "1:933789206173:web:81220a0547b7ee8891f674",
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

// Keep this region identical to the Cloud Functions region in functions/index.js.
export const firebaseFunctionsRegion = "asia-south1";
