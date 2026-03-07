import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};

const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7YthwCWRynOV1k8s5U1_fVojBYIVHVEFIRxce1jg0NaytyH06QqR3AUD3n8aM4_c/exec";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// State Management
let currentSite = null;
let currentPlant = null;
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];

// --- 2. CORE UTILITIES ---

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
    
    // Update Sync button visibility
    document.getElementById('btn-sync').style.display = offlineQueue.length > 0 ? 'inline-block' : 'none';
}

async function callGoogleScript(action, payload = {}) {
    try {
        const response = await fetch(GOOGLE_APP_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: "follow",
            body: JSON.stringify({ action, payload })
        });
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        return { status: 'error' };
    }
}

// --- 3. AUTHENTICATION ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('btn-logout').style.display = 'inline-block';
        showView('view-sites');
        loadExistingSites();
    } else {
        document.getElementById('btn-logout').style.display = 'none';
        showView('view-login');
    }
});

document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert("Login Failed: " + err.message));
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// --- 4. PAGE 1: SITES ---

async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li>Loading...</li>';
    
    if (navigator.onLine) {
        const res = await callGoogleScript('getSites');
        list.innerHTML = '';
        if (res.status === 'success' && res.data) {
            res.data.forEach(site => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
                li.onclick = () => {
                    currentSite = site.name;
                    showView('view-plants');
                    // In a full version, you'd load plants for this site here
                };
                list.appendChild(li);
            });
        }
    } else {
        list.innerHTML = '<li>Offline - Connect to load sites</li>';
    }
}

document.getElementById('btn-create-site').addEventListener('click', async () => {
    const name = document.getElementById('site-name').value;
    const city = document.getElementById('site-city').value;
    if (!name || !city) return alert("Fill fields");

    const data = { siteName: name, siteCity: city };
    if (navigator.onLine) {
        await callGoogleScript('createSite', data);
        loadExistingSites();
    } else {
        addToOfflineQueue('createSite', data);
    }
});

// --- 5. PAGE 2: PLANTS ---

document.getElementById('btn-add-plant').addEventListener('click', () => {
    const name = document.getElementById('plant-name').value;
    const desc = document.getElementById('plant-desc').value;
    if (!name) return alert("Plant name required");

    // Add to UI Gallery immediately (Optimistic UI)
    const gallery = document.getElementById('plant-gallery');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h4>${name}</h4><p>${desc}</p>`;
    card.onclick = () => {
        currentPlant = name;
        showView('view-assets');
    };
    gallery.appendChild(card);
    
    // Save Data
    const payload = { site: currentSite, plantName: name, desc: desc };
    if (navigator.onLine) {
        callGoogleScript('addPlant', payload);
    } else {
        addToOfflineQueue('addPlant', payload);
    }
});

// --- 6. PAGE 3: ASSETS & GPS ---

document.getElementById('btn-get-gps').addEventListener('click', () => {
    const status = document.getElementById('gps-coords');
    status.innerText = "Locating...";
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            status.innerText = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
            status.dataset.lat = pos.coords.latitude;
            status.dataset.lng = pos.coords.longitude;
        },
        () => { status.innerText = "GPS Failed"; }
    );
});

document.getElementById('btn-save-asset').addEventListener('click', async () => {
    const photoFile = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;
    
    let photoBase64 = "";
    if (photoFile) {
        photoBase64 = await toBase64(photoFile);
    }

    const assetData = {
        site: currentSite,
        plant: currentPlant,
        lat: gps.lat || "",
        lng: gps.lng || "",
        image: photoBase64,
        timestamp: new Date().toISOString()
    };

    if (navigator.onLine) {
        await callGoogleScript('addAsset', assetData);
        alert("Asset Saved!");
    } else {
        addToOfflineQueue('addAsset', assetData);
    }
});

// --- 7. OFFLINE SYNC ENGINE ---

function addToOfflineQueue(action, payload) {
    offlineQueue.push({ action, payload });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    document.getElementById('btn-sync').style.display = 'inline-block';
    alert("Saved offline. Sync when online.");
}

document.getElementById('btn-sync').addEventListener('click', async () => {
    if (!navigator.onLine) return alert("Still offline!");
    const btn = document.getElementById('btn-sync');
    btn.innerText = "Syncing...";

    while (offlineQueue.length > 0) {
        const item = offlineQueue[0];
        const res = await callGoogleScript(item.action, item.payload);
        if (res.status === 'success') {
            offlineQueue.shift();
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        } else {
            alert("Sync interrupted.");
            break;
        }
    }
    
    btn.innerText = "Sync Offline Data";
    btn.style.display = offlineQueue.length > 0 ? 'inline-block' : 'none';
});

// Helper: Convert File to Base64 for Google Drive upload
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

// Navigation Back Buttons
document.getElementById('btn-back-sites').onclick = () => showView('view-sites');
document.getElementById('btn-back-plants').onclick = () => showView('view-plants');
