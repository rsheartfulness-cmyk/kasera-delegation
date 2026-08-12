# Kasera Lead Tracker

This application stores Odoo CRM exports over time, avoids duplicate messages, and generates employee, tag, conversation-status, and monthly reports.

## What it does

- Uses Odoo Lead ID (id) to identify a lead permanently.
- Uses Odoo Message ID (message_ids/id) to save each follow-up only once.
- Stores every new export while ignoring Message IDs already saved.
- Combines history across old and new uploads.
- Ignores system notifications and automatic WhatsApp acknowledgements in follow-up totals.
- Classifies comments as Interested, Callback, Not Connected, Not Interested, Converted, Follow-up Sent, or Needs Review.
- Provides filters for month, employee, stage, tag, conversation status, and stale leads.
- Creates an Excel Lead Report and Monthly Summary.

## Roles

- **Admin:** creates employee logins, uploads any Odoo file, and can see all leads and reports.
- **Employee:** can upload any Odoo file. The entire file is securely imported for the admin report, but the employee can only see leads assigned to the Odoo IDs mapped to their login.

For correct employee follow-up reporting, add the Odoo Message Author field in future exports. The current user_id field reports lead ownership.

## Required Odoo fields

The supplied export already includes the two required fields:

- id
- message_ids/id

The tracker automatically recognizes:

- name
- contact_name
- email_from
- user_id
- expected_revenue
- stage_id
- phone_mobile_search
- city
- message_ids/body
- message_ids/create_date
- message_ids/message_type

Add these fields in Odoo for complete reporting:

- tag_ids/name — tags
- message_ids/author_id/name — employee who wrote the follow-up

## Local test mode

With the Firebase configuration blank, history is saved in the browser on that device. Start a local web server rather than opening index.html directly:

    cd "C:\Users\ADMIN\Downloads\odoo-note-cleaner-main (1)\odoo-note-cleaner-main"
    python -m http.server 4173

Open http://127.0.0.1:4173.

## Firebase prerequisites

The project uses Firebase Authentication, Cloud Firestore, and Cloud Functions. Enable Email/Password sign-in and create Firestore in `asia-south1` before the first deployment.

The first Firebase Authentication user signs in as `rsheartfulness@gmail.com` and selects **Activate first admin** in the live portal. This creates the protected administrator profile once only. The administrator then creates employee logins from the portal; do not manually add employee profile documents in Firestore.

The Firebase rules block direct client writes to lead, message, import, and user collections. The backend functions write validated imports and create user profiles.

## Data behavior

When the same Odoo file is uploaded again:

- Existing Message IDs are ignored.
- No follow-up count is doubled.
- Updated lead fields (stage, owner, tag, phone, city, and so on) are refreshed.
- A new activity is added only when it has a new Odoo Message ID.

For cloud deployment, use the GitHub + Cloudflare process below.

## Live deployment: GitHub + Cloudflare + Firebase

This project is designed to use three services together:

| Service | Responsibility |
| --- | --- |
| GitHub | Private source code and controlled deployment history |
| Cloudflare Pages | Public website delivery and automatic preview/live deployments |
| Firebase | Email/password login, secure database, duplicate protection, and employee-management backend |

Cloudflare Pages publishes only the generated `dist/` frontend. It does not publish the `functions/` directory or its dependencies.

### 1. Create the GitHub repository

Create a **private** GitHub repository named `kasera-lead-tracker`. Do not add a README, `.gitignore`, or license through GitHub because this project already includes them.

### 2. Configure Cloudflare Pages

In Cloudflare: **Workers & Pages → Create application → Pages → Connect to Git**. Select the private GitHub repository and use:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `20` |

Cloudflare deploys the website automatically after every push to `main` and gives each pull request its own preview URL.

### 3. Authorize the Cloudflare Pages domain in Firebase

After Cloudflare gives the project URL (for example `kasera-lead-tracker.pages.dev`), add that exact hostname under **Firebase Authentication → Settings → Authorized domains**. Add the final custom domain too, if one is connected later.

### 4. Configure GitHub Actions to deploy the Firebase backend

The `.github/workflows/deploy-firebase.yml` workflow deploys only Firestore rules and Firebase Functions on a push to `main`. It uses short-lived GitHub-to-Google credentials, not a Firebase login token or a service-account JSON key.

Create GitHub repository secrets named:

| Secret | Value |
| --- | --- |
| `GCP_WIF_PROVIDER` | Full Workload Identity Provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Email of the dedicated Google Cloud deployment service account |

The dedicated deployment service account needs `Cloud Functions Admin` and `Service Account User` to deploy functions. Do not give it Google Cloud Owner. Scope the Workload Identity Provider to this repository and the `main` branch.

### 5. First live use

Open the Cloudflare Pages URL, sign in with `rsheartfulness@gmail.com`, and choose **Activate first admin**. The admin can then create employee logins and map each one to the Odoo `user_id` email.

## Tags

Tag reports require Odoo exports to include `tag_ids/name` or an equivalent Tags column. The app clearly warns when a file does not contain tags and never wipes previously saved tag values from another import.
