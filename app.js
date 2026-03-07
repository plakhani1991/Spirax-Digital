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
    // Determine the view ID based on type (spaces to hyphens)
    const viewId = `view-form-${type.replace(/\s+/g, '-')}`;
    
    // If we have existing data but it's an old asset without a mapped type, default to Steam Insight view
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return alert("Form view not found for type: " + type);
    
    showView(viewId);
    currentAssetImages = [];
    currentExistingImageRefs = [];

    const titleEl = viewElement.querySelector('.form-title');
    const inputId = viewElement.querySelector('.asset-id');
    const inputName = viewElement.querySelector('.asset-name');
    const inputModel = viewElement.querySelector('.asset-model');
    const selectCondition = viewElement.querySelector('.asset-condition');
    const inputNotes = viewElement.querySelector('.asset-notes');
    const inputSpecific = viewElement.querySelector('.specific-field-1');
    const fileInput = viewElement.querySelector('.asset-photo-input');

    // Reset UI
    fileInput.value = '';
    
    if (asset) {
        titleEl.innerText = `Edit ${type}`;
        inputId.value = asset.id;
        inputName.value = asset.name || '';
        inputModel.value = asset.model || '';
        selectCondition.value = asset.condition || '';
        inputNotes.value = asset.notes || '';
        inputSpecific.value = asset.specificField1 || '';
        
        // Load existing refs
        if (asset.imageRefs) currentExistingImageRefs = [...asset.imageRefs];
        // Handle old single image format safely locally
        if (asset.imageRef && !currentExistingImageRefs.includes(asset.imageRef)) currentExistingImageRefs.push(asset.imageRef);
        
        // If there are unsynced local images attached
        if (asset.localImages) currentAssetImages = [...asset.localImages];
    } else {
        titleEl.innerText = `New ${type}`;
        inputId.value = '';
        inputName.value = '';
        inputModel.value = '';
        selectCondition.value = '';
        inputNotes.value = '';
        inputSpecific.value = '';
    }
    
    renderImagePreviews(viewElement);
}

// MULTIPLE IMAGE HANDLING
document.querySelectorAll('.btn-trigger-camera').forEach(btn => {
    btn.onclick = (e) => e.target.previousElementSibling.click();
});

document.querySelectorAll('.asset-photo-input').forEach(input => {
    input.onchange = async (e) => {
        const files = e.target.files;
        for(let i=0; i<files.length; i++) {
            const b64 = await compressImage(files[i], 1200, 0.7);
            currentAssetImages.push(b64);
        }
        renderImagePreviews(e.target.closest('.view'));
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
