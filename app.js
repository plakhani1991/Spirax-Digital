// In app.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', err));
  });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- 1. PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('PWA Service Worker Active'))
            .catch(err => console.error('SW registration failed', err));
    });
}

// --- 2. CONFIGURATION ---
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

// --- 3. STATE MANAGEMENT ---
// Structure: { "SiteName_City": { name, city, plants: { "PlantID": { name, assets: [] } } } }
let localDB = JSON.parse(localStorage.getItem('spiraxLocalDB')) || {};
let activeSiteId = null;
let activePlantId = null;

function saveLocalDB() {
    localStorage.setItem('spiraxLocalDB', JSON.stringify(localDB));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- 4. API CALLER (Connection Fix Applied) ---
async function callAPI(action, payload = {}) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow', // Essential for Google Apps Script redirects
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("API Error:", e);
        return { status: "error", message: "Connection lost. Ensure you are online and using a valid deployment." };
    }
}

// --- 5. AUTH & NAVIGATION ---
onAuthStateChanged(auth, (user) => {
    if (user) { renderHome(); } else { showView('view-login'); }
});

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
}

document.getElementById('btn-login').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
};

document.getElementById('btn-logout').onclick = () => signOut(auth);
document.querySelectorAll('.nav-home').forEach(btn => btn.onclick = renderHome);

// --- 6. HOME DASHBOARD ---
function renderHome() {
    showView('view-home');
    const list = document.getElementById('local-site-list');
    list.innerHTML = '';
    
    if (Object.keys(localDB).length === 0) {
        list.innerHTML = '<li class="empty-msg">No local sites. Create one or sync from cloud.</li>';
    } else {
        for (const siteId in localDB) {
            const site = localDB[siteId];
            const li = document.createElement('li');
            li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
            li.onclick = () => openSite(siteId);
            list.appendChild(li);
        }
    }
}

document.getElementById('nav-create-site').onclick = () => showView('view-create-site');
document.getElementById('nav-sync-sites').onclick = loadCloudSites;

// --- 7. CREATE SITE (IMMEDIATE CLOUD PUSH) ---
document.getElementById('btn-save-new-site').onclick = async () => {
    const name = document.getElementById('new-site-name').value;
    const city = document.getElementById('new-site-city').value;
    if (!name || !city) return alert("Please fill in both fields.");
    
    const btn = document.getElementById('btn-save-new-site');
    btn.innerText = "Creating Site in Cloud...";
    btn.disabled = true;

    const res = await callAPI('createSite', { siteName: name, siteCity: city });
    
    if (res.status === 'success') {
        const siteId = `${name}_${city}`.replace(/\s+/g, '');
        localDB[siteId] = res.siteData; // Site data structure from server
        saveLocalDB();
        openSite(siteId);
    } else {
        alert("Error creating site: " + res.message);
    }
    
    btn.innerText = "Save & Continue";
    btn.disabled = false;
};

// --- 8. SYNC EXISTING SITES ---
async function loadCloudSites() {
    showView('view-sync-sites');
    const list = document.getElementById('cloud-site-list');
    list.innerHTML = '<li>Connecting to cloud...</li>';
    
    const res = await callAPI('getSitesList');
    if (res.status === 'success') {
        list.innerHTML = '';
        res.data.reverse().forEach(site => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
            li.onclick = () => downloadSiteData(site.name, site.city);
            list.appendChild(li);
        });
    } else {
        list.innerHTML = `<li>Error: ${res.message}</li>`;
    }
}

async function downloadSiteData(name, city) {
    const res = await callAPI('downloadSiteData', { siteName: name, siteCity: city });
    if (res.status === 'success') {
        const siteId = `${name}_${city}`.replace(/\s+/g, '');
        localDB[siteId] = res.data; 
        saveLocalDB();
        openSite(siteId);
    } else {
        alert("Download failed: " + res.message);
    }
}

// --- 9. PLANTS MANAGEMENT ---
function openSite(siteId) {
    activeSiteId = siteId;
    const site = localDB[siteId];
    document.getElementById('current-site-title').innerText = site.name;
    document.getElementById('current-site-city').innerText = site.city;
    showView('view-plants');
    renderPlants();
}

function renderPlants() {
    const gallery = document.getElementById('plant-gallery');
    gallery.innerHTML = '';
    const plants = localDB[activeSiteId].plants;

    for (const plantId in plants) {
        const div = document.createElement('div');
        div.className = 'plant-card';
        div.innerHTML = `<h3>${plants[plantId].name}</h3><p>${plants[plantId].assets.length} assets</p>`;
        div.onclick = () => openPlant(plantId);
        gallery.appendChild(div);
    }
}

document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('new-plant-name').value;
    if (!name) return alert("Enter plant name");
    
    const plantId = 'plant_' + generateId();
    localDB[activeSiteId].plants[plantId] = { id: plantId, name: name, assets: [] };
    saveLocalDB();
    document.getElementById('new-plant-name').value = '';
    renderPlants();
};

// --- 10. PUSH DATA TO CLOUD ---
document.getElementById('btn-push-cloud').onclick = async () => {
    const btn = document.getElementById('btn-push-cloud');
    const site = localDB[activeSiteId];
    
    btn.innerText = "Syncing...";
    btn.disabled = true;

    const res = await callAPI('pushSiteData', { siteName: site.name, siteCity: site.city, siteData: site });
    
    if (res.status === 'success') {
        localDB[activeSiteId] = res.data; // Update local storage with remote Drive image URLs
        saveLocalDB();
        alert("Success! All data and images pushed to cloud.");
        renderPlants();
    } else {
        alert("Push failed: " + res.message);
    }
    
    btn.innerText = "☁️ Push to Cloud";
    btn.disabled = false;
};

// --- 11. ASSETS GALLERY ---
function openPlant(plantId) {
    activePlantId = plantId;
    document.getElementById('current-plant-title').innerText = `${localDB[activeSiteId].plants[plantId].name} Assets`;
    showView('view-assets');
    renderAssets();
}
document.getElementById('btn-back-to-plants').onclick = () => showView('view-plants');

function renderAssets() {
    const list = document.getElementById('asset-gallery');
    list.innerHTML = '';
    const assets = localDB[activeSiteId].plants[activePlantId].assets;

    if (assets.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#64748b;">No assets in this plant.</p>';
        return;
    }

    assets.forEach(asset => {
        const div = document.createElement('div');
        div.className = 'form-card asset-list-item';
        div.style.cursor = 'pointer';
        div.innerHTML = `<strong>${asset.name}</strong><br><small>${asset.condition} | ${asset.model || 'No model'}</small>`;
        div.onclick = () => openAssetForm(asset);
        list.appendChild(div);
    });
}

// --- 12. ASSET FORM (CREATE/EDIT) ---
document.getElementById('btn-create-asset').onclick = () => openAssetForm(null);
document.getElementById('btn-cancel-asset').onclick = () => showView('view-assets');

function openAssetForm(asset) {
    showView('view-asset-form');
    document.getElementById('asset-photo').value = '';
    
    if (asset) {
        document.getElementById('asset-form-title').innerText = 'Edit Asset';
        document.getElementById('asset-id').value = asset.id;
        document.getElementById('asset-name').value = asset.name || '';
        document.getElementById('asset-model').value = asset.model || '';
        document.getElementById('asset-condition').value = asset.condition || '';
        document.getElementById('asset-tag').value = asset.tag || '';
        document.getElementById('asset-notes').value = asset.notes || '';
        document.getElementById('gps-coords').innerText = asset.lat ? `${asset.lat}, ${asset.lng}` : "No GPS Data";
        document.getElementById('gps-coords').dataset.lat = asset.lat || "";
        document.getElementById('gps-coords').dataset.lng = asset.lng || "";
        document.getElementById('photo-status').innerText = (asset.localImage || asset.imageRef) ? "📷 Image Attached (Tap to replace)" : "📷 Tap to Take Photo";
    } else {
        document.getElementById('asset-form-title').innerText = 'New Asset';
        document.getElementById('asset-id').value = '';
        ['asset-name', 'asset-model', 'asset-condition', 'asset-tag', 'asset-notes'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('gps-coords').innerText = "No GPS Data";
        document.getElementById('gps-coords').dataset.lat = "";
        document.getElementById('photo-status').innerText = "📷 Tap to Take Photo";
    }
}

document.getElementById('btn-get-gps').onclick = () => {
    navigator.geolocation.getCurrentPosition(p => {
        const coords = document.getElementById('gps-coords');
        coords.innerText = `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`;
        coords.dataset.lat = p.coords.latitude;
        coords.dataset.lng = p.coords.longitude;
    }, () => alert("Could not access GPS. Check permissions."));
};

document.getElementById('btn-save-asset').onclick = async () => {
    const name = document.getElementById('asset-name').value;
    if (!name) return alert("Asset Name is required.");

    const btn = document.getElementById('btn-save-asset');
    btn.disabled = true;

    let assetId = document.getElementById('asset-id').value || generateId();
    const photoFile = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;

    let localImageBase64 = null;
    if (photoFile) {
        localImageBase64 = await compressImage(photoFile, 1200, 0.7);
    }

    const assetObj = {
        id: assetId,
        name,
        model: document.getElementById('asset-model').value,
        condition: document.getElementById('asset-condition').value,
        tag: document.getElementById('asset-tag').value,
        notes: document.getElementById('asset-notes').value,
        lat: gps.lat || "",
        lng: gps.lng || "",
    };

    const assetsArray = localDB[activeSiteId].plants[activePlantId].assets;
    const existingIndex = assetsArray.findIndex(a => a.id === assetId);

    if (existingIndex > -1) {
        // Edit existing
        if (!localImageBase64) {
            assetObj.localImage = assetsArray[existingIndex].localImage;
            assetObj.imageRef = assetsArray[existingIndex].imageRef;
        } else {
            assetObj.localImage = localImageBase64;
        }
        assetsArray[existingIndex] = assetObj;
    } else {
        // Create new
        if (localImageBase64) assetObj.localImage = localImageBase64;
        assetsArray.push(assetObj);
    }

    saveLocalDB();
    btn.disabled = false;
    showView('view-assets');
    renderAssets();
};

// --- 13. IMAGE PROCESSING HELPER ---
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
        };
    });
}
