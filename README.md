# FLMS - File & Lead Movement System PWA

This is a complete static Progressive Web App for tracking file/loan movement from lead generation to disbursement and post-disbursement compliance.

## Important Storage Note

This version is made for **GitHub Pages static hosting**. Because GitHub Pages cannot run a backend database, this app stores data in the browser using `localStorage`.

That means:

- It works immediately after upload to GitHub Pages.
- It works offline after first load.
- Data stays on the same browser/device.
- Use **Backup & Restore** to move data between devices.
- For real multi-user cloud sync, connect Firebase Auth + Firestore later.

## Default Login

Admin:

- Email: `admin@flms.local`
- Password: `Admin@12345`

Other demo users:

- Manager: `manager@flms.local` / `Manager@123`
- User: `user@flms.local` / `User@123`

## Features

- Admin login
- Role-based access: Admin, Manager, User
- Admin master setup:
  - Users
  - Branches
  - Products
  - Lead sources
  - File stages
  - Required documents
  - Compliance parameters
  - Pending reasons
- Lead creation and editing
- File movement stage timeline
- Permanent audit logs
- Document checklist
- Disbursement details
- Post-disbursement compliance checklist
- Dashboard cards
- Stage-wise movement view
- Reports
- CSV export
- Backup and restore JSON
- Installable PWA
- Service worker offline cache
- Mobile-first responsive UI

## GitHub Pages Deployment

1. Create a new GitHub repository, for example: `flms-pwa`.
2. Upload all files from this folder to the repository root.
3. Go to repository **Settings**.
4. Open **Pages**.
5. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
6. Save.
7. Open your GitHub Pages URL:

```text
https://your-username.github.io/flms-pwa/
```

## File Structure

```text
index.html
styles.css
app.js
manifest.webmanifest
service-worker.js
icons/icon-192.png
icons/icon-512.png
README.md
```

## Convert to Firebase Later

For real multi-user use, add:

- Firebase Authentication
- Cloud Firestore
- Firestore Security Rules
- Firebase Storage or Google Drive integration for documents

Recommended Firebase collections:

```text
users
branches
products
leadSources
stages
documents
complianceParams
pendingReasons
leads
movements
leadDocuments
disbursements
complianceRecords
auditLogs
```
