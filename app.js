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

// Global State
let selectedSite = { name: "", city: "" };
let selectedPlant = "";
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];
let allAssets = []; // Local cache for search functionality

// --- 2. CORE UTILITIES ---

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
    
    // Toggle Sync button visibility based on queue
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

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

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
    if (!email || !pass) return alert("Enter credentials");
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert("Login Failed: " + err.message));
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// --- 4. PAGE 1: SITES ---

async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li class="loading">Loading Sites...</li>';
    
    if (navigator.onLine) {
        const res = await callGoogleScript('getSites');
        list.innerHTML = '';
        if (res.status === 'success' && res.data) {
            res.data.forEach(site => {
                const li = document.createElement('li');
                li.className = 'site-item';
                li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
                li.onclick = () => {
                    selectedSite = { name: site.name, city: site.city };
                    document.getElementById('current-site-title').innerText = "Site: " + site.name;
                    showView('view-plants');
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
    if (!name || !city) return alert("Site Name and City required");

    const payload = { siteName: name, siteCity: city };
    if (navigator.onLine) {
        await callGoogleScript('createSite', payload);
        loadExistingSites();
    } else {
        addToOfflineQueue('createSite', payload);
    }
    document.getElementById('site-name').value = '';
    document.getElementById('site-city').value = '';
});

// --- 5. PAGE 2: PLANTS ---

document.getElementById('btn-add-plant').addEventListener('click', () => {
    const name = document.getElementById('plant-name').value;
    const desc = document.getElementById('plant-desc').value;
    if (!name) return alert("Plant name required");

    const gallery = document.getElementById('plant-gallery');
    const card = document.createElement('div');
    card.className = 'plant-card';
    card.innerHTML = `<h4>${name}</h4><p>${desc}</p>`;
    card.onclick = () => {
        selectedPlant = name;
        document.getElementById('asset-page-title').innerText = "Plant: " + name;
        showView('view-assets');
        renderAssetGallery(); // Reset gallery for this plant
    };
    gallery.appendChild(card);
    
    document.getElementById('plant-name').value = '';
    document.getElementById('plant-desc').value = '';
});

// --- 6. PAGE 3: ASSETS (5 Fields + Photo + GPS) ---

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
    const btn = document.getElementById('btn-save-asset');
    const photoFile = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;

    const assetPayload = {
        siteName: selectedSite.name,
        siteCity: selectedSite.city,
        plantName: selectedPlant,
        assetName: document.getElementById('asset-name').value,
        model: document.getElementById('asset-model').value,
        condition: document.getElementById('asset-condition').value,
        tag: document.getElementById('asset-tag').value,
        notes: document.getElementById('asset-notes').value,
        lat: gps.lat || "",
        lng: gps.lng || "",
        image: photoFile ? await toBase64(photoFile) : null,
        timestamp: new Date().toISOString()
    };

    if (!assetPayload.assetName) return alert("Asset Name is required");

    btn.innerText = "Saving...";
    if (navigator.onLine) {
        const res = await callGoogleScript('addAsset', assetPayload);
        if (res.status === 'success') alert("Asset Saved to Cloud!");
    } else {
        addToOfflineQueue('addAsset', assetPayload);
    }

    allAssets.push(assetPayload);
    renderAssetGallery();
    clearAssetForm();
    btn.innerText = "Save Asset";
});

function clearAssetForm() {
    ['asset-name', 'asset-model', 'asset-condition', 'asset-tag', 'asset-notes'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('asset-photo').value = '';
    document.getElementById('gps-coords').innerText = "No GPS Data";
}

// Asset Search Logic
document.getElementById('search-assets').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    renderAssetGallery(term);
});

function renderAssetGallery(filter = "") {
    const gallery = document.getElementById('asset-gallery');
    gallery.innerHTML = '';
    
    const filtered = allAssets.filter(a => 
        a.plantName === selectedPlant && 
        (a.assetName.toLowerCase().includes(filter) || a.tag.toLowerCase().includes(filter))
    );

    filtered.forEach((asset, index) => {
        const div = document.createElement('div');
        div.className = 'asset-list-item';
        div.innerHTML = `
            <div class="info">
                <strong>${asset.assetName}</strong><br>
                <small>${asset.tag} | ${asset.condition}</small>
            </div>
            <div class="actions">
                <button class="delete-btn" data-index="${index}">Delete</button>
            </div>
        `;
        gallery.prepend(div);
    });
}

// --- 7. OFFLINE SYNC ENGINE ---

function addToOfflineQueue(action, payload) {
    offlineQueue.push({ action, payload });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    document.getElementById('btn-sync').style.display = 'inline-block';
}

document.getElementById('btn-sync').addEventListener('click', async () => {
    if (!navigator.onLine) return alert("Still offline!");
    const btn = document.getElementById('btn-sync');
    btn.innerText = "Syncing...";

    while (offlineQueue.length > 0) {
        const item = offlineQueue[0];
        try {
            const res = await callGoogleScript(item.action, item.payload);
            if (res.status === 'success') {
                offlineQueue.shift();
                localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
            } else {
                break;
            }
        } catch (e) { break; }
    }
    
    btn.innerText = "Sync Offline Data";
    btn.style.display = offlineQueue.length > 0 ? 'inline-block' : 'none';
    if(offlineQueue.length === 0) alert("All data synchronized!");
});

// Navigation Back Buttons
document.getElementById('btn-back-sites').onclick = () => showView('view-sites');
document.getElementById('btn-back-plants').onclick = () => showView('view-plants');
