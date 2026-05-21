// Firebase configuration and initialization module
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Default configuration (placeholder for users to override in index.html)
const defaultFirebaseConfig = {
    apiKey: "AIzaSyDaPRf3I-FvfBn-K0gVc9rHFmHy2DPCFKQ",
    authDomain: "voxel-panzer.firebaseapp.com",
    databaseURL: "https://voxel-panzer-default-rtdb.firebaseio.com",
    projectId: "voxel-panzer",
    storageBucket: "voxel-panzer.firebasestorage.app",
    messagingSenderId: "248616792045",
    appId: "1:248616792045:web:587ee8315374b2f1e501e4"
};

const config = window.FIREBASE_CONFIG || defaultFirebaseConfig;

let app;
let auth;
let db;
let isPlaceholder = true;

try {
    if (config.apiKey && !config.apiKey.includes("DummyKey")) {
        isPlaceholder = false;
    }
    app = initializeApp(config);
    auth = getAuth(app);
    db = getDatabase(app);
    console.log("Firebase initialized successfully. Project:", config.projectId, "IsPlaceholder:", isPlaceholder);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

export { app, auth, db, isPlaceholder };
