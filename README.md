# MakeUrWiki - Real-time Collaborative Wiki

A fully functional, real-time wiki with a Fandom/Wikipedia-like design, powered by Firebase Firestore. Multiple users can edit simultaneously, and permissions are managed via URL parameters.

## Features

- **Real-time sync**: Changes appear instantly for all viewers
- **Permission links**: 
  - `?edit=true` → Editor access (can edit when wiki is unlocked)
  - `?admin=1234` → Admin access (full control, can lock/unlock)
- **Lock system**: Admin can set a code to prevent non-admin edits
- **Visual editor**: Powered by Editor.js (headers, paragraphs, lists, images, quotes, tables)
- **Auto-save**: Content saved every 5 seconds
- **Cloud storage**: All data stored in Firebase Firestore
- **Responsive design**: Works on desktop, tablet, and mobile
- **100% frontend**: Host on GitHub Pages, Netlify, or any static host

## Setup Firebase (Required)

1. **Create a Firebase project** at https://console.firebase.google.com/
2. **Enable Firestore Database** in test mode (or production with proper rules)
3. **Register your web app** in Firebase → Project settings → General → Your apps
4. **Copy the firebaseConfig** object (apiKey, authDomain, projectId, etc.)
5. **Paste it into `app.js`** replacing the placeholder `firebaseConfig`

### Firestore Security Rules (recommended for production)
rules_version = '2';
service cloud.firestore {
match /databases/{database}/documents {
match /wikis/{document} {
allow read: if true;
allow write: if request.auth == null; // Change to authenticated if needed
}
}
}

text

For simple public wikis, allow all reads/writes (test mode).

## Deploy to GitHub Pages

1. **Create a repository** on GitHub (public)
2. **Upload files**: `index.html`, `styles.css`, `app.js`, `README.md`
3. **Go to Settings → Pages** → Source: `main` branch → Save
4. Your wiki will be live at `https://your-username.github.io/repo-name/`

## Usage

### Visitor (read-only)
Open the base URL. No edit button will work.

### Editor
Add `?edit=true` to the URL. Example:  
`https://your-wiki.com/?edit=true`  
Anyone with this link can edit when the wiki is unlocked.

### Admin
Add `?admin=1234` to the URL. Example:  
`https://your-wiki.com/?admin=1234`  
Admin can:
- Edit even when locked
- Lock/unlock the wiki with a code
- Generate shareable editor/admin links

### Locking the wiki
1. Open the wiki with admin link
2. Click Settings (⚙️) → Lock Wiki
3. Enter a 4-8 character code and click Lock
4. Now only admin can edit. Editors will be blocked.

### Unlocking
Admin can unlock using the same code in the settings.

## Local Development

Run a local HTTP server (Firebase requires `http://localhost` or HTTPS):

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server -p 8000
Open http://localhost:8000

Project Structure
text
makeurwiki/
├── index.html      # Main UI structure
├── styles.css      # Fandom-like styling
├── app.js          # Firebase logic, editor, permissions
└── README.md       # Documentation
Customization
Change admin password: Edit isAdmin check in app.js (line ~15)

Change default content: Modify DEFAULT_CONTENT in app.js

Styling: Edit styles.css (CSS variables)

Infobox image: Replace URL in index.html (line ~113)

Troubleshooting
"Firebase configuration error"
→ Make sure you replaced the placeholder config with your actual Firebase project details.

"Permission denied"
→ Check Firestore rules; for testing set to allow read, write: if true;

"Editor not loading"
→ Open browser console (F12) for errors. Ensure all CDN scripts are reachable.

"Changes not saving"
→ Check that you are using ?edit=true or ?admin=1234 and that the wiki is unlocked (or you are admin).

License
WTFPL –  Do What The Fuck You Want To Public License.

Made with Firebase and Editor.js | 2025
