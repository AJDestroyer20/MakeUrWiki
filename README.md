
# MakeUrWiki

A complete, functional replica of Fandom/Wikipedia with a visual editor, permission system, and local persistence.

## Features

- **Faithful Fandom design**: Visually identical interface with header, sidebar, main content, and infobox
- **Full visual editor**: Powered by Editor.js with support for:
  - Headers (H1, H2, H3)
  - Formatted paragraphs
  - Ordered/unordered lists
  - Images (drag & drop)
  - Quotes
  - Tables
- **Token-based permission system**: Separate **Editor** and **Admin** links with unique tokens
- **Code lock**: Protect your wiki with a security code (admin only)
- **Auto-save**: Every 5 seconds automatically
- **100% Frontend**: No backend, works on GitHub Pages
- **Responsive**: Adapts to mobile and tablets

## Deploy to GitHub Pages

### Option 1: Upload files directly

1. **Create a new repository on GitHub**
   - Go to https://github.com/new
   - Name your repo (e.g., `my-wiki`)
   - Set to "Public"
   - Click "Create repository"

2. **Upload the files**
   - Click "uploading an existing file"
   - Drag these files:
     - `index.html`
     - `styles.css`
     - `app.js`
     - `README.md`
   - Click "Commit changes"

3. **Enable GitHub Pages**
   - Go to Settings → Pages
   - Under "Source", select "main" branch
   - Click "Save"
   - Wait 2-3 minutes

4. **Done!**
   - Your wiki will be at: `https://your-username.github.io/my-wiki/`

### Option 2: Using Git (command line)

```bash
# 1. Initialize local repository
git init

# 2. Add files
git add index.html styles.css app.js README.md

# 3. Commit
git commit -m "Initial commit: MakeUrWiki"

# 4. Connect to GitHub (replace with your URL)
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git

# 5. Push
git branch -M main
git push -u origin main
```

Then enable GitHub Pages from Settings → Pages.

## How to use

### Visitor Mode
- Browse and read content
- Use the search bar (decorative)
- Explore the sidebar

### Editor Mode
1. Click **"Edit"** (blue button top-right)
2. Make your changes
3. Click **"Save"** (the button turns green)
4. Changes are auto-saved every 5 seconds

### Sharing edit permissions
1. Click the **Settings** icon
2. Copy the **Editor Link** (anyone with it can edit)
3. Share it with anyone you want to allow editing

### Admin-only actions
- Generate a new **Admin Link** (full control)
- **Lock the wiki** with a 4-8 character code
- **Unlock** the wiki using the code

To perform admin actions, you must open the wiki using the Admin Link (generated in Settings by the original creator).

### Protecting with a lock code
1. Open **Settings** (while using an Admin Link)
2. Under "Lock Wiki", enter a code (4-8 characters)
3. Click **"Lock"**
4. Now no one can edit without entering the code
5. To unlock, enter the code and click **"Unlock"**

## Local Development

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- (Optional) Local HTTP server

### Installation

1. **Download files**
   ```bash
   git clone https://github.com/AJDestroyer20/MakeUrWiki.git
   cd MakeUrWiki
   ```

2. **Run locally**

   **Option A: HTTP server with Python**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   ```
   Then go to: `http://localhost:8000`

   **Option B: HTTP server with Node.js**
   ```bash
   npx http-server -p 8000
   ```

   **Option C: Open directly**
   - Double-click `index.html`
   - Some features may not work due to CORS restrictions

   **Then just start making your wiki**

## Project structure

```
makeurwiki/
│
├── index.html          # Main HTML structure
├── styles.css          # CSS styles (Fandom-like design)
├── app.js              # JavaScript logic (editor, tokens, lock)
└── README.md           # This documentation
```

## Technical Architecture

### Frontend
- **HTML5**: Semantic structure
- **CSS3**: CSS Variables, Grid, Flexbox
- **JavaScript (Vanilla)**: No frameworks

### Editor
- **Editor.js**: Modular block editor
- Plugins: Header, Paragraph, List, Image, Quote, Table

### Persistence
- **localStorage**: Browser local storage
- Saved data:
  - Article content (JSON)
  - Editor token
  - Admin token
  - Lock code (if set)

### Token System
```javascript
// Generate unique token
function generateToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// Editor link: https://your-wiki.com/?token=ABC123XYZ
// Admin link:  https://your-wiki.com/?token=DEF456UVW
```

### Security
- Tokens are randomly generated
- Lock code is stored locally
- No backend, so no exposed database
- **Note**: localStorage is accessible via JavaScript; do not use for real sensitive data

## Customization

### Change colors
Edit CSS variables in `styles.css`:

```css
:root {
    --primary-blue: #002A8F;      /* Primary color */
    --accent-blue: #0969DA;       /* Accent color */
    --bg-page: #F8F9FA;           /* Page background */
    /* ... more variables ... */
}
```

### Change logo
Edit the SVG in `index.html` line ~18:

```html
<div class="logo">
    <svg><!-- Your logo here --></svg>
    <span>YourName</span>
</div>
```

### Change initial content
Edit `INITIAL_CONTENT` in `app.js` line ~80.

### Change infobox image
Replace the URL in `index.html` line ~113:

```html
<img id="infoboxImage" src="YOUR_IMAGE_HERE.jpg" alt="...">
```

## Common Issues

### "I can't edit"
- Make sure you are using a link with `?token=...`
- Verify the token is correct (editor or admin)
- Check if the wiki is locked (needs code)

### "My changes are not saved"
- Ensure localStorage is enabled in your browser
- Check the browser console (F12) for errors
- Make sure you have enough space (localStorage ~5-10MB)

### "I lost my lock code"
- There is no way to recover it
- Workaround: Open console (F12) and run:
  ```javascript
  localStorage.removeItem('lockCode')
  ```

### "I want to reset everything"
- Use the "Clear All Data" button in Settings
- Or in console: `localStorage.clear()`

## Roadmap / Future Ideas

- Cloud sync (Firebase/Supabase)
- Version history
- Real-time collaboration with WebSockets
- Export to PDF/Markdown
- Dark/light theme
- More Editor.js plugins
- Category system
- Functional search

## License

MIT License - Feel free to use, modify, and distribute.

## Contributions

Contributions are welcome! If you find bugs or have ideas:

1. Fork the project
2. Create a branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Contact

Questions? Suggestions? Open an Issue on GitHub.

---

Made with love and lots of coffee | 2025
```
