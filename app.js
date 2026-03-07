import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 1. Configs
const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const GOOGLE_APP_SCRIPT_URL = "YOUR_GOOGLE_WEB_APP_URL"; // Paste the URL from Phase 1

// 2. Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// 3. UI Navigation Logic
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
}

// 4. Auth State Observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('btn-logout').style.display = 'inline-block';
        showView('view-sites');
    } else {
        document.getElementById('btn-logout').style.display = 'none';
        showView('view-login');
    }
});

// Login Execution
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// 5. Offline Queue System
// Saves requests locally if offline. Syncs them when online.
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];

function saveOffline(action, payload) {
    offlineQueue.push({ action, payload, timestamp: Date.now() });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    document.getElementById('btn-sync').style.display = 'inline-block';
    alert("Saved offline. Will sync when connection is restored.");
}

async function syncQueue() {
    if (!navigator.onLine) return alert("Still offline.");
    
    while(offlineQueue.length > 0) {
        let task = offlineQueue[0];
        try {
            await fetch(GOOGLE_APP_SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify(task)
            });
            offlineQueue.shift(); // Remove from queue on success
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        } catch(e) {
            console.error("Sync failed", e);
            break; // Stop if sync fails
        }
    }
    if(offlineQueue.length === 0) document.getElementById('btn-sync').style.display = 'none';
}
document.getElementById('btn-sync').addEventListener('click', syncQueue);

// 6. Page 1: Create Site
document.getElementById('btn-create-site').addEventListener('click', async () => {
    const data = {
        siteName: document.getElementById('site-name').value,
        siteCity: document.getElementById('site-city').value
    };
    
    if (navigator.onLine) {
        await fetch(GOOGLE_APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'createSite', payload: data })
        });
        alert('Site Created!');
    } else {
        saveOffline('createSite', data);
    }
    // Transition to Plants view
    showView('view-plants');
});

// 7. Page 3: GPS Functionality Example
document.getElementById('btn-get-gps').addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            document.getElementById('gps-coords').innerText = 
                `Lat: ${position.coords.latitude}, Lng: ${position.coords.longitude}`;
        }, () => alert("Could not get GPS"));
    }
});

// Basic Navigation bindings
document.getElementById('btn-back-sites').addEventListener('click', () => showView('view-sites'));
document.getElementById('btn-add-plant').addEventListener('click', () => showView('view-assets'));
document.getElementById('btn-back-plants').addEventListener('click', () => showView('view-plants'));
