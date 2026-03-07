import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- CONFIG & SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};

const SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE"; // Update this!

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- LOCAL DATA STATE ---
// Structure: { "SiteName_City": { name, city, plants: { "PlantName": { name, assets: [] } } } }
let localDB = JSON.parse(localStorage.getItem('spiraxLocalDB')) || {};
let activeSiteId = null;
let activePlantId = null;

function saveLocalDB() {
    localStorage.setItem('spiraxLocalDB', JSON.stringify(localDB));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- API CALLER ---
async function callAPI(action, payload = {}) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST', mode: 'cors', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("API Call Error:", e);
        return { status: "error", message: e.toString() };
    }
}

// --- NAVIGATION & AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) { renderHome(); } else { showView('view-login'); }
});

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

document.querySelectorAll('.nav-home').forEach(btn => btn.onclick = renderHome);
document.getElementById('btn-login').onclick = () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(err => alert(err.message));
};
document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- HOME VIEW ---
function renderHome() {
    showView('view-home');
    const list = document.getElementById('local-site-list');
    list.innerHTML = '';
    
    if (Object.keys(localDB).length === 0) {
        list.innerHTML = '<li>No offline sites stored. Create or sync one.</li>';
        return;
    }

    for (const siteId in localDB) {
        const site = localDB[siteId];
        const li = document.createElement('li');
        li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
        li.onclick = () => openSite(siteId);
        list.appendChild(li);
    }
}

document.getElementById('nav-create-site').onclick = () => showView('view-create-site');
document.getElementById('nav-sync-sites').onclick = loadCloudSites;

// --- CREATE LOCAL SITE ---
document.getElementById('btn-save-new-site').onclick = () => {
    const name = document.getElementById('new-site-name').value;
    const city = document.getElementById('new-site-city').value;
    if (!name || !city) return alert("Name and City required");
    
    const siteId = `${name}_${city}`.replace(/\s+/g, '');
    if (!localDB[siteId]) {
        localDB[siteId] = { name, city, plants: {} };
        saveLocalDB();
    }
    document.getElementById('new-site-name').value = '';
    document.getElementById('new-site-city').value = '';
    openSite(siteId);
};

// --- SYNC SITES (CLOUD TO LOCAL) ---
async function loadCloudSites() {
    showView('view-sync-sites');
    const list = document.getElementById('cloud-site-list');
    list.innerHTML = '<li>Fetching from cloud...</li>';
    
    const res = await callAPI('getSitesList');
    if (res.status === 'success') {
        list.innerHTML = '';
        res.data.reverse().forEach(site => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
            li.onclick = () => downloadSiteData(site.name, site.city);
            list.appendChild(li);
        });
    } else { list.innerHTML = `<li>Error: ${res.message}</li>`; }
}

async function downloadSiteData(name, city) {
    const list = document.getElementById('cloud-site-list');
    list.innerHTML = '<li>Downloading site data...</li>';
    const res = await callAPI('downloadSiteData', { siteName: name, siteCity: city });
    
    if (res.status === 'success') {
        const siteId = `${name}_${city}`.replace(/\s+/g, '');
        localDB[siteId] = res.data; // Overwrite local with cloud master JSON
        saveLocalDB();
        openSite(siteId);
    } else {
        alert("Failed to download data: " + res.message);
        loadCloudSites();
    }
}

// --- SITE/PLANTS VIEW ---
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

// --- PUSH TO CLOUD ---
document.getElementById('btn-push-cloud').onclick = async () => {
    const btn = document.getElementById('btn-push-cloud');
    btn.innerText = "Pushing...";
    btn.disabled = true;

    const site = localDB[activeSiteId];
    const payload = { siteName: site.name, siteCity: site.city, siteData: site };
    
    const res = await callAPI('pushSiteData', payload);
    if (res.status === 'success') {
        localDB[activeSiteId] = res.data; // Updates local JSON with Drive Image URLs
        saveLocalDB();
        alert("Site data successfully pushed to cloud!");
    } else {
        alert("Push failed: " + res.message);
    }
    
    btn.innerText = "☁️ Push to Cloud";
    btn.disabled = false;
};

// --- PLANT/ASSETS VIEW ---
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

    if (assets.length === 0) { list.innerHTML = '<p>No assets added yet.</p>'; return; }

    assets.forEach(asset => {
        const div = document.createElement('div');
        div.className = 'form-card';
        div.innerHTML = `<strong>${asset.name}</strong> (${asset.condition})<br><small>${asset.model || 'No model'}</small>`;
        div.onclick = () => openAssetForm(asset);
        list.appendChild(div);
    });
}

// --- ASSET FORM (CREATE/EDIT) ---
document.getElementById('btn-create-asset').onclick = () => openAssetForm(null);
document.getElementById('btn-cancel-asset').onclick = () => showView('view-assets');

function openAssetForm(assetData) {
    showView('view-asset-form');
    document.getElementById('photo-status').innerText = '📷 Tap to Take/Update Photo';
    
    if (assetData) {
        document.getElementById('asset-form-title').innerText = 'Edit Asset';
        document.getElementById('asset-id').value = assetData.id;
        document.getElementById('asset-name').value = assetData.name || '';
        document.getElementById('asset-model').value = assetData.model || '';
        document.getElementById('asset-condition').value = assetData.condition || '';
        document.getElementById('asset-tag').value = assetData.tag || '';
        document.getElementById('asset-notes').value = assetData.notes || '';
        document.getElementById('gps-coords').innerText = assetData.lat ? `${assetData.lat}, ${assetData.lng}` : "No GPS Data";
        document.getElementById('gps-coords').dataset.lat = assetData.lat || "";
        document.getElementById('gps-coords').dataset.lng = assetData.lng || "";
        
        if (assetData.localImage || assetData.imageRef) {
             document.getElementById('photo-status').innerText = '📷 Image Attached (Tap to replace)';
        }
    } else {
        document.getElementById('asset-form-title').innerText = 'New Asset';
        document.getElementById('asset-id').value = '';
        ['asset-name', 'asset-model', 'asset-condition', 'asset-tag', 'asset-notes'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('gps-coords').innerText = "No GPS Data";
        document.getElementById('asset-photo').value = ''; // Reset file input
    }
}

document.getElementById('btn-get-gps').onclick = () => {
    navigator.geolocation.getCurrentPosition(p => {
        const coords = document.getElementById('gps-coords');
        coords.innerText = `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`;
        coords.dataset.lat = p.coords.latitude;
        coords.dataset.lng = p.coords.longitude;
    });
};

document.getElementById('btn-save-asset').onclick = async () => {
    const name = document.getElementById('asset-name').value;
    if (!name) return alert("Asset Name required");

    let assetId = document.getElementById('asset-id').value || generateId();
    const photoFile = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;

    let localImageBase64 = null;
    if (photoFile) { localImageBase64 = await compressImage(photoFile, 1200, 0.7); }

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

    // Find if editing
    const assetsArray = localDB[activeSiteId].plants[activePlantId].assets;
    const existingIndex = assetsArray.findIndex(a => a.id === assetId);

    // Maintain existing image references if a new one wasn't uploaded
    if (existingIndex > -1) {
        if (!localImageBase64) {
             assetObj.localImage = assetsArray[existingIndex].localImage;
             assetObj.imageRef = assetsArray[existingIndex].imageRef;
        } else {
             assetObj.localImage = localImageBase64; 
        }
        assetsArray[existingIndex] = assetObj;
    } else {
        if (localImageBase64) assetObj.localImage = localImageBase64;
        assetsArray.push(assetObj);
    }

    saveLocalDB();
    alert("Asset saved locally. Remember to push to cloud when done.");
    showView('view-assets');
    renderAssets();
};

function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
        };
    });
}
