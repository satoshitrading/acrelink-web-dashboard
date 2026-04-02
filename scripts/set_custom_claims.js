/*
 * Small Node script to set custom claims for a user (e.g. role: 'admin').
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
 *   node set_custom_claims.js --uid=<UID> --role=admin
 * or by email lookup:
 *   node set_custom_claims.js --email=admin@example.com --role=admin
 *
 * Installs:
 *   npm install firebase-admin minimist
 */

const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function run() {
    const role = argv.role || 'admin';
    try {
        if (argv.uid) {
            await admin.auth().setCustomUserClaims(argv.uid, { role });
            console.log(`Set role='${role}' for uid=${argv.uid}`);
            return;
        }

        if (argv.email) {
            const user = await admin.auth().getUserByEmail(argv.email);
            await admin.auth().setCustomUserClaims(user.uid, { role });
            console.log(`Set role='${role}' for email=${argv.email} (uid=${user.uid})`);
            return;
        }

        console.error('Provide --uid or --email');
    } catch (err) {
        console.error('Error setting custom claims:', err);
    }
}

run();
