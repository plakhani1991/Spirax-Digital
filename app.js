import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- PWA SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    });
}

// --- FIREBASE CONFIG ---
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
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7YthwCWRynOV1k8s5U1_fVojBYIVHVEFIRxce1jg0NaytyH06QqR3AUD3yQfCg7qU/exec";

// --- STATE ---
let localSites = JSON.parse(localStorage.getItem('localSites')) || [];
let activeSiteId = null;
let activePlantId = null;
let temporaryAssetImages = []; // Holds arrays of base64 images while creating/editing an asset

// --- DOM ELEMENTS ---
const btnLogout = document.getElementById('btn-logout');
const btnGlobalPush = document.getElementById('btn-global-push');
const progressBarContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const imageModal = document.getElementById('image-modal');
const expandedImg = document.getElementById('expanded-img');

// --- AUTHENTICATION OBSERVER ---
onAuthStateChanged(auth, user => {
    if (user) {
        // Logged in: show header buttons
        btnLogout.style.display = 'block';
        btnGlobalPush.style.display = 'block';
        showView('view-home');
        renderLocalSites();
    } else {
        // Logged out: hide header buttons completely
        btnLogout.style.display = 'none';
        btnGlobalPush.style.display = 'none';
        showView('view-login');
    }
});

document.getElementById('btn-login').addEventListener('click', () => {
    const e = document.getElementById('email').value, p = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, e, p).catch(err => alert("Login Failed: " + err.message));
});

btnLogout.addEventListener('click', () => signOut(auth));

// --- NAVIGATION ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-home').forEach(btn => {
    btn.addEventListener('click', () => {
        showView('view-home');
        renderLocalSites();
    });
});

document.getElementById('nav-create-site').addEventListener('click', () => showView('view-create-site'));
document.getElementById('nav-sync-sites').addEventListener('click', () => {
    showView('view-sync-sites');
    fetchCloudSites();
});

document.getElementById('btn-back-to-plants').addEventListener('click', () => {
    showView('view-plants');
    renderPlants();
});

document.querySelectorAll('.btn-cancel-asset').forEach(btn => {
    btn.addEventListener('click', () => {
        showView('view-assets');
    });
});

// --- GLOBAL PUSH TO CLOUD ---
btnGlobalPush.addEventListener('click', async () => {
    if (localSites.length === 0) return alert("No local sites to push.");
    
    progressBarContainer.style.display = 'block';
    let successCount = 0;

    for (let i = 0; i < localSites.length; i++) {
        let site = localSites[i];
        progressBar.style.width = `${((i) / localSites.length) * 100}%`;
        
        try {
            await googleScriptAction('pushSiteData', {
                siteName: site.name,
                siteCity: site.city,
                siteData: site
            });
            successCount++;
        } catch(e) {
            console.error("Failed to push site:", site.name, e);
        }
    }
    
    progressBar.style.width = '100%';
    setTimeout(() => {
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
        alert(`Push complete! Successfully synced ${successCount} of ${localSites.length} sites.`);
    }, 500);
});

// --- GOOGLE SCRIPT HELPER ---
async function googleScriptAction(action, payload = {}) {
    const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action, payload })
    });
    return await res.json();
}

// --- LOCAL DATA MANAGEMENT ---
function saveLocalDB() {
    localStorage.setItem('localSites', JSON.stringify(localSites));
}

function renderLocalSites() {
    const ul = document.getElementById('local-site-list');
    ul.innerHTML = '';
    localSites.forEach((site, index) => {
        const li = document.createElement('li');
        
        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
        infoDiv.style.cursor = 'pointer';
        infoDiv.onclick = () => {
            activeSiteId = site.id;
            showView('view-plants');
            renderPlants();
        };

        const actionDiv = document.createElement('div');
        actionDiv.className = 'list-actions';
        
        // Sync Button (Pushes just this site)
        const btnSync = document.createElement('button');
        btnSync.className = 'sync-btn';
        btnSync.innerText = 'Sync';
        btnSync.onclick = async (e) => {
            e.stopPropagation();
            btnSync.innerText = '...';
            try {
                await googleScriptAction('pushSiteData', { siteName: site.name, siteCity: site.city, siteData: site });
                alert("Site Synced Successfully!");
            } catch (err) { alert("Sync failed."); }
            btnSync.innerText = 'Sync';
        };

        // Hide Button (Deletes locally)
        const btnHide = document.createElement('button');
        btnHide.className = 'hide-btn';
        btnHide.innerText = 'Hide';
        btnHide.onclick = (e) => {
            e.stopPropagation();
            if(confirm(`Remove ${site.name} from local device? Cloud data will NOT be deleted.`)) {
                localSites.splice(index, 1);
                saveLocalDB();
                renderLocalSites();
            }
        };

        actionDiv.appendChild(btnSync);
        actionDiv.appendChild(btnHide);
        
        li.appendChild(infoDiv);
        li.appendChild(actionDiv);
        ul.appendChild(li);
    });
}

// --- NEW SITE CREATION ---
document.getElementById('btn-save-new-site').addEventListener('click', () => {
    const name = document.getElementById('new-site-name').value;
    const city = document.getElementById('new-site-city').value;
    if (!name || !city) return alert("Fill all fields");

    const newSite = { id: Date.now().toString(), name, city, plants: {} };
    localSites.push(newSite);
    saveLocalDB();
    
    // Auto push basic site structure to cloud
    googleScriptAction('createSite', { siteName: name, siteCity: city });
    
    document.getElementById('new-site-name').value = '';
    document.getElementById('new-site-city').value = '';
    showView('view-home');
    renderLocalSites();
});

// --- CLOUD SITES DOWNLOAD ---
async function fetchCloudSites() {
    const ul = document.getElementById('cloud-site-list');
    ul.innerHTML = '<li>Loading cloud sites...</li>';
    const res = await googleScriptAction('getSitesList');
    ul.innerHTML = '';
    res.data.forEach(site => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
        li.onclick = async () => {
            li.innerHTML += ' (Downloading...)';
            const dlRes = await googleScriptAction('downloadSiteData', { siteName: site.name, siteCity: site.city });
            const data = dlRes.data;
            data.id = Date.now().toString(); 
            localSites.push(data);
            saveLocalDB();
            alert("Site Downloaded!");
            showView('view-home');
            renderLocalSites();
        };
        ul.appendChild(li);
    });
}

// --- PLANTS LOGIC ---
function renderPlants() {
    const site = localSites.find(s => s.id === activeSiteId);
    document.getElementById('current-site-title').innerText = site.name;
    document.getElementById('current-site-city').innerText = site.city;
    
    const gallery = document.getElementById('plant-gallery');
    gallery.innerHTML = '';
    for (const pId in site.plants) {
        const plant = site.plants[pId];
        const card = document.createElement('div');
        card.className = 'plant-card';
        card.innerHTML = `<h3>${plant.name}</h3><p>${plant.assets ? plant.assets.length : 0} Assets</p>`;
        card.onclick = () => {
            activePlantId = pId;
            showView('view-assets');
            renderAssets();
        };
        gallery.appendChild(card);
    }
}

document.getElementById('btn-add-plant').addEventListener('click', () => {
    const name = document.getElementById('new-plant-name').value;
    if (!name) return;
    const site = localSites.find(s => s.id === activeSiteId);
    const pId = 'P_' + Date.now();
    site.plants[pId] = { id: pId, name, assets: [] };
    saveLocalDB();
    document.getElementById('new-plant-name').value = '';
    renderPlants();
});

// --- ASSET ROUTING ---
function renderAssets() {
    const site = localSites.find(s => s.id === activeSiteId);
    const plant = site.plants[activePlantId];
    document.getElementById('current-plant-title').innerText = `${plant.name} Assets`;
    
    const gallery = document.getElementById('asset-gallery');
    gallery.innerHTML = '';
    
    if (!plant.assets || plant.assets.length === 0) {
        gallery.innerHTML = '<p style="color: gray;">No assets added yet.</p>';
        return;
    }

    plant.assets.forEach(asset => {
        const card = document.createElement('div');
        card.className = 'asset-card';
        // Check for multiple local images or cloud URLs
        let thumbSrc = 'https://via.placeholder.com/150';
        if (asset.localImages && asset.localImages.length > 0) thumbSrc = "data:image/jpeg;base64," + asset.localImages[0];
        else if (asset.imageRefs && asset.imageRefs.length > 0) thumbSrc = asset.imageRefs[0];

        card.innerHTML = `
            <img src="${thumbSrc}" style="width:100%; height:100px; object-fit:cover; border-radius:8px;">
            <h4 style="margin: 0.5rem 0;">${asset.name}</h4>
            <span style="font-size:0.8rem; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${asset.type}</span>
        `;
        gallery.appendChild(card);
    });
}

// 4 Asset Buttons trigger opening forms
document.getElementById('btn-add-steam').onclick = () => openAssetForm('view-asset-steam');
document.getElementById('btn-add-flow').onclick = () => openAssetForm('view-asset-flow');
document.getElementById('btn-add-ccd').onclick = () => openAssetForm('view-asset-ccd');
document.getElementById('btn-add-dcc').onclick = () => openAssetForm('view-asset-dcc');

function openAssetForm(viewId) {
    temporaryAssetImages = []; // Reset images for new asset
    document.querySelectorAll('.image-preview-gallery').forEach(el => el.innerHTML = ''); // clear previews
    // Clear inputs in that specific view
    const view = document.getElementById(viewId);
    view.querySelectorAll('input').forEach(input => {
        if(input.type !== 'file' && input.type !== 'button') input.value = '';
    });
    showView(viewId);
}

// --- MULTIPLE IMAGES HANDLING ---
document.querySelectorAll('.asset-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
            const base64 = await compressImage(files[i], 800, 0.7);
            temporaryAssetImages.push(base64);
        }
        // Find the preview gallery in the closest form
        const gallery = e.target.closest('.multi-image-container').querySelector('.image-preview-gallery');
        renderImageThumbnails(gallery);
    });
});

function renderImageThumbnails(galleryElement) {
    galleryElement.innerHTML = '';
    temporaryAssetImages.forEach((img64, index) => {
        const container = document.createElement('div');
        container.className = 'img-thumb-container';
        
        const img = document.createElement('img');
        img.className = 'img-thumb';
        img.src = "data:image/jpeg;base64," + img64;
        img.onclick = () => openLightbox(img.src);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-img-btn';
        delBtn.innerHTML = '×';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            temporaryAssetImages.splice(index, 1);
            renderImageThumbnails(galleryElement);
        };

        container.appendChild(img);
        container.appendChild(delBtn);
        galleryElement.appendChild(container);
    });
}

// --- LIGHTBOX MODAL ---
function openLightbox(src) {
    imageModal.style.display = "block";
    expandedImg.src = src;
}
document.getElementById('close-modal').onclick = () => imageModal.style.display = "none";
window.onclick = (event) => {
    if (event.target == imageModal) imageModal.style.display = "none";
}

// --- SAVING SPECIFIC ASSETS ---
document.querySelectorAll('.btn-save-specific-asset').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const type = e.target.getAttribute('data-type');
        let prefix = type === "Steam Insight" ? "steam" : type === "Flow Meter" ? "flow" : type.toLowerCase();
        
        const idInput = document.getElementById(`${prefix}-id`).value || Date.now().toString();
        const name = document.getElementById(`${prefix}-name`).value;
        const tag = document.getElementById(`${prefix}-tag`).value;
        if (!name) return alert("Asset Name is required.");

        // Build base object
        const assetObj = {
            id: idInput,
            type: type,
            name: name,
            tag: tag,
            localImages: temporaryAssetImages // attach array of images
        };

        // Attach dummy specific fields based on type
        if (type === "Steam Insight") {
            assetObj.pressure = document.getElementById('steam-pressure').value;
            assetObj.temp = document.getElementById('steam-temp').value;
        } else if (type === "Flow Meter") {
            assetObj.pipeSize = document.getElementById('flow-pipesize').value;
            assetObj.fluid = document.getElementById('flow-fluid').value;
        } else if (type === "CCD") {
            assetObj.pump = document.getElementById('ccd-pump').value;
            assetObj.rating = document.getElementById('ccd-rating').value;
        } else if (type === "DCC") {
            assetObj.voltage = document.getElementById('dcc-voltage').value;
            assetObj.signal = document.getElementById('dcc-signal').value;
        }

        // Save to Local DB
        const site = localSites.find(s => s.id === activeSiteId);
        const plant = site.plants[activePlantId];
        if(!plant.assets) plant.assets = [];
        plant.assets.push(assetObj);
        saveLocalDB();
        
        showView('view-assets');
        renderAssets();
    });
});

// --- IMAGE COMPRESSOR HELPER ---
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
