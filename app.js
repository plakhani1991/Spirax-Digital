import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    });
}

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

let localDB = JSON.parse(localStorage.getItem('spiraxLocalDB')) || {};
let activeSiteId = null;
let activePlantId = null;

// Images State for current active form
let currentAssetImages = []; // Array of base64 newly taken
let currentExistingImageRefs = []; // Array of URLs already in cloud

function saveLocalDB() { localStorage.setItem('spiraxLocalDB', JSON.stringify(localDB)); }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

// --- PROGRESS BAR HELPER ---
function setSyncProgress(percent, text) {
    const container = document.getElementById('sync-container');
    const bar = document.getElementById('sync-bar');
    const txt = document.getElementById('sync-text');
    if (percent === null) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
        bar.style.width = `${percent}%`;
        txt.innerText = text;
    }
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
        const result = await response.json();
        if (result.status === 'error') throw new Error(result.message);
        return result;
    } catch (e) {
        return { status: "error", message: e.message || "Connection lost." };
    }
}

// --- AUTH & LOGOUT FIX ---
onAuthStateChanged(auth, (user) => {
    if (user) { 
        document.getElementById('main-header').style.display = 'block';
        renderHome(); 
    } else { 
        // Logout Fix: Ensure everything resets
        document.getElementById('main-header').style.display = 'none';
        activeSiteId = null;
        activePlantId = null;
        showView('view-login'); 
    }
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

// --- HOME DASHBOARD ---
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
            li.innerHTML = `
                <div style="flex:1" onclick="window.openSite('${siteId}')">
                    <strong>${site.name}</strong><br><small>${site.city}</small>
                </div>
                <div class="list-actions">
                    <button class="icon-btn outline-btn" onclick="window.syncLocalSite('${site.name}', '${site.city}')" style="font-size:0.8rem; padding:0.3rem;">⬇️ Sync</button>
                    <button class="icon-btn outline-btn" onclick="window.hideLocalSite('${siteId}')" style="font-size:0.8rem; padding:0.3rem; border-color:red; color:red;">Hide</button>
                </div>
            `;
            list.appendChild(li);
        }
    }
}

// Global functions for inline HTML event handlers
// Toggle conditional fields based on sub-type
window.toggleSteamFields = function(select) {
    const val = select.value;
    const dnContainer = document.getElementById('steam-dn-container');
    const setPContainer = document.getElementById('steam-set-pressure-container');
    
    dnContainer.style.display = (val === 'Safety Valve') ? 'block' : 'none';
    setPContainer.style.display = (val === 'PRV') ? 'block' : 'none';
};

// Precise GPS Recording
window.recordPreciseGPS = function(btn) {
    const display = btn.parentElement.querySelector('.gps-display');
    const latInp = btn.parentElement.querySelector('.asset-gps-lat');
    const lngInp = btn.parentElement.querySelector('.asset-gps-lng');
    
    display.innerText = "🛰️ Locating...";
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            latInp.value = lat;
            lngInp.value = lng;
            display.innerText = `${lat}, ${lng}`;
            btn.style.borderColor = "#22c55e";
            btn.style.color = "#22c55e";
        },
        (err) => {
            display.innerText = "❌ Failed to get GPS";
            alert("Error: " + err.message);
        },
        { enableHighAccuracy: true, timeout: 5000 }
    );
};

window.openSite = function(siteId) {
    activeSiteId = siteId;
    const site = localDB[siteId];
    document.getElementById('current-site-title').innerText = site.name;
    document.getElementById('current-site-city').innerText = site.city;
    showView('view-plants');
    renderPlants();
};

window.hideLocalSite = function(siteId) {
    if (confirm("Delete this site locally? (Cloud data remains safe)")) {
        delete localDB[siteId];
        saveLocalDB();
        renderHome();
    }
};

window.syncLocalSite = async function(name, city) {
    setSyncProgress(20, "Fetching updates...");
    const res = await callAPI('downloadSiteData', { siteName: name, siteCity: city });
    if (res.status === 'success') {
        // Calculate assets for progress UI
        let assetCount = 0;
        Object.values(res.data.plants).forEach(p => assetCount += p.assets.length);
        setSyncProgress(100, `Successfully synced ${assetCount} assets!`);
        
        const siteId = `${name}_${city}`.replace(/\s+/g, '');
        localDB[siteId] = res.data; 
        saveLocalDB();
        setTimeout(() => { setSyncProgress(null); renderHome(); }, 1500);
    } else {
        setSyncProgress(null);
        alert("Sync failed: " + res.message);
    }
};

document.getElementById('nav-create-site').onclick = () => showView('view-create-site');
document.getElementById('nav-sync-sites').onclick = loadCloudSites;

// --- CREATE SITE ---
document.getElementById('btn-save-new-site').onclick = async () => {
    const name = document.getElementById('new-site-name').value;
    const city = document.getElementById('new-site-city').value;
    if (!name || !city) return alert("Please fill in both fields.");
    
    setSyncProgress(50, "Creating cloud folder...");
    const res = await callAPI('createSite', { siteName: name, siteCity: city });
    
    if (res.status === 'success') {
        setSyncProgress(100, "Done!");
        const siteId = `${name}_${city}`.replace(/\s+/g, '');
        localDB[siteId] = res.siteData; 
        saveLocalDB();
        setTimeout(() => { setSyncProgress(null); window.openSite(siteId); }, 1000);
    } else {
        setSyncProgress(null);
        alert("Error: " + res.message);
    }
};

// --- SYNC EXISTING SITES ---
async function loadCloudSites() {
    showView('view-sync-sites');
    setSyncProgress(50, "Loading cloud list...");
    const list = document.getElementById('cloud-site-list');
    list.innerHTML = '';
    
    const res = await callAPI('getSitesList');
    setSyncProgress(null);
    if (res.status === 'success') {
        res.data.reverse().forEach(site => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
            li.onclick = () => window.syncLocalSite(site.name, site.city); // Reuse the sync function
            list.appendChild(li);
        });
    } else {
        list.innerHTML = `<li>Error: ${res.message}</li>`;
    }
}

// --- PLANTS ---
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
    const site = localDB[activeSiteId];
    
    // Count total assets to push
    let assetCount = 0;
    Object.values(site.plants).forEach(p => assetCount += p.assets.length);
    
    setSyncProgress(40, `Pushing ${assetCount} assets & images...`);

    const res = await callAPI('pushSiteData', { siteName: site.name, siteCity: site.city, siteData: site });
    
    if (res.status === 'success') {
        setSyncProgress(100, "Merge Successful!");
        localDB[activeSiteId] = res.data; 
        saveLocalDB();
        renderPlants();
        setTimeout(() => setSyncProgress(null), 2000);
    } else {
        setSyncProgress(null);
        alert("Push failed: " + res.message);
    }
};

// --- ASSETS GALLERY ---
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

    assets.forEach(asset => {
        const div = document.createElement('div');
        div.className = 'form-card asset-list-item';
        div.innerHTML = `<strong>${asset.name} (${asset.type || 'Asset'})</strong><br><small>${asset.condition} | ${asset.model || 'No model'}</small>`;
        div.onclick = () => openSpecificForm(asset.type || 'Steam Insight', asset);
        list.appendChild(div);
    });
}

// --- 4 SPECIFIC FORMS LOGIC ---
document.querySelectorAll('.btn-add-specific').forEach(btn => {
    btn.onclick = (e) => openSpecificForm(e.target.dataset.type, null);
});
document.querySelectorAll('.btn-cancel-asset').forEach(btn => {
    btn.onclick = () => showView('view-assets');
});

function openSpecificForm(type, asset) {
    // Standardize the ID to lowercase to match typical HTML IDs
    const viewId = `view-form-${type.replace(/\s+/g, '-')}`.toLowerCase();
    const viewElement = document.getElementById(viewId);
    
    if (!viewElement) return alert("Form view not found: " + viewId);

    showView(viewId);
    currentAssetImages = [];
    currentExistingImageRefs = [];

    // Selectors
    const subTypeSelect = viewElement.querySelector('.asset-sub-type');
    const gpsDisplay = viewElement.querySelector('.gps-display');
    const latInp = viewElement.querySelector('.asset-gps-lat');
    const lngInp = viewElement.querySelector('.asset-gps-lng');

    // Reset File Input safely
    const photoInp = viewElement.querySelector('.asset-photo-input');
    if(photoInp) photoInp.value = '';
    
    if (asset) {
        viewElement.querySelector('.form-title').innerText = `Edit ${type}`;
        viewElement.querySelector('.asset-id').value = asset.id;
        viewElement.querySelector('.asset-name').value = asset.name || '';
        if(viewElement.querySelector('.asset-notes')) 
            viewElement.querySelector('.asset-notes').value = asset.notes || '';
        
        // Steam Insight Specifics (Safe Checks)
        if (subTypeSelect) subTypeSelect.value = asset.subType || '';
        if (viewElement.querySelector('.asset-pressure')) 
            viewElement.querySelector('.asset-pressure').value = asset.steamPressure || '';
        if (viewElement.querySelector('.asset-dn-size')) 
            viewElement.querySelector('.asset-dn-size').value = asset.dnSize || '';
        
        // GPS Loading
        if (latInp) latInp.value = asset.lat || '';
        if (lngInp) lngInp.value = asset.lng || '';
        if (gpsDisplay) gpsDisplay.innerText = asset.lat ? `${asset.lat}, ${asset.lng}` : 'No GPS data';

        currentExistingImageRefs = asset.imageRefs ? [...asset.imageRefs] : [];
        currentAssetImages = asset.localImages ? [...asset.localImages] : [];
        
        if (subTypeSelect) window.toggleSteamFields(subTypeSelect);
    } else {
        // Reset Logic for New Asset...
        viewElement.querySelector('.form-title').innerText = `New ${type}`;
        viewElement.querySelector('.asset-id').value = '';
        viewElement.querySelector('.asset-name').value = '';
        if (subTypeSelect) subTypeSelect.value = '';
        window.toggleSteamFields({value: ''});
    }
    
    renderImagePreviews(viewElement);
}

// MULTIPLE IMAGE HANDLING
// SAVE ASSET DATA (Class-based for multi-form support)
document.querySelectorAll('.btn-save-asset').forEach(btn => {
    btn.onclick = (e) => {
        const view = e.target.closest('.view');
        const nameInp = view.querySelector('.asset-name');
        if (!nameInp || !nameInp.value) return alert("Asset Name is required.");

        // Use Optional Chaining (?.) to prevent crashes if a field is missing in a specific form
        const assetObj = {
            id: view.querySelector('.asset-id')?.value || generateId(),
            type: view.querySelector('.asset-type')?.value || 'Asset',
            name: nameInp.value,
            notes: view.querySelector('.asset-notes')?.value || '',
            // General Fields
            model: view.querySelector('.asset-model')?.value || '',
            condition: view.querySelector('.asset-condition')?.value || '',
            // Steam Fields
            subType: view.querySelector('.asset-sub-type')?.value || '',
            steamPressure: view.querySelector('.asset-pressure')?.value || '',
            dnSize: view.querySelector('.asset-dn-size')?.value || '',
            setPressure: view.querySelector('.asset-set-pressure')?.value || '',
            // GPS & Images
            lat: view.querySelector('.asset-gps-lat')?.value || '',
            lng: view.querySelector('.asset-gps-lng')?.value || '',
            imageRefs: currentExistingImageRefs,
            localImages: currentAssetImages.length > 0 ? [...currentAssetImages] : null
        };

        const assetsArray = localDB[activeSiteId].plants[activePlantId].assets;
        const existingIndex = assetsArray.findIndex(a => a.id === assetObj.id);

        if (existingIndex > -1) {
            assetsArray[existingIndex] = assetObj;
        } else {
            assetsArray.push(assetObj);
        }

        saveLocalDB();
        showView('view-assets');
        renderAssets();
    };
});

function renderImagePreviews(viewElement) {
    const gallery = viewElement.querySelector('.image-preview-gallery');
    gallery.innerHTML = '';
    
    // Render existing Cloud URLs
    currentExistingImageRefs.forEach((url, idx) => {
        const div = document.createElement('div');
        div.className = 'img-thumb-container';
        div.innerHTML = `<img src="${url}" class="img-thumb"> <button class="del-img-btn" data-type="cloud" data-index="${idx}">X</button>`;
        gallery.appendChild(div);
    });

    // Render new local Base64s
    currentAssetImages.forEach((b64, idx) => {
        const div = document.createElement('div');
        div.className = 'img-thumb-container';
        div.innerHTML = `<img src="data:image/jpeg;base64,${b64}" class="img-thumb"> <button class="del-img-btn" data-type="local" data-index="${idx}">X</button>`;
        gallery.appendChild(div);
    });

    // Attach delete listeners
    gallery.querySelectorAll('.del-img-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const isLocal = e.target.dataset.type === 'local';
            const index = parseInt(e.target.dataset.index);
            if (isLocal) {
                currentAssetImages.splice(index, 1);
            } else {
                currentExistingImageRefs.splice(index, 1);
            }
            renderImagePreviews(viewElement);
        }
    });
}

// SAVE ASSET DATA
document.querySelectorAll('.btn-save-asset').forEach(btn => {
    btn.onclick = (e) => {
        const view = e.target.closest('.view');
        const name = view.querySelector('.asset-name').value;
        if (!name) return alert("Asset Name is required.");

        const type = view.querySelector('.asset-type').value;
        const assetId = view.querySelector('.asset-id').value || generateId();
        
        const assetObj = {
            id: assetId,
            type: type,
            name: name,
            model: view.querySelector('.asset-model').value,
            condition: view.querySelector('.asset-condition').value,
            notes: view.querySelector('.asset-notes').value,
            specificField1: view.querySelector('.specific-field-1').value,
            imageRefs: currentExistingImageRefs, // Retain existing cloud URLs
            localImages: currentAssetImages.length > 0 ? currentAssetImages : null // Attach new b64s
        };

        const assetsArray = localDB[activeSiteId].plants[activePlantId].assets;
        const existingIndex = assetsArray.findIndex(a => a.id === assetId);

        if (existingIndex > -1) {
            assetsArray[existingIndex] = assetObj;
        } else {
            assetsArray.push(assetObj);
        }

        saveLocalDB();
        showView('view-assets');
        renderAssets();
    };
});

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
                if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
        };
    });
}
