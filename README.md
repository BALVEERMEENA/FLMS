# FLMS - File & Lead Movement System PWA

This is a complete static Progressive Web App for tracking loan/file movement from lead generation to disbursement and post-disbursement compliance.

## Latest Modification Included

This revised version includes the requested admin rights and delete-approval workflow, plus the earlier branch/DST/DSA sourcing and critical monitoring changes:

- **Reset Demo Data option removed** from Backup & Restore.
- **Admin-controlled user rights** added in Admin → Users. Admin can decide each user permission such as create lead, edit lead, assign lead, move stage, update documents, save disbursement, update compliance, view reports, export data, backup/restore, and request deletion.
- **Direct lead delete removed for users.** Users can only send a delete request with reason.
- **Admin delete approval workflow added** in Admin → Delete Requests. Lead is deleted only after authorized admin approval.
- Admin can reject delete requests with rejection reason.
- Delete request, approval, and rejection are recorded in Audit Logs.

Earlier critical-stage changes included:

- Lead sources changed to:
  - Branch Generated
  - DST
  - DSA
  - Other
- Conditional source-name field:
  - Branch Generated → Branch Employee Name
  - DST → DST Name
  - DSA → DSA Name
  - Other → Other Source Name
- Required lead monitoring fields:
  - Processing Team Name
  - Valuer Name
  - Advocate Name
  - PSIR Person Name
- Separate critical stages:
  - PSIR
  - Valuation
  - Technical
  - Legal
- Every file stage movement now records:
  - Assigned / Allotted Date
  - Received Date
- File detail page has a Critical Monitoring section for PSIR, Valuation, Technical, and Legal.
- CSV reports include source detail, processing team, valuer, advocate, PSIR person, and critical stage assigned/received dates.

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
- Role-based access with admin-controlled permissions
- Admin delete approval queue for lead deletion
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
- Backup and restore JSON, permission-controlled
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
