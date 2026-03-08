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
let currentAssetImages = [];
let currentExistingImageRefs = [];

function saveLocalDB() { localStorage.setItem('spiraxLocalDB', JSON.stringify(localDB)); }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

// --- PENDING DELETIONS TRACKING ---
function loadPendingDeletions(siteId) {
    try {
        const all = JSON.parse(localStorage.getItem('spiraxPendingDeletions') || '{}');
        return all[siteId] || [];
    } catch { return []; }
}

function addPendingDeletion(siteId, deletion) {
    const all = JSON.parse(localStorage.getItem('spiraxPendingDeletions') || '{}');
    if (!all[siteId]) all[siteId] = [];
    all[siteId].push(deletion);
    localStorage.setItem('spiraxPendingDeletions', JSON.stringify(all));
}

function clearPendingDeletions(siteId) {
    const all = JSON.parse(localStorage.getItem('spiraxPendingDeletions') || '{}');
    delete all[siteId];
    localStorage.setItem('spiraxPendingDeletions', JSON.stringify(all));
}

// Apply local deletions to data received from cloud
function applyLocalDeletions(siteData, deletions) {
    const data = JSON.parse(JSON.stringify(siteData));
    for (const del of deletions) {
        if (del.type === 'plant' && del.plantId) {
            delete data.plants[del.plantId];
        } else if (del.type === 'asset' && del.plantId && del.assetId) {
            if (data.plants[del.plantId]) {
                data.plants[del.plantId].assets = data.plants[del.plantId].assets.filter(a => a.id !== del.assetId);
            }
        } else if (del.type === 'image' && del.plantId && del.assetId && del.imageUrl) {
            if (data.plants[del.plantId]) {
                const asset = data.plants[del.plantId].assets.find(a => a.id === del.assetId);
                if (asset && asset.imageRefs) {
                    asset.imageRefs = asset.imageRefs.filter(url => url !== del.imageUrl);
                }
            }
        }
    }
    return data;
}

// --- STATE PERSISTENCE ---
function saveAppState(viewId) {
    localStorage.setItem('spiraxAppState', JSON.stringify({
        view: viewId,
        activeSiteId: activeSiteId,
        activePlantId: activePlantId
    }));
}

function restoreAppState() {
    const stateStr = localStorage.getItem('spiraxAppState');
    if (stateStr) {
        const state = JSON.parse(stateStr);
        activeSiteId = state.activeSiteId;
        activePlantId = state.activePlantId;

        if (activeSiteId && localDB[activeSiteId]) {
            document.getElementById('current-site-title').innerText = localDB[activeSiteId].name;
            document.getElementById('current-site-city').innerText = localDB[activeSiteId].city;

            if (activePlantId && localDB[activeSiteId].plants[activePlantId]) {
                document.getElementById('current-plant-title').innerText = `${localDB[activeSiteId].plants[activePlantId].name} Assets`;
            }
        }

        showView(state.view || 'view-home');
        if (state.view === 'view-plants') renderPlants();
        else if (state.view === 'view-assets') renderAssets();
        else renderHome();
    } else {
        renderHome();
    }
}

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

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('main-header').style.display = 'block';
        restoreAppState();
    } else {
        document.getElementById('main-header').style.display = 'none';
        activeSiteId = null;
        activePlantId = null;
        localStorage.removeItem('spiraxAppState');
        showView('view-login');
    }
});

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        window.scrollTo(0, 0);
        saveAppState(id);
    }
}

document.getElementById('btn-login').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
};

// Allow Enter key on password field
document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-logout').onclick = () => signOut(auth);
document.querySelectorAll('.nav-home').forEach(btn => btn.onclick = renderHome);

// Handle image selection/capture for all forms
document.querySelectorAll('.asset-photo-input').forEach(input => {
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const view = e.target.closest('.view');
        const statusBtn = view.querySelector('.photo-trigger-btn');
        const originalText = statusBtn.innerText;

        statusBtn.innerText = "⏳ Processing...";
        statusBtn.disabled = true;

        for (const file of files) {
            try {
                const b64 = await compressImage(file, 1200, 0.7);
                currentAssetImages.push(b64);
            } catch (err) {
                console.error("Compression error:", err);
            }
        }

        renderImagePreviews(view);
        statusBtn.innerText = originalText;
        statusBtn.disabled = false;
        e.target.value = '';
    };
});

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
                    <button class="outline-btn" onclick="event.stopPropagation(); window.syncLocalSite('${site.name}', '${site.city}')" style="font-size:0.8rem; padding:0.4rem 0.6rem;">⬇️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); window.hideLocalSite('${siteId}')">🗑️</button>
                </div>
            `;
            list.appendChild(li);
        }
    }
}

window.toggleSteamFields = function(select) {
    const val = select.value;
    const dnContainer = document.getElementById('steam-dn-container');
    const setPContainer = document.getElementById('steam-set-pressure-container');
    if (dnContainer) dnContainer.style.display = (val === 'Safety Valve') ? 'block' : 'none';
    if (setPContainer) setPContainer.style.display = (val === 'PRV') ? 'block' : 'none';
};

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
        const siteId = `${name}_${city}`.replace(/\s+/g, '');

        // Apply any pending local deletions to the downloaded data
        const deletions = loadPendingDeletions(siteId);
        let cleanData = res.data;
        if (deletions.length > 0) {
            cleanData = applyLocalDeletions(res.data, deletions);
        }

        let assetCount = 0;
        Object.values(cleanData.plants).forEach(p => assetCount += p.assets.length);
        setSyncProgress(100, `Successfully synced ${assetCount} assets!`);

        localDB[siteId] = cleanData;
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
        if (res.data.length === 0) {
            list.innerHTML = '<li class="empty-msg">No cloud sites found.</li>';
        } else {
            res.data.reverse().forEach(site => {
                const li = document.createElement('li');
                li.innerHTML = `<div><strong>${site.name}</strong><br><small>${site.city}</small></div>`;
                li.onclick = () => window.syncLocalSite(site.name, site.city);
                list.appendChild(li);
            });
        }
    } else {
        list.innerHTML = `<li class="empty-msg">Error: ${res.message}</li>`;
    }
}

// --- PLANTS ---
function renderPlants() {
    const gallery = document.getElementById('plant-gallery');
    gallery.innerHTML = '';
    const plants = localDB[activeSiteId].plants;

    if (Object.keys(plants).length === 0) {
        gallery.innerHTML = '<p style="text-align:center; color:var(--text-light); padding:2rem 0;">No plants yet. Add one above.</p>';
        return;
    }

    for (const plantId in plants) {
        const plant = plants[plantId];
        const div = document.createElement('div');
        div.className = 'plant-card';
        div.innerHTML = `
            <h3>${plant.name}</h3>
            ${plant.location ? `<p class="plant-location">📍 ${plant.location}</p>` : ''}
            <p>${plant.assets.length} assets</p>
            <button class="plant-delete-btn" onclick="event.stopPropagation(); window.deletePlant('${plantId}')">🗑️</button>
        `;
        div.onclick = () => openPlant(plantId);
        gallery.appendChild(div);
    }
}

// --- ADD PLANT (with Name + Location) ---
document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('new-plant-name').value;
    const location = document.getElementById('new-plant-location').value;
    if (!name) return alert("Enter plant name");
    const plantId = 'plant_' + generateId();
    localDB[activeSiteId].plants[plantId] = { id: plantId, name: name, location: location, assets: [] };
    saveLocalDB();
    document.getElementById('new-plant-name').value = '';
    document.getElementById('new-plant-location').value = '';
    renderPlants();
};

// --- DELETE PLANT ---
window.deletePlant = function(plantId) {
    if (!confirm("Delete this plant and all its assets? This will sync to cloud on next push.")) return;
    addPendingDeletion(activeSiteId, { type: 'plant', plantId: plantId, timestamp: Date.now() });
    delete localDB[activeSiteId].plants[plantId];
    saveLocalDB();
    renderPlants();
};

// --- PUSH TO CLOUD (with deletion support) ---
document.getElementById('btn-push-cloud').onclick = async () => {
    const site = localDB[activeSiteId];

    // 1. Fetch latest to prevent overriding other users' data
    setSyncProgress(20, "Checking for cloud conflicts...");
    const cloudRes = await callAPI('downloadSiteData', { siteName: site.name, siteCity: site.city });

    // Deep copy local data
    const localCopy = JSON.parse(JSON.stringify(site));

    if (cloudRes.status === 'success' && cloudRes.data) {
        const cloudSite = cloudRes.data;
        for (const pId in localCopy.plants) {
            if (cloudSite.plants[pId]) {
                localCopy.plants[pId].assets.forEach(localAsset => {
                    const cloudAsset = cloudSite.plants[pId].assets.find(a => a.id === localAsset.id);
                    if (cloudAsset && cloudAsset.imageRefs) {
                        const combinedImages = new Set([...(cloudAsset.imageRefs || []), ...(localAsset.imageRefs || [])]);
                        localAsset.imageRefs = Array.from(combinedImages);
                    }
                });
            }
        }
    }

    // Attach pending deletions to payload
    const deletions = loadPendingDeletions(activeSiteId);
    if (deletions.length > 0) {
        localCopy._pendingDeletions = deletions;
    }

    let assetCount = 0;
    Object.values(localCopy.plants).forEach(p => assetCount += p.assets.length);

    setSyncProgress(50, `Pushing ${assetCount} assets & merging...`);

    const res = await callAPI('pushSiteData', { siteName: site.name, siteCity: site.city, siteData: localCopy });

    if (res.status === 'success') {
        setSyncProgress(100, "Merge Successful!");

        // Apply local deletions to returned cloud data too
        let returnedData = res.data;
        if (deletions.length > 0) {
            returnedData = applyLocalDeletions(returnedData, deletions);
            clearPendingDeletions(activeSiteId);
        }

        localDB[activeSiteId] = returnedData;
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
    const plant = localDB[activeSiteId].plants[plantId];
    document.getElementById('current-plant-title').innerText = `${plant.name} Assets`;
    showView('view-assets');
    renderAssets();
}
document.getElementById('btn-back-to-plants').onclick = () => { showView('view-plants'); renderPlants(); };

function renderAssets() {
    const list = document.getElementById('asset-gallery');
    list.innerHTML = '';
    const assets = localDB[activeSiteId].plants[activePlantId].assets;

    if (assets.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-light); padding:2rem 0;">No assets yet. Add one above.</p>';
        return;
    }

    assets.forEach(asset => {
        const div = document.createElement('div');
        div.className = 'asset-list-item';
        div.innerHTML = `
            <div class="asset-info" onclick="window.openAssetForm('${asset.type || 'Steam Insight'}', '${asset.id}')">
                <strong>${asset.name} <span style="font-weight:400; color:var(--text-light); font-size:0.8rem;">(${asset.type || 'Asset'})</span></strong>
                <br><small>${asset.condition || 'N/A'} | ${asset.model || 'No model'}</small>
            </div>
            <button class="asset-delete-btn" onclick="event.stopPropagation(); window.deleteAsset('${asset.id}')">🗑️</button>
        `;
        list.appendChild(div);
    });
}

// --- DELETE ASSET ---
window.deleteAsset = function(assetId) {
    if (!confirm("Delete this asset?")) return;
    addPendingDeletion(activeSiteId, { type: 'asset', plantId: activePlantId, assetId: assetId, timestamp: Date.now() });
    localDB[activeSiteId].plants[activePlantId].assets =
        localDB[activeSiteId].plants[activePlantId].assets.filter(a => a.id !== assetId);
    saveLocalDB();
    renderAssets();
};

document.querySelectorAll('.btn-add-specific').forEach(btn => {
    btn.onclick = (e) => openSpecificForm(e.target.dataset.type, null);
});
document.querySelectorAll('.btn-cancel-asset').forEach(btn => {
    btn.onclick = () => { showView('view-assets'); renderAssets(); };
});

// --- OPEN ASSET FORM ---
window.openAssetForm = function(type, assetId) {
    const asset = assetId ? localDB[activeSiteId].plants[activePlantId].assets.find(a => a.id === assetId) : null;
    openSpecificForm(type, asset);
};

function openSpecificForm(type, asset) {
    const viewId = `view-form-${type.replace(/\s+/g, '-')}`.toLowerCase();
    const viewElement = document.getElementById(viewId);

    if (!viewElement) return alert("Form view not found: " + viewId);

    showView(viewId);
    currentAssetImages = [];
    currentExistingImageRefs = [];

    const subTypeSelect = viewElement.querySelector('.asset-sub-type');
    const gpsDisplay = viewElement.querySelector('.gps-display');
    const latInp = viewElement.querySelector('.asset-gps-lat');
    const lngInp = viewElement.querySelector('.asset-gps-lng');

    const photoInp = viewElement.querySelector('.asset-photo-input');
    if (photoInp) photoInp.value = '';

    // Reset all inputs
    viewElement.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(inp => {
        if (inp.type === 'file') return;
        inp.value = '';
    });

    if (asset) {
        viewElement.querySelector('.form-title').innerText = `Edit ${type}`;
        viewElement.querySelector('.asset-id').value = asset.id;
        viewElement.querySelector('.asset-name').value = asset.name || '';
        if (viewElement.querySelector('.asset-notes'))
            viewElement.querySelector('.asset-notes').value = asset.notes || '';

        if (subTypeSelect) subTypeSelect.value = asset.subType || '';
        if (viewElement.querySelector('.asset-pressure'))
            viewElement.querySelector('.asset-pressure').value = asset.steamPressure || '';
        if (viewElement.querySelector('.asset-dn-size'))
            viewElement.querySelector('.asset-dn-size').value = asset.dnSize || '';
        if (viewElement.querySelector('.asset-set-pressure'))
            viewElement.querySelector('.asset-set-pressure').value = asset.setPressure || '';
        if (viewElement.querySelector('.asset-model'))
            viewElement.querySelector('.asset-model').value = asset.model || '';
        if (viewElement.querySelector('.asset-condition'))
            viewElement.querySelector('.asset-condition').value = asset.condition || '';
        if (viewElement.querySelector('.specific-field-1'))
            viewElement.querySelector('.specific-field-1').value = asset.specificField1 || '';

        if (latInp) latInp.value = asset.lat || '';
        if (lngInp) lngInp.value = asset.lng || '';
        if (gpsDisplay) gpsDisplay.innerText = asset.lat ? `${asset.lat}, ${asset.lng}` : 'No GPS data';

        currentExistingImageRefs = asset.imageRefs ? [...asset.imageRefs] : [];
        currentAssetImages = asset.localImages ? [...asset.localImages] : [];

        if (subTypeSelect) window.toggleSteamFields(subTypeSelect);
    } else {
        viewElement.querySelector('.form-title').innerText = `New ${type}`;
        viewElement.querySelector('.asset-id').value = '';
        if (subTypeSelect) subTypeSelect.value = '';
        if (gpsDisplay) gpsDisplay.innerText = 'No GPS';
        window.toggleSteamFields({ value: '' });
    }

    renderImagePreviews(viewElement);
}

// --- SAVE ASSET (smart merge — don't overwrite with blank) ---
document.querySelectorAll('.btn-save-asset').forEach(btn => {
    btn.onclick = (e) => {
        const view = e.target.closest('.view');
        const nameInp = view.querySelector('.asset-name');

        if (!nameInp || !nameInp.value) {
            return alert("Asset Name is required.");
        }

        const assetObj = {
            id: view.querySelector('.asset-id')?.value || generateId(),
            type: view.querySelector('.asset-type')?.value || 'Asset',
            name: nameInp.value,
            notes: view.querySelector('.asset-notes')?.value || '',
            model: view.querySelector('.asset-model')?.value || '',
            condition: view.querySelector('.asset-condition')?.value || '',
            specificField1: view.querySelector('.specific-field-1')?.value || '',
            subType: view.querySelector('.asset-sub-type')?.value || '',
            steamPressure: view.querySelector('.asset-pressure')?.value || '',
            dnSize: view.querySelector('.asset-dn-size')?.value || '',
            setPressure: view.querySelector('.asset-set-pressure')?.value || '',
            lat: view.querySelector('.asset-gps-lat')?.value || '',
            lng: view.querySelector('.asset-gps-lng')?.value || '',
            imageRefs: currentExistingImageRefs,
            localImages: currentAssetImages.length > 0 ? [...currentAssetImages] : null
        };

        const assetsArray = localDB[activeSiteId].plants[activePlantId].assets;
        const existingIndex = assetsArray.findIndex(a => a.id === assetObj.id);

        if (existingIndex > -1) {
            // SMART MERGE: Don't overwrite existing non-blank fields with blank
            const existing = assetsArray[existingIndex];
            for (const key of Object.keys(assetObj)) {
                if (key === 'imageRefs' || key === 'localImages' || key === 'id' || key === 'type') continue;
                if (assetObj[key] === '' || assetObj[key] === null || assetObj[key] === undefined) {
                    assetObj[key] = existing[key]; // Keep existing value
                }
            }
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
    if (!gallery) return;
    gallery.innerHTML = '';

    currentExistingImageRefs.forEach((url, idx) => {
        const div = document.createElement('div');
        div.className = 'img-thumb-container';
        div.innerHTML = `<img src="${url}" class="img-thumb"> <button class="del-img-btn" data-type="cloud" data-index="${idx}">✕</button>`;
        gallery.appendChild(div);
    });

    currentAssetImages.forEach((b64, idx) => {
        const div = document.createElement('div');
        div.className = 'img-thumb-container';
        div.innerHTML = `<img src="data:image/jpeg;base64,${b64}" class="img-thumb"> <button class="del-img-btn" data-type="local" data-index="${idx}">✕</button>`;
        gallery.appendChild(div);
    });

    gallery.querySelectorAll('.del-img-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const isLocal = e.target.dataset.type === 'local';
            const index = parseInt(e.target.dataset.index);
            if (isLocal) {
                currentAssetImages.splice(index, 1);
            } else {
                // Track cloud image deletion
                const deletedUrl = currentExistingImageRefs[index];
                if (activeSiteId && activePlantId) {
                    const assetIdEl = viewElement.querySelector('.asset-id');
                    const assetId = assetIdEl ? assetIdEl.value : '';
                    if (assetId && deletedUrl) {
                        addPendingDeletion(activeSiteId, {
                            type: 'image', plantId: activePlantId, assetId: assetId,
                            imageUrl: deletedUrl, timestamp: Date.now()
                        });
                    }
                }
                currentExistingImageRefs.splice(index, 1);
            }
            renderImagePreviews(viewElement);
        }
    });
}

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
