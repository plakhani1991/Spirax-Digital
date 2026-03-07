import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/**
 * PWA FRONTEND LOGIC
 * Features: Firebase Auth, Offline Sync, GPS, Base64 Imaging, Search Filter.
 */

// --- 1. CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7YthwCWRynOV1k8s5U1_fVojBYIVHVEFIRxce1jg0NaytyH06QqR3AUD3n8aM4_c/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Global State
let currentSite = { name: "", city: "" };
let currentPlant = "";
let allAssets = JSON.parse(localStorage.getItem('allAssets')) || [];
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];

// --- 2. AUTHENTICATION & ROUTING ---

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

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    updateSyncUI();
}

document.getElementById('btn-login').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
};

document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- 3. PAGE 1: SITES ---

async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li>Loading Sites...</li>';
    try {
        const res = await callAPI('getSites');
        list.innerHTML = '';
        if (res.data) {
            res.data.forEach(site => {
                const li = document.createElement('li');
                li.className = 'site-card';
                li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
                li.onclick = () => {
                    currentSite = { name: site.name, city: site.city };
                    document.getElementById('current-site-title').innerText = "Site: " + site.name;
                    showView('view-plants');
                };
                list.appendChild(li);
            });
        }
    } catch (e) { list.innerHTML = '<li>Offline: Using cached data</li>'; }
}

document.getElementById('btn-create-site').onclick = async () => {
    const name = document.getElementById('site-name').value;
    const city = document.getElementById('site-city').value;
    if (!name || !city) return alert("Enter Site and City");

    const payload = { siteName: name, siteCity: city };
    if (navigator.onLine) {
        await callAPI('createSite', payload);
        loadExistingSites();
    } else {
        queueOffline('createSite', payload);
    }
    document.getElementById('site-name').value = '';
    document.getElementById('site-city').value = '';
};

// --- 4. PAGE 2: PLANTS ---

document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('plant-name').value;
    const desc = document.getElementById('plant-desc').value;
    if (!name) return alert("Plant Name required");

    const gallery = document.getElementById('plant-gallery');
    const div = document.createElement('div');
    div.className = 'plant-card';
    div.innerHTML = `<h3>${name}</h3><p>${desc}</p>`;
    div.onclick = () => {
        currentPlant = name;
        document.getElementById('asset-page-title').innerText = "Plant: " + name;
        showView('view-assets');
        renderAssetGallery();
    };
    gallery.appendChild(div);
    document.getElementById('plant-name').value = '';
    document.getElementById('plant-desc').value = '';
};

// --- 5. PAGE 3: ASSETS ---

document.getElementById('btn-get-gps').onclick = () => {
    const status = document.getElementById('gps-coords');
    status.innerText = "Locating...";
    navigator.geolocation.getCurrentPosition(p => {
        status.innerText = `Fixed: ${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`;
        status.dataset.lat = p.coords.latitude;
        status.dataset.lng = p.coords.longitude;
    }, () => status.innerText = "GPS Error");
};

document.getElementById('btn-save-asset').onclick = async () => {
    const btn = document.getElementById('btn-save-asset');
    const photo = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;

    const payload = {
        siteName: currentSite.name,
        siteCity: currentSite.city,
        plantName: currentPlant,
        assetName: document.getElementById('asset-name').value,
        model: document.getElementById('asset-model').value,
        condition: document.getElementById('asset-condition').value,
        tag: document.getElementById('asset-tag').value,
        notes: document.getElementById('asset-notes').value,
        lat: gps.lat || "",
        lng: gps.lng || "",
        image: photo ? await toBase64(photo) : null,
        timestamp: new Date().toISOString()
    };

    if (!payload.assetName) return alert("Name required");

    btn.innerText = "Saving...";
    if (navigator.onLine) {
        await callAPI('addAsset', payload);
    } else {
        queueOffline('addAsset', payload);
    }

    allAssets.push(payload);
    localStorage.setItem('allAssets', JSON.stringify(allAssets));
    renderAssetGallery();
    resetAssetForm();
    btn.innerText = "Save Asset";
};

// --- 6. SEARCH & GALLERY ---

document.getElementById('search-assets').oninput = (e) => {
    renderAssetGallery(e.target.value.toLowerCase());
};

function renderAssetGallery(filter = "") {
    const container = document.getElementById('asset-gallery');
    container.innerHTML = '';
    
    // Only show assets for current site/plant
    const filtered = allAssets.filter(a => 
        a.plantName === currentPlant && 
        a.siteName === currentSite.name &&
        (a.assetName.toLowerCase().includes(filter) || a.tag.toLowerCase().includes(filter))
    );

    filtered.forEach((asset, index) => {
        const item = document.createElement('div');
        item.className = 'asset-list-item';
        item.innerHTML = `
            <div>
                <strong>${asset.assetName}</strong><br>
                <small>${asset.tag} | ${asset.condition}</small>
            </div>
            <button class="delete-btn" onclick="deleteAsset(${index})">🗑️</button>
        `;
        container.prepend(item);
    });
}

window.deleteAsset = (index) => {
    if(confirm("Delete this asset?")) {
        allAssets.splice(index, 1);
        localStorage.setItem('allAssets', JSON.stringify(allAssets));
        renderAssetGallery();
    }
};

// --- 7. UTILS & SYNC ---

async function callAPI(action, payload) {
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload })
    });
    return response.json();
}

function queueOffline(action, payload) {
    offlineQueue.push({ action, payload });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    updateSyncUI();
}

document.getElementById('btn-sync').onclick = async () => {
    if (!navigator.onLine) return alert("No Internet");
    const btn = document.getElementById('btn-sync');
    btn.innerText = "Syncing...";

    while (offlineQueue.length > 0) {
        const item = offlineQueue[0];
        try {
            await callAPI(item.action, item.payload);
            offlineQueue.shift();
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        } catch (e) { break; }
    }
    btn.innerText = "Sync Now";
    updateSyncUI();
};

function updateSyncUI() {
    const btn = document.getElementById('btn-sync');
    btn.style.display = (offlineQueue.length > 0) ? 'inline-block' : 'none';
    if(offlineQueue.length > 0) btn.innerHTML = `Sync (${offlineQueue.length})`;
}

const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(f);
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = e => rej(e);
});

function resetAssetForm() {
    ['asset-name', 'asset-model', 'asset-condition', 'asset-tag', 'asset-notes'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('asset-photo').value = '';
    document.getElementById('gps-coords').innerText = "No GPS Data";
}

// Back buttons
document.getElementById('btn-back-sites').onclick = () => showView('view-sites');
document.getElementById('btn-back-plants').onclick = () => showView('view-plants');
