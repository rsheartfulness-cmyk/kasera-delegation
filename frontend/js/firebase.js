import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1dc3sNuyJo9BK5JguaevvY5nSQdsSvZk",
  authDomain: "kasera-delegation.firebaseapp.com",
  projectId: "kasera-delegation",
  storageBucket: "kasera-delegation.firebasestorage.app",
  messagingSenderId: "117646348596",
  appId: "1:117646348596:web:07a7eaf7e1cdb32a0e5561"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

window.FB = {
  db, auth, storage, collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup,
  storageRef, uploadBytes, getDownloadURL, deleteObject
};

window.FB.createSecondaryUser = async function(email, password){
  const secApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  try{
    const secAuth = getAuth(secApp);
    await createUserWithEmailAndPassword(secAuth, email, password);
    try{ await signOut(secAuth); }catch(e){}
  } finally {
    try{ await deleteApp(secApp); }catch(e){}
  }
};

window.dispatchEvent(new Event('fb-ready'));
