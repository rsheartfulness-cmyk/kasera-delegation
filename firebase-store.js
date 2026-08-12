import { firebaseConfig, firebaseReady } from "./firebase-config.js?v=20260812";

const LOCAL_DB_NAME = "kasera-lead-tracker";
const LOCAL_DB_VERSION = 1;
const STORE_NAMES = ["leads", "messages", "imports"];
const FIREBASE_SDK_VERSION = "12.16.0";

let firebase = null;

if (firebaseReady) {
  const cdnBase = "https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/";
  const [{ initializeApp }, authSdk, firestoreSdk, functionsSdk] = await Promise.all([
    import(cdnBase + "firebase-app.js"),
    import(cdnBase + "firebase-auth.js"),
    import(cdnBase + "firebase-firestore.js"),
    import(cdnBase + "firebase-functions.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  firebase = {
    auth: authSdk.getAuth(app),
    db: firestoreSdk.getFirestore(app),
    functions: functionsSdk.getFunctions(app, "asia-south1"),
    sdk: firestoreSdk,
    authSdk,
    functionsSdk,
  };
}

export const persistenceMode = firebase ? "firebase" : "local";

export function documentKey(value) {
  return encodeURIComponent(String(value || "").trim());
}

export function currentUser() {
  return firebase?.auth.currentUser || null;
}

export function observeSession(callback) {
  if (!firebase) {
    callback(null);
    return () => {};
  }
  return firebase.authSdk.onAuthStateChanged(firebase.auth, callback);
}

export async function signIn(email, password) {
  if (!firebase) throw new Error("Firebase is not configured yet.");
  return firebase.authSdk.signInWithEmailAndPassword(firebase.auth, email, password);
}

export async function signOutUser() {
  if (!firebase) return;
  await firebase.authSdk.signOut(firebase.auth);
}

export async function loadSavedData() {
  if (firebase) {
    if (!firebase.auth.currentUser) throw new Error("Please sign in before loading saved data.");
    const profile = await loadProfile(firebase.auth.currentUser.uid);
    const isAdmin = profile.role === "admin";
    const [leads, messages, importSnapshot, userSnapshot] = await Promise.all([
      loadRoleFilteredDocuments("leads", profile, isAdmin),
      loadRoleFilteredDocuments("messages", profile, isAdmin),
      isAdmin
        ? firebase.sdk.getDocs(firebase.sdk.collection(firebase.db, "imports"))
        : firebase.sdk.getDocs(firebase.sdk.query(
          firebase.sdk.collection(firebase.db, "imports"),
          firebase.sdk.where("uploadedByUid", "==", firebase.auth.currentUser.uid)
        )),
      isAdmin ? firebase.sdk.getDocs(firebase.sdk.collection(firebase.db, "users")) : Promise.resolve(null),
    ]);
    return {
      leads,
      messages,
      imports: importSnapshot.docs.map(item => item.data()),
      users: userSnapshot ? userSnapshot.docs.map(item => item.data()) : [],
      profile,
    };
  }
  const local = await readLocalData();
  return {
    ...local,
    users: [],
    profile: { role: "admin", displayName: "Local Admin", odooUserIds: [] },
  };
}

export async function saveImportedData(payload) {
  if (firebase) return saveFirebaseData(payload);
  return saveLocalData(payload);
}

export async function createEmployeeAccount(payload) {
  if (!firebase) throw new Error("Firebase is not configured yet.");
  if (!firebase.auth.currentUser) throw new Error("Please sign in before creating a user.");
  const callable = firebase.functionsSdk.httpsCallable(firebase.functions, "createEmployeeAccount");
  const result = await callable(payload);
  return result.data;
}

export async function activateInitialAdmin() {
  if (!firebase) throw new Error("Firebase is not configured yet.");
  if (!firebase.auth.currentUser) throw new Error("Sign in before activating the administrator account.");
  const callable = firebase.functionsSdk.httpsCallable(firebase.functions, "activateInitialAdmin");
  const result = await callable();
  return result.data;
}

async function saveFirebaseData({ leads, newMessages, importRecord }) {
  if (!firebase.auth.currentUser) throw new Error("Please sign in before saving an import.");
  const callable = firebase.functionsSdk.httpsCallable(firebase.functions, "processOdooImport");
  const result = await callable({ leads, newMessages, importRecord });
  return { mode: "firebase", ...(result.data || {}) };
}

async function loadProfile(uid) {
  const snapshot = await firebase.sdk.getDoc(firebase.sdk.doc(firebase.db, "users", uid));
  if (!snapshot.exists()) {
    throw new Error("This login has no tracker profile. Ask the admin to create or activate your user profile.");
  }
  return { ...snapshot.data(), uid };
}

async function loadRoleFilteredDocuments(collectionName, profile, isAdmin) {
  const collectionRef = firebase.sdk.collection(firebase.db, collectionName);
  if (isAdmin) {
    const snapshot = await firebase.sdk.getDocs(collectionRef);
    return snapshot.docs.map(item => item.data());
  }
  const odooUserIds = Array.isArray(profile.odooUserIds) ? profile.odooUserIds.filter(Boolean) : [];
  if (!odooUserIds.length) return [];
  const snapshots = await Promise.all(odooUserIds.slice(0, 30).map(odooUserId =>
    firebase.sdk.getDocs(firebase.sdk.query(
      collectionRef,
      firebase.sdk.where("ownerOdooIds", "array-contains", odooUserId)
    ))
  ));
  const records = new Map();
  snapshots.flatMap(snapshot => snapshot.docs).forEach(item => {
    const data = item.data();
    const key = collectionName === "leads" ? data.sourceLeadId : data.sourceMessageId;
    records.set(key, data);
  });
  return Array.from(records.values());
}

function openLocalDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      STORE_NAMES.forEach(name => {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local storage."));
  });
}

async function readLocalData() {
  const database = await openLocalDatabase();
  try {
    const result = {};
    for (const storeName of STORE_NAMES) {
      result[storeName] = await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error(`Could not read ${storeName}.`));
      });
    }
    return result;
  } finally {
    database.close();
  }
}

async function saveLocalData({ leads, newMessages, importRecord }) {
  const database = await openLocalDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAMES, "readwrite");
      leads.forEach(lead => transaction.objectStore("leads").put({ ...lead, id: documentKey(lead.sourceLeadId) }));
      newMessages.forEach(message => transaction.objectStore("messages").put({ ...message, id: documentKey(message.sourceMessageId) }));
      transaction.objectStore("imports").put({ ...importRecord, id: documentKey(importRecord.id) });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save local data."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving local data was cancelled."));
    });
  } finally {
    database.close();
  }
  return { mode: "local" };
}
