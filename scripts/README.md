Create Technician User Script

This folder contains a helper Node.js script to create a Firebase Auth user and a corresponding `users/{uid}` record in the Realtime Database for technician accounts.

Prerequisites

- A Firebase project and service account JSON. Set the environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
```

- Install dependencies:

```bash
npm install firebase-admin minimist
```

Usage

```bash
node create_technician_user.js --email=tech@example.com --name="Tech Name" --password=TempPass123 --siteIds=site1,site2 --databaseURL=https://<YOUR_DB>.firebaseio.com
```

Notes

- The script creates the Auth user, sets a custom claim `role: 'technician'`, and writes the `users/{uid}` record.
- The script generates a password reset link and prints it. Use your SMTP/email provider to send the link to the technician.
- For production, implement a secure server endpoint that triggers this script or uses the Admin SDK directly.
