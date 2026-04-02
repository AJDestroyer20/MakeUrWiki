// ===== GLOBAL CONFIGURATION =====
const CONFIG = {
    STORAGE_KEY: 'wikiContent',
    ADMIN_TOKEN_KEY: 'adminToken',
    EDIT_TOKEN_KEY: 'editToken',
    LOCK_KEY: 'lockCode',
    AUTOSAVE_INTERVAL: 5000,
};

// ===== UTILITIES =====
function generateToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// Token management
function getAdminToken() {
    let token = localStorage.getItem(CONFIG.ADMIN_TOKEN_KEY);
    if (!token) {
        token = generateToken();
        localStorage.setItem(CONFIG.ADMIN_TOKEN_KEY, token);
    }
    return token;
}

function getEditToken() {
    let token = localStorage.getItem(CONFIG.EDIT_TOKEN_KEY);
    if (!token) {
        token = generateToken();
        localStorage.setItem(CONFIG.EDIT_TOKEN_KEY, token);
    }
    return token;
}

function setEditToken(newToken) {
    localStorage.setItem(CONFIG.EDIT_TOKEN_KEY, newToken);
}

function setAdminToken(newToken) {
    localStorage.setItem(CONFIG.ADMIN_TOKEN_KEY, newToken);
}

// Permission check from URL token
let isAdmin = false;
let canEdit = false;

function checkPermissionsFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const adminToken = getAdminToken();
    const editToken = getEditToken();
    
    if (urlToken) {
        if (urlToken === adminToken) {
            isAdmin = true;
            canEdit = true;
        } else if (urlToken === editToken) {
            isAdmin = false;
            canEdit = true;
        } else {
            isAdmin = false;
            canEdit = false;
        }
    } else {
        // No token in URL – only allow if we are the creator (no tokens exist yet)
        // But tokens always exist after first run. For first run, treat as admin.
        const hasAnyToken = localStorage.getItem(CONFIG.ADMIN_TOKEN_KEY) !== null;
        if (!hasAnyToken) {
            // First run: generate tokens and treat this session as admin
            getAdminToken();
            getEditToken();
            isAdmin = true;
            canEdit = true;
        } else {
            isAdmin = false;
            canEdit = false;
        }
    }
}

function isLocked() {
    const lockCode = localStorage.getItem(CONFIG.LOCK_KEY);
    return lockCode !== null && lockCode !== '';
}

function verifyLockCode(code) {
    const storedCode = localStorage.getItem(CONFIG.LOCK_KEY);
    return code === storedCode;
}

function setLockCode(code) {
    if (code && code.length >= 4 && code.length <= 8) {
        localStorage.setItem(CONFIG.LOCK_KEY, code);
        return true;
    }
    return false;
}

function removeLock() {
    localStorage.removeItem(CONFIG.LOCK_KEY);
}

function getEditLink() {
    const token = getEditToken();
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?token=${token}`;
}

function getAdminLink() {
    const token = getAdminToken();
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?token=${token}`;
}

// ===== APPLICATION STATE =====
let editor = null;
let isEditMode = false;
let autosaveTimer = null;

// ===== INITIAL CONTENT (English) =====
const INITIAL_CONTENT = {
    time: Date.now(),
    blocks: [
        {
            type: "header",
            data: {
                text: "Welcome to MakeUrWiki",
                level: 1
            }
        },
        {
            type: "paragraph",
            data: {
                text: "This is a fully functional wiki with a Fandom-like design. You can edit this content using the <strong>Edit</strong> button at the top."
            }
        },
        {
            type: "header",
            data: {
                text: "Features",
                level: 2
            }
        },
        {
            type: "list",
            data: {
                style: "unordered",
                items: [
                    "Full visual editor with Editor.js",
                    "Token-based permission system (Editor & Admin)",
                    "Lock with security code",
                    "Auto-save every 5 seconds",
                    "Fandom/Wikipedia-like design",
                    "localStorage persistence"
                ]
            }
        },
        {
            type: "header",
            data: {
                text: "How to use?",
                level: 2
            }
        },
        {
            type: "paragraph",
            data: {
                text: "1. Click <strong>Edit</strong> to modify content<br>2. Use Settings (⚙️) to manage links and locks<br>3. Share Editor link to allow collaboration<br>4. Admin can lock the wiki and generate admin links"
            }
        },
        {
            type: "quote",
            data: {
                text: "Knowledge is power, and sharing it is wisdom.",
                caption: "Wiki proverb",
                alignment: "left"
            }
        }
    ]
};

// ===== EDITOR INITIALIZATION =====
function initializeEditor() {
    const savedData = loadContent();
    
    editor = new EditorJS({
        holder: 'contentArea',
        tools: {
            header: {
                class: Header,
                config: {
                    placeholder: 'Enter a title...',
                    levels: [1, 2, 3],
                    defaultLevel: 2
                }
            },
            paragraph: {
                class: Paragraph,
                inlineToolbar: true,
                config: {
                    placeholder: 'Write your content...'
                }
            },
            list: {
                class: List,
                inlineToolbar: true,
                config: {
                    defaultStyle: 'unordered'
                }
            },
            image: {
                class: ImageTool,
                config: {
                    uploader: {
                        uploadByFile(file) {
                            return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                    resolve({
                                        success: 1,
                                        file: { url: e.target.result }
                                    });
                                };
                                reader.readAsDataURL(file);
                            });
                        },
                        uploadByUrl(url) {
                            return Promise.resolve({
                                success: 1,
                                file: { url: url }
                            });
                        }
                    }
                }
            },
            quote: Quote,
            table: Table
        },
        data: savedData,
        readOnly: true,
        placeholder: 'Start writing your article...',
        onChange: () => scheduleAutosave()
    });
}

// ===== CONTENT MANAGEMENT =====
function loadContent() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Error loading content:', e);
        }
    }
    return INITIAL_CONTENT;
}

function saveContent() {
    if (!editor) return;
    editor.save().then((outputData) => {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(outputData));
        updateStats();
        console.log('✅ Content saved automatically');
    }).catch((error) => console.error('Error saving:', error));
}

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveContent(), CONFIG.AUTOSAVE_INTERVAL);
}

// ===== EDIT MODE TOGGLE =====
function toggleEditMode() {
    if (!canEdit) {
        alert('You do not have permission to edit. You need a valid editor or admin link.');
        return;
    }
    if (isLocked()) {
        showUnlockModal();
        return;
    }
    
    isEditMode = !isEditMode;
    if (editor) editor.readOnly.toggle();
    
    const editBtn = document.getElementById('editBtn');
    if (isEditMode) {
        editBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 13l4 4L19 7"/>
            </svg>
            Save
        `;
        editBtn.style.background = 'var(--success-green)';
    } else {
        editBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
        `;
        editBtn.style.background = 'var(--primary-blue)';
        saveContent();
    }
}

// ===== SETTINGS UI =====
function showSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('active');
    
    document.getElementById('editLinkDisplay').value = getEditLink();
    if (isAdmin) {
        document.getElementById('adminLinkGroup').style.display = 'flex';
        document.getElementById('generateAdminLinkBtn').style.display = 'inline-block';
        document.getElementById('lockSection').style.display = 'block';
        document.getElementById('adminLinkDisplay').value = getAdminLink();
    } else {
        document.getElementById('adminLinkGroup').style.display = 'none';
        document.getElementById('generateAdminLinkBtn').style.display = 'none';
        document.getElementById('lockSection').style.display = 'none';
    }
    updateLockStatus();
    updateStats();
}

function hideSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function updateLockStatus() {
    const lockStatus = document.getElementById('lockStatus');
    const locked = isLocked();
    lockStatus.innerHTML = locked 
        ? `<span class="status-indicator locked"></span><span>Locked</span>`
        : `<span class="status-indicator unlocked"></span><span>Unlocked</span>`;
}

function copyToClipboard(text, buttonElement) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = buttonElement.textContent;
        buttonElement.textContent = '✓ Copied!';
        setTimeout(() => buttonElement.textContent = originalText, 2000);
    }).catch(() => alert('Failed to copy'));
}

function generateEditorLink() {
    const newToken = generateToken();
    setEditToken(newToken);
    document.getElementById('editLinkDisplay').value = getEditLink();
    alert('New editor link generated. Previous editor links will no longer work.');
}

function generateAdminLink() {
    if (!isAdmin) {
        alert('Only admin can generate admin links.');
        return;
    }
    const newToken = generateToken();
    setAdminToken(newToken);
    document.getElementById('adminLinkDisplay').value = getAdminLink();
    alert('New admin link generated. Previous admin links will no longer work.');
}

function lockWiki() {
    if (!isAdmin) {
        alert('Only admin can lock the wiki.');
        return;
    }
    const code = document.getElementById('lockCodeInput').value.trim();
    if (!code || code.length < 4 || code.length > 8) {
        alert('Code must be 4-8 characters.');
        return;
    }
    setLockCode(code);
    document.getElementById('lockCodeInput').value = '';
    updateLockStatus();
    alert('Wiki locked. Save the code in a safe place.');
}

function unlockWiki() {
    if (!isAdmin) {
        alert('Only admin can unlock the wiki.');
        return;
    }
    const code = document.getElementById('unlockCodeInputSettings').value.trim();
    if (!code) {
        alert('Enter the lock code to unlock.');
        return;
    }
    if (verifyLockCode(code)) {
        removeLock();
        document.getElementById('unlockCodeInputSettings').value = '';
        updateLockStatus();
        alert('Wiki unlocked.');
    } else {
        alert('Incorrect code.');
    }
}

function showUnlockModal() {
    document.getElementById('unlockModal').classList.add('active');
    document.getElementById('unlockCodeInput').value = '';
    document.getElementById('unlockError').textContent = '';
}

function hideUnlockModal() {
    document.getElementById('unlockModal').classList.remove('active');
}

function attemptUnlock() {
    const code = document.getElementById('unlockCodeInput').value.trim();
    const errorEl = document.getElementById('unlockError');
    if (verifyLockCode(code)) {
        hideUnlockModal();
        toggleEditMode();
        errorEl.textContent = '';
    } else {
        errorEl.textContent = '❌ Wrong code';
    }
}

function clearAllData() {
    if (!confirm('Delete ALL content and settings? This action cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? Everything will be lost.')) return;
    localStorage.clear();
    location.reload();
}

function updateStats() {
    const lastSavedEl = document.getElementById('lastSaved');
    const contentSizeEl = document.getElementById('contentSize');
    const now = new Date();
    lastSavedEl.textContent = now.toLocaleTimeString();
    const content = localStorage.getItem(CONFIG.STORAGE_KEY) || '';
    const sizeKB = (new Blob([content]).size / 1024).toFixed(2);
    contentSizeEl.textContent = `${sizeKB} KB`;
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    checkPermissionsFromUrl();
    initializeEditor();
    
    document.getElementById('editBtn').addEventListener('click', toggleEditMode);
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('closeSettings').addEventListener('click', hideSettings);
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') hideSettings();
    });
    document.getElementById('unlockModal').addEventListener('click', (e) => {
        if (e.target.id === 'unlockModal') hideUnlockModal();
    });
    
    document.getElementById('copyEditLinkBtn').addEventListener('click', () => {
        copyToClipboard(getEditLink(), document.getElementById('copyEditLinkBtn'));
    });
    if (document.getElementById('copyAdminLinkBtn')) {
        document.getElementById('copyAdminLinkBtn').addEventListener('click', () => {
            copyToClipboard(getAdminLink(), document.getElementById('copyAdminLinkBtn'));
        });
    }
    document.getElementById('generateEditorLinkBtn').addEventListener('click', generateEditorLink);
    if (document.getElementById('generateAdminLinkBtn')) {
        document.getElementById('generateAdminLinkBtn').addEventListener('click', generateAdminLink);
    }
    document.getElementById('lockWikiBtn').addEventListener('click', lockWiki);
    document.getElementById('unlockWikiBtn').addEventListener('click', unlockWiki);
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
    
    document.getElementById('unlockBtn').addEventListener('click', attemptUnlock);
    document.getElementById('unlockCodeInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptUnlock();
    });
    
    window.addEventListener('beforeunload', () => {
        if (isEditMode) saveContent();
    });
    
    const today = new Date().getFullYear();
    document.getElementById('createdDate').textContent = today;
    
    if (!canEdit) {
        console.warn('Viewer mode – no edit permission');
    }
    console.log('MakeUrWiki initialized');
    console.log('Admin:', isAdmin, 'CanEdit:', canEdit);
});