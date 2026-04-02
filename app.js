// ===== FIREBASE CONFIGURATION =====
// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const WIKI_DOC_ID = "main";  // Single document for the wiki

// ===== PERMISSIONS FROM URL =====
const urlParams = new URLSearchParams(window.location.search);
const isEditor = urlParams.get("edit") === "true";
const isAdmin = urlParams.get("admin") === "1234";  // Hardcoded admin password
const canEdit = isEditor || isAdmin;

// ===== GLOBAL STATE =====
let editor = null;
let isEditMode = false;
let autosaveTimer = null;
let currentContent = null;
let wikiLocked = false;
let wikiLockCode = null;
let isInitialLoad = true;

// ===== INITIAL CONTENT (default) =====
const DEFAULT_CONTENT = {
    time: Date.now(),
    blocks: [
        {
            type: "header",
            data: { text: "Welcome to MakeUrWiki", level: 1 }
        },
        {
            type: "paragraph",
            data: { text: "This is a real-time wiki powered by Firebase. Anyone with the <strong>edit link</strong> can collaborate. Admins can lock the wiki and manage settings." }
        },
        {
            type: "header",
            data: { text: "Features", level: 2 }
        },
        {
            type: "list",
            data: {
                style: "unordered",
                items: [
                    "Real-time sync across all users",
                    "Editor and Admin permission links",
                    "Lock system to prevent edits",
                    "Auto-save every 5 seconds",
                    "Fandom-like design",
                    "Cloud storage with Firebase"
                ]
            }
        },
        {
            type: "header",
            data: { text: "How to use", level: 2 }
        },
        {
            type: "paragraph",
            data: { text: "1. Use <strong>?edit=true</strong> to get editor access<br>2. Use <strong>?admin=1234</strong> for full control<br>3. Share the links with your team<br>4. Admin can lock the wiki with a code" }
        },
        {
            type: "quote",
            data: { text: "Together we build knowledge.", caption: "MakeUrWiki", alignment: "left" }
        }
    ]
};

// ===== FIREBASE HELPERS =====
async function getWikiDoc() {
    const docRef = db.collection("wikis").doc(WIKI_DOC_ID);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        // Create default document
        await docRef.set({
            content: DEFAULT_CONTENT,
            locked: false,
            lockCode: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { content: DEFAULT_CONTENT, locked: false, lockCode: null };
    }
    return docSnap.data();
}

async function saveContentToFirebase(content) {
    if (!content) return;
    await db.collection("wikis").doc(WIKI_DOC_ID).update({
        content: content,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    updateStats();
    console.log("Content saved to Firebase");
}

async function setLock(locked, code = null) {
    const updateData = { locked: locked };
    if (code !== undefined) updateData.lockCode = code;
    await db.collection("wikis").doc(WIKI_DOC_ID).update(updateData);
}

async function resetWikiToDefault() {
    await db.collection("wikis").doc(WIKI_DOC_ID).set({
        content: DEFAULT_CONTENT,
        locked: false,
        lockCode: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Wiki has been reset to default content.");
}

// ===== REAL-TIME LISTENER =====
function setupRealtimeListener() {
    db.collection("wikis").doc(WIKI_DOC_ID).onSnapshot((docSnap) => {
        if (docSnap.exists) {
            const data = docSnap.data();
            currentContent = data.content || DEFAULT_CONTENT;
            wikiLocked = data.locked || false;
            wikiLockCode = data.lockCode || null;
            
            // Update UI lock status
            updateLockStatusUI();
            
            // Update infobox status badge
            const statusBadge = document.querySelector("#wikiStatus");
            if (statusBadge) {
                statusBadge.textContent = wikiLocked ? "Locked" : "Active";
                statusBadge.style.backgroundColor = wikiLocked ? "#dc3545" : "#28a745";
            }
            
            // Render content in editor (only if not editing to avoid overwriting user input)
            if (editor && !isEditMode) {
                editor.render(currentContent).catch(e => console.warn("Render error", e));
            } else if (editor && isEditMode && isInitialLoad) {
                // On first load, render even in edit mode? Better to render.
                editor.render(currentContent).catch(e => console.warn("Render error", e));
            }
            isInitialLoad = false;
        }
    }, (error) => {
        console.error("Firestore real-time error:", error);
        alert("Error connecting to Firebase. Check your configuration.");
    });
}

// ===== EDITOR SETUP =====
function initializeEditor() {
    editor = new EditorJS({
        holder: 'contentArea',
        tools: {
            header: { class: Header, config: { placeholder: 'Enter a title...', levels: [1,2,3], defaultLevel: 2 } },
            paragraph: { class: Paragraph, inlineToolbar: true, config: { placeholder: 'Write your content...' } },
            list: { class: List, inlineToolbar: true, config: { defaultStyle: 'unordered' } },
            image: {
                class: ImageTool,
                config: {
                    uploader: {
                        uploadByFile(file) {
                            return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = (e) => resolve({ success: 1, file: { url: e.target.result } });
                                reader.readAsDataURL(file);
                            });
                        },
                        uploadByUrl(url) { return Promise.resolve({ success: 1, file: { url: url } }); }
                    }
                }
            },
            quote: Quote,
            table: Table
        },
        data: currentContent || DEFAULT_CONTENT,
        readOnly: true,
        placeholder: 'Loading wiki content...',
        onChange: () => {
            if (isEditMode) scheduleAutosave();
        }
    });
}

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        if (isEditMode && editor) {
            editor.save().then(savedData => {
                saveContentToFirebase(savedData);
            }).catch(e => console.error("Save error", e));
        }
    }, 5000);
}

// ===== EDIT MODE TOGGLE =====
function toggleEditMode() {
    if (!canEdit) {
        alert("You don't have permission to edit. Use ?edit=true or ?admin=1234 in the URL.");
        return;
    }
    if (wikiLocked && !isAdmin) {
        showUnlockModal();
        return;
    }
    
    isEditMode = !isEditMode;
    if (editor) editor.readOnly.toggle();
    
    const editBtn = document.getElementById('editBtn');
    if (isEditMode) {
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg> Save`;
        editBtn.style.background = 'var(--success-green)';
    } else {
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`;
        editBtn.style.background = 'var(--primary-blue)';
        // Save current edits before leaving edit mode
        if (editor) {
            editor.save().then(savedData => saveContentToFirebase(savedData));
        }
    }
}

// ===== SETTINGS UI =====
function showSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('active');
    
    // Generate links
    const baseUrl = window.location.origin + window.location.pathname;
    document.getElementById('editLinkDisplay').value = `${baseUrl}?edit=true`;
    if (isAdmin) {
        document.getElementById('adminLinkGroup').style.display = 'flex';
        document.getElementById('generateAdminLinkBtn').style.display = 'inline-block';
        document.getElementById('lockSection').style.display = 'block';
        document.getElementById('adminLinkDisplay').value = `${baseUrl}?admin=1234`;
    } else {
        document.getElementById('adminLinkGroup').style.display = 'none';
        document.getElementById('generateAdminLinkBtn').style.display = 'none';
        document.getElementById('lockSection').style.display = 'none';
    }
    updateLockStatusUI();
    updateStats();
}

function hideSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function updateLockStatusUI() {
    const lockStatusDiv = document.getElementById('lockStatus');
    if (lockStatusDiv) {
        lockStatusDiv.innerHTML = wikiLocked 
            ? '<span class="status-indicator locked"></span><span>Locked</span>'
            : '<span class="status-indicator unlocked"></span><span>Unlocked</span>';
    }
}

function copyToClipboard(text, buttonElement) {
    navigator.clipboard.writeText(text).then(() => {
        const original = buttonElement.textContent;
        buttonElement.textContent = 'Copied!';
        setTimeout(() => buttonElement.textContent = original, 2000);
    }).catch(() => alert('Failed to copy'));
}

function generateEditorLink() {
    // Just show the link again; no token change needed (permission is public via ?edit=true)
    const baseUrl = window.location.origin + window.location.pathname;
    document.getElementById('editLinkDisplay').value = `${baseUrl}?edit=true`;
    alert("Editor link is always the same. Copy it from the field.");
}

function generateAdminLink() {
    if (!isAdmin) {
        alert("Only admin can generate admin link.");
        return;
    }
    const baseUrl = window.location.origin + window.location.pathname;
    document.getElementById('adminLinkDisplay').value = `${baseUrl}?admin=1234`;
    alert("Admin link copied. You can change the password in the code if needed.");
}

async function lockWiki() {
    if (!isAdmin) {
        alert("Only admin can lock the wiki.");
        return;
    }
    const code = document.getElementById('lockCodeInput').value.trim();
    if (!code || code.length < 4 || code.length > 8) {
        alert("Lock code must be 4-8 characters.");
        return;
    }
    await setLock(true, code);
    document.getElementById('lockCodeInput').value = '';
    alert("Wiki locked. Only admins can edit now.");
}

async function unlockWiki() {
    if (!isAdmin) {
        alert("Only admin can unlock the wiki.");
        return;
    }
    const code = document.getElementById('unlockCodeInputSettings').value.trim();
    if (!code) {
        alert("Enter the lock code to unlock.");
        return;
    }
    if (code === wikiLockCode) {
        await setLock(false, null);
        document.getElementById('unlockCodeInputSettings').value = '';
        alert("Wiki unlocked.");
    } else {
        alert("Incorrect code.");
    }
}

function showUnlockModal() {
    document.getElementById('unlockModal').classList.add('active');
}

function hideUnlockModal() {
    document.getElementById('unlockModal').classList.remove('active');
}

async function resetWiki() {
    if (!confirm("Delete ALL content and reset to default? This action cannot be undone.")) return;
    if (!confirm("Are you absolutely sure?")) return;
    await resetWikiToDefault();
    alert("Wiki has been reset.");
}

function updateStats() {
    const lastSavedEl = document.getElementById('lastSaved');
    lastSavedEl.textContent = new Date().toLocaleTimeString();
    // Content size estimation (rough)
    if (currentContent) {
        const size = new Blob([JSON.stringify(currentContent)]).size;
        const sizeKB = (size / 1024).toFixed(2);
        document.getElementById('contentSize').textContent = `${sizeKB} KB`;
    }
}

// ===== EVENT LISTENERS & INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Ensure Firestore document exists
    await getWikiDoc();
    
    // Setup real-time listener first
    setupRealtimeListener();
    
    // Initialize editor (will get content from listener later)
    initializeEditor();
    
    // UI Elements
    document.getElementById('editBtn').addEventListener('click', toggleEditMode);
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('closeSettings').addEventListener('click', hideSettings);
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') hideSettings();
    });
    document.getElementById('closeUnlockModalBtn').addEventListener('click', hideUnlockModal);
    document.getElementById('unlockModal').addEventListener('click', (e) => {
        if (e.target.id === 'unlockModal') hideUnlockModal();
    });
    
    document.getElementById('copyEditLinkBtn').addEventListener('click', () => {
        copyToClipboard(document.getElementById('editLinkDisplay').value, document.getElementById('copyEditLinkBtn'));
    });
    if (document.getElementById('copyAdminLinkBtn')) {
        document.getElementById('copyAdminLinkBtn').addEventListener('click', () => {
            copyToClipboard(document.getElementById('adminLinkDisplay').value, document.getElementById('copyAdminLinkBtn'));
        });
    }
    document.getElementById('generateEditorLinkBtn').addEventListener('click', generateEditorLink);
    if (document.getElementById('generateAdminLinkBtn')) {
        document.getElementById('generateAdminLinkBtn').addEventListener('click', generateAdminLink);
    }
    document.getElementById('lockWikiBtn').addEventListener('click', lockWiki);
    document.getElementById('unlockWikiBtn').addEventListener('click', unlockWiki);
    document.getElementById('clearDataBtn').addEventListener('click', resetWiki);
    
    // Set created year
    document.getElementById('createdDate').textContent = new Date().getFullYear();
    
    // Show permission info in console
    console.log(`MakeUrWiki - Real-time mode | Admin: ${isAdmin} | Editor: ${isEditor} | Can Edit: ${canEdit}`);
    if (!canEdit) console.warn("View-only mode. Add ?edit=true or ?admin=1234 to edit.");
});
