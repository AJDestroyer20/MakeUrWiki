// app.js - Wiki with proposals, GitHub storage, admin moderation, dark mode, invite tokens

// ==================== CONFIGURATION ====================
let currentRepoOwner = "";
let currentRepoName = "";

const STORAGE_KEYS = {
    WIKI_BACKUP: "wiki_backup_content",
    PROPOSALS_BACKUP: "wiki_proposals_backup",
    GITHUB_TOKEN: "gh_token",
    ADMIN_AUTH: "admin_authenticated",
    ADMIN_PASSWORD: "admin_password",
    AUTHOR_NAME: "wiki_author",
    THEME: "wiki_theme",
    INVITE_TOKEN: "invite_token"
};

const DEFAULT_ADMIN_PASSWORD = "admin";
const WIKI_FILE_PATH = "data/wiki.json";
const PROPOSALS_FILE_PATH = "data/proposals.json";

// Global state
let editor = null;
let isEditMode = false;
let autosaveTimer = null;
let currentContent = null;
let currentProposals = [];
let isAdmin = false;
let authorName = "Anonymous";
let githubToken = "";
let lastSavedContentHash = "";
let hasEditPermission = false;  // due to invite token or admin

// ==================== UTILITIES ====================
function generateId() {
    return Date.now() + "-" + Math.random().toString(36).substr(2, 6);
}

function getRepoInfo() {
    const hostname = window.location.hostname;
    if (hostname.includes("github.io")) {
        const parts = hostname.split(".");
        if (parts[0] !== "github") {
            currentRepoOwner = parts[0];
            const path = window.location.pathname.split("/")[1];
            currentRepoName = path || "";
        }
    }
    if (!currentRepoOwner) {
        currentRepoOwner = prompt("Enter GitHub username/organization:", "your-username");
    }
    if (!currentRepoName) {
        currentRepoName = prompt("Enter repository name:", "your-wiki");
    }
}

function getRawUrl(path) {
    return `https://raw.githubusercontent.com/${currentRepoOwner}/${currentRepoName}/main/${path}`;
}

function getApiUrl(path) {
    return `https://api.github.com/repos/${currentRepoOwner}/${currentRepoName}/contents/${path}`;
}

async function getFileSHA(path, token) {
    const url = getApiUrl(path);
    const response = await fetch(url, {
        headers: { Authorization: `token ${token}` }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to get SHA: ${response.status}`);
    const data = await response.json();
    return data.sha;
}

async function saveToGitHub(path, content, commitMessage, token) {
    const sha = await getFileSHA(path, token);
    const url = getApiUrl(path);
    const body = {
        message: commitMessage,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        branch: "main"
    };
    if (sha) body.sha = sha;
    const response = await fetch(url, {
        method: "PUT",
        headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`GitHub save failed: ${response.status}`);
    return await response.json();
}

async function loadFromGitHub(path, token) {
    const url = getRawUrl(path);
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
    const text = await response.text();
    return JSON.parse(text);
}

// ==================== INVITE TOKEN SYSTEM ====================
function generateInviteToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
}

function getInviteToken() {
    let token = localStorage.getItem(STORAGE_KEYS.INVITE_TOKEN);
    if (!token) {
        token = generateInviteToken();
        localStorage.setItem(STORAGE_KEYS.INVITE_TOKEN, token);
    }
    return token;
}

function setInviteToken(newToken) {
    localStorage.setItem(STORAGE_KEYS.INVITE_TOKEN, newToken);
}

function checkInvitePermission() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const storedToken = getInviteToken();
    if (urlToken && urlToken === storedToken) {
        return true;
    }
    return false;
}

function getInviteLink() {
    const baseUrl = window.location.origin + window.location.pathname;
    const token = getInviteToken();
    return `${baseUrl}?token=${token}`;
}

// ==================== INITIAL CONTENT ====================
const DEFAULT_CONTENT = {
    time: Date.now(),
    blocks: [
        { type: "header", data: { text: "Welcome to MakeUrWiki", level: 1 } },
        { type: "paragraph", data: { text: "This is a community wiki where anyone can propose edits. Changes are reviewed by admins before going live." } },
        { type: "header", data: { text: "How it works", level: 2 } },
        { type: "list", data: { style: "unordered", items: ["Click Edit to propose changes", "Your edits become a proposal", "Admin approves or rejects", "All data stored in GitHub"] } },
        { type: "header", data: { text: "Getting Started", level: 2 } },
        { type: "paragraph", data: { text: "Use the <strong>Settings</strong> to configure GitHub token, login as admin, or generate an invite link to allow others to edit." } },
        { type: "quote", data: { text: "Together we build knowledge.", caption: "MakeUrWiki", alignment: "left" } }
    ]
};

// ==================== LOAD CONTENT ====================
async function loadWikiContent() {
    if (githubToken) {
        try {
            const data = await loadFromGitHub(WIKI_FILE_PATH, githubToken);
            if (data && data.blocks) {
                currentContent = data;
                localStorage.setItem(STORAGE_KEYS.WIKI_BACKUP, JSON.stringify(data));
                return data;
            }
        } catch(e) { console.warn("GitHub load failed", e); }
    }
    const local = localStorage.getItem(STORAGE_KEYS.WIKI_BACKUP);
    if (local) {
        try {
            currentContent = JSON.parse(local);
            return currentContent;
        } catch(e) {}
    }
    currentContent = DEFAULT_CONTENT;
    return currentContent;
}

async function loadProposals() {
    let proposals = [];
    if (githubToken) {
        try {
            const data = await loadFromGitHub(PROPOSALS_FILE_PATH, githubToken);
            if (Array.isArray(data)) proposals = data;
        } catch(e) { console.warn("Failed to load proposals from GitHub", e); }
    }
    const localProposals = localStorage.getItem(STORAGE_KEYS.PROPOSALS_BACKUP);
    if (localProposals) {
        try {
            const local = JSON.parse(localProposals);
            const merged = [...proposals];
            for (const p of local) {
                if (!merged.some(m => m.id === p.id)) merged.push(p);
            }
            proposals = merged;
        } catch(e) {}
    }
    currentProposals = proposals;
    updateProposalsCount();
    return proposals;
}

async function saveProposalToGitHub(proposal) {
    if (!githubToken) return false;
    try {
        let proposals = [...currentProposals];
        const existingIndex = proposals.findIndex(p => p.id === proposal.id);
        if (existingIndex >= 0) proposals[existingIndex] = proposal;
        else proposals.push(proposal);
        await saveToGitHub(PROPOSALS_FILE_PATH, proposals, `Add proposal ${proposal.id}`, githubToken);
        currentProposals = proposals;
        localStorage.setItem(STORAGE_KEYS.PROPOSALS_BACKUP, JSON.stringify(proposals));
        updateProposalsCount();
        return true;
    } catch(e) {
        console.error("Failed to save proposal to GitHub", e);
        const backup = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROPOSALS_BACKUP) || "[]");
        backup.push(proposal);
        localStorage.setItem(STORAGE_KEYS.PROPOSALS_BACKUP, JSON.stringify(backup));
        return false;
    }
}

async function approveProposal(proposalId) {
    const proposal = currentProposals.find(p => p.id === proposalId);
    if (!proposal) return false;
    if (!githubToken) { alert("GitHub token required to approve"); return false; }
    try {
        await saveToGitHub(WIKI_FILE_PATH, proposal.content, `Approve proposal ${proposalId}`, githubToken);
        const updated = currentProposals.filter(p => p.id !== proposalId);
        await saveToGitHub(PROPOSALS_FILE_PATH, updated, `Remove approved proposal ${proposalId}`, githubToken);
        currentProposals = updated;
        localStorage.setItem(STORAGE_KEYS.PROPOSALS_BACKUP, JSON.stringify(updated));
        currentContent = proposal.content;
        localStorage.setItem(STORAGE_KEYS.WIKI_BACKUP, JSON.stringify(proposal.content));
        if (editor && !isEditMode) editor.render(proposal.content);
        updateProposalsCount();
        return true;
    } catch(e) {
        alert("Failed to approve: " + e.message);
        return false;
    }
}

async function rejectProposal(proposalId) {
    if (!githubToken) { alert("GitHub token required to reject"); return false; }
    try {
        const updated = currentProposals.filter(p => p.id !== proposalId);
        await saveToGitHub(PROPOSALS_FILE_PATH, updated, `Reject proposal ${proposalId}`, githubToken);
        currentProposals = updated;
        localStorage.setItem(STORAGE_KEYS.PROPOSALS_BACKUP, JSON.stringify(updated));
        updateProposalsCount();
        return true;
    } catch(e) {
        alert("Failed to reject: " + e.message);
        return false;
    }
}

async function createProposal(content) {
    const proposal = {
        id: generateId(),
        content: content,
        author: authorName,
        date: new Date().toISOString()
    };
    const saved = await saveProposalToGitHub(proposal);
    if (!saved) {
        alert("Proposal saved locally only. Check GitHub token settings.");
    } else {
        console.log("Proposal saved to GitHub");
    }
}

// ==================== EDITOR AUTO-SAVE ====================
function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
        if (isEditMode && editor && !editor.readOnly) {
            const data = await editor.save();
            const contentHash = JSON.stringify(data);
            if (contentHash !== lastSavedContentHash) {
                await createProposal(data);
                lastSavedContentHash = contentHash;
                updateStats();
            }
        }
    }, 5000);
}

// ==================== EDIT MODE ====================
async function toggleEditMode() {
    if (!hasEditPermission && !isAdmin) {
        alert("You don't have permission to edit. Ask the admin for an invite link.");
        return;
    }
    if (!isEditMode) {
        lastSavedContentHash = JSON.stringify(currentContent);
        isEditMode = true;
        if (editor) editor.readOnly = false;
        const editBtn = document.getElementById('editBtn');
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg> Save`;
        editBtn.style.background = 'var(--success-green)';
    } else {
        if (editor && !editor.readOnly) {
            const data = await editor.save();
            await createProposal(data);
            lastSavedContentHash = JSON.stringify(data);
        }
        isEditMode = false;
        if (editor) editor.readOnly = true;
        const editBtn = document.getElementById('editBtn');
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`;
        editBtn.style.background = 'var(--primary-blue)';
    }
}

// ==================== UI HELPERS ====================
function updateStats() {
    const lastSavedEl = document.getElementById('lastSaved');
    if (lastSavedEl) lastSavedEl.textContent = new Date().toLocaleTimeString();
    if (currentContent) {
        const size = new Blob([JSON.stringify(currentContent)]).size;
        const sizeEl = document.getElementById('contentSize');
        if (sizeEl) sizeEl.textContent = (size / 1024).toFixed(2) + " KB";
    }
}

function updateProposalsCount() {
    const countEl = document.getElementById('proposalsCount');
    if (countEl) countEl.textContent = currentProposals.length;
}

function updateAdminUI() {
    const reviewBtn = document.getElementById('reviewProposalsBtn');
    const logoutBtn = document.getElementById('logoutAdminBtn');
    const loginBtn = document.getElementById('loginAdminBtn');
    const adminStatus = document.getElementById('adminStatus');
    if (isAdmin) {
        if (reviewBtn) reviewBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (loginBtn) loginBtn.style.display = 'none';
        if (adminStatus) adminStatus.textContent = "Admin mode active";
        // Admin always sees edit button
        document.getElementById('editBtn').style.display = 'flex';
    } else {
        if (reviewBtn) reviewBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (adminStatus) adminStatus.textContent = "Not logged in as admin";
        // If not admin, edit button visibility depends on invite token
        if (hasEditPermission) {
            document.getElementById('editBtn').style.display = 'flex';
        } else {
            document.getElementById('editBtn').style.display = 'none';
        }
    }
}

// ==================== DARK MODE ====================
function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
    } else {
        document.body.classList.remove('dark');
    }
    updateThemeIcon();
}

function toggleTheme() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isDark = document.body.classList.contains('dark');
    btn.innerHTML = isDark ? 
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>` :
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

// ==================== ADMIN PANEL ====================
async function showProposalsModal() {
    await loadProposals();
    const modal = document.getElementById('proposalsModal');
    const container = document.getElementById('proposalsList');
    if (!container) return;
    if (currentProposals.length === 0) {
        container.innerHTML = '<p>No pending proposals.</p>';
    } else {
        container.innerHTML = currentProposals.map(prop => `
            <div class="proposal-item" data-id="${prop.id}">
                <div class="proposal-header">
                    <span><strong>${escapeHtml(prop.author)}</strong> · ${new Date(prop.date).toLocaleString()}</span>
                    <div class="proposal-actions">
                        <button class="btn-secondary preview-proposal" data-id="${prop.id}">Preview</button>
                        <button class="btn-success approve-proposal" data-id="${prop.id}">Approve</button>
                        <button class="btn-danger reject-proposal" data-id="${prop.id}">Reject</button>
                    </div>
                </div>
            </div>
        `).join('');
        document.querySelectorAll('.preview-proposal').forEach(btn => {
            btn.addEventListener('click', () => previewProposal(btn.dataset.id));
        });
        document.querySelectorAll('.approve-proposal').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (await approveProposal(btn.dataset.id)) {
                    showProposalsModal();
                    loadWikiContent().then(content => {
                        if (editor && !isEditMode) editor.render(content);
                    });
                }
            });
        });
        document.querySelectorAll('.reject-proposal').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (await rejectProposal(btn.dataset.id)) {
                    showProposalsModal();
                }
            });
        });
    }
    if (modal) modal.classList.add('active');
}

let currentPreviewId = null;
async function previewProposal(id) {
    const proposal = currentProposals.find(p => p.id === id);
    if (!proposal) return;
    currentPreviewId = id;
    const modal = document.getElementById('previewModal');
    const container = document.getElementById('previewContent');
    if (container) {
        container.innerHTML = `<pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(proposal.content, null, 2))}</pre>`;
    }
    if (modal) modal.classList.add('active');
}

document.getElementById('approveProposalBtn')?.addEventListener('click', async () => {
    if (currentPreviewId && await approveProposal(currentPreviewId)) {
        document.getElementById('previewModal')?.classList.remove('active');
        showProposalsModal();
        loadWikiContent().then(content => {
            if (editor && !isEditMode) editor.render(content);
        });
    }
});
document.getElementById('rejectProposalBtn')?.addEventListener('click', async () => {
    if (currentPreviewId && await rejectProposal(currentPreviewId)) {
        document.getElementById('previewModal')?.classList.remove('active');
        showProposalsModal();
    }
});

// ==================== EXPORT / IMPORT ====================
function exportWiki() {
    if (!currentContent) return;
    const dataStr = JSON.stringify(currentContent, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wiki_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importWiki(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.blocks) {
                await createProposal(imported);
                alert("Import created as a proposal. Admin must approve.");
                if (editor && isEditMode) {
                    editor.render(imported);
                }
            } else {
                alert("Invalid wiki format");
            }
        } catch(err) {
            alert("Failed to parse JSON");
        }
    };
    reader.readAsText(file);
}

// ==================== INITIALIZE EDITOR ====================
async function initializeEditor() {
    const content = await loadWikiContent();
    editor = new EditorJS({
        holder: 'contentArea',
        tools: {
            header: { class: Header, config: { placeholder: 'Enter title...', levels: [1,2,3], defaultLevel: 2 } },
            paragraph: { class: Paragraph, inlineToolbar: true, config: { placeholder: 'Write something...' } },
            list: { class: List, inlineToolbar: true },
            image: { class: ImageTool, config: { uploader: { uploadByFile(file) { return new Promise(resolve => { const reader = new FileReader(); reader.onload = e => resolve({ success: 1, file: { url: e.target.result } }); reader.readAsDataURL(file); }); }, uploadByUrl(url) { return Promise.resolve({ success:1, file:{url} }); } } } },
            quote: Quote,
            table: Table
        },
        data: content,
        readOnly: true,
        onChange: () => scheduleAutosave()
    });
}

// ==================== EVENT LISTENERS & INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
    getRepoInfo();
    initTheme();
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    
    githubToken = localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) || "";
    const tokenInput = document.getElementById('githubToken');
    if (tokenInput && githubToken) tokenInput.value = "********";
    
    const adminAuth = localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) === "true";
    const storedAdminPwd = localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD);
    if (adminAuth && storedAdminPwd === DEFAULT_ADMIN_PASSWORD) isAdmin = true;
    
    // Check invite permission
    hasEditPermission = checkInvitePermission();
    
    authorName = localStorage.getItem(STORAGE_KEYS.AUTHOR_NAME) || "Anonymous";
    const authorInput = document.getElementById('authorName');
    if (authorInput) authorInput.value = authorName;
    
    await initializeEditor();
    await loadProposals();
    updateAdminUI();
    updateStats();
    
    // Display invite link in settings if admin
    if (isAdmin) {
        const inviteInput = document.getElementById('inviteLinkDisplay');
        if (inviteInput) inviteInput.value = getInviteLink();
    }
    
    const editBtn = document.getElementById('editBtn');
    if (editBtn) editBtn.addEventListener('click', toggleEditMode);
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => document.getElementById('settingsModal')?.classList.add('active'));
    const closeSettings = document.getElementById('closeSettings');
    if (closeSettings) closeSettings.addEventListener('click', () => document.getElementById('settingsModal')?.classList.remove('active'));
    const closeProposals = document.getElementById('closeProposals');
    if (closeProposals) closeProposals.addEventListener('click', () => document.getElementById('proposalsModal')?.classList.remove('active'));
    const closePreview = document.getElementById('closePreview');
    if (closePreview) closePreview.addEventListener('click', () => document.getElementById('previewModal')?.classList.remove('active'));
    
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    if (saveTokenBtn) saveTokenBtn.addEventListener('click', () => {
        const token = document.getElementById('githubToken')?.value;
        if (token && token !== "********") {
            githubToken = token;
            localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, token);
            alert("Token saved. Reload to apply.");
        }
    });
    const loginAdminBtn = document.getElementById('loginAdminBtn');
    if (loginAdminBtn) loginAdminBtn.addEventListener('click', () => {
        const pwd = document.getElementById('adminPassword')?.value;
        if (pwd === DEFAULT_ADMIN_PASSWORD) {
            isAdmin = true;
            localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, "true");
            localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, DEFAULT_ADMIN_PASSWORD);
            updateAdminUI();
            alert("Admin logged in");
            // Refresh invite link display
            const inviteInput = document.getElementById('inviteLinkDisplay');
            if (inviteInput) inviteInput.value = getInviteLink();
        } else {
            alert("Wrong password");
        }
    });
    const logoutAdminBtn = document.getElementById('logoutAdminBtn');
    if (logoutAdminBtn) logoutAdminBtn.addEventListener('click', () => {
        isAdmin = false;
        localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
        updateAdminUI();
        alert("Admin logged out");
    });
    const saveAuthorBtn = document.getElementById('saveAuthorBtn');
    if (saveAuthorBtn) saveAuthorBtn.addEventListener('click', () => {
        authorName = document.getElementById('authorName')?.value.trim() || "Anonymous";
        localStorage.setItem(STORAGE_KEYS.AUTHOR_NAME, authorName);
        alert("Author name saved");
    });
    const exportBtn = document.getElementById('exportWikiBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportWiki);
    const importBtn = document.getElementById('importWikiBtn');
    if (importBtn) importBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput && fileInput.files.length) importWiki(fileInput.files[0]);
        else alert("Select a JSON file");
    });
    const reviewBtn = document.getElementById('reviewProposalsBtn');
    if (reviewBtn) reviewBtn.addEventListener('click', showProposalsModal);
    
    const generateInviteBtn = document.getElementById('generateInviteTokenBtn');
    if (generateInviteBtn) {
        generateInviteBtn.addEventListener('click', () => {
            if (!isAdmin) {
                alert("Only admin can generate invite links.");
                return;
            }
            const newToken = generateInviteToken();
            setInviteToken(newToken);
            const inviteInput = document.getElementById('inviteLinkDisplay');
            if (inviteInput) inviteInput.value = getInviteLink();
            alert("New invite link generated. Old links will no longer work.");
        });
    }
    const copyInviteBtn = document.getElementById('copyInviteLinkBtn');
    if (copyInviteBtn) {
        copyInviteBtn.addEventListener('click', () => {
            const link = document.getElementById('inviteLinkDisplay')?.value;
            if (link) {
                navigator.clipboard.writeText(link);
                alert("Invite link copied to clipboard!");
            }
        });
    }
    
    const createdDate = document.getElementById('createdDate');
    if (createdDate) createdDate.textContent = new Date().getFullYear();
    const wikiStatus = document.getElementById('wikiStatus');
    if (wikiStatus) wikiStatus.textContent = "Active";
    const editorsCount = document.getElementById('editorsCount');
    if (editorsCount) editorsCount.textContent = "1"; // Could be dynamic later
    
    window.onclick = (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    };
});

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}