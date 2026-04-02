/**
 * Node script to create a Firebase Auth user and corresponding users/{uid} record.
 * Usage (after configuring service account):
 *   node create_technician_user.js --email=tech@example.com --name="Tech Name" --password=TempPass123 --siteIds=site1,site2
 *
 * Notes:
 * - Requires a Firebase service account JSON available as GOOGLE_APPLICATION_CREDENTIALS
 * - Installs: npm install firebase-admin minimist
 * - The script will create the Auth user, set a custom claim `role: 'technician'`, and write users/{uid} in RTDB.
 * - Optionally it can generate a password reset link for sending via email (you must send it yourself).
 */

const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: argv.databaseURL || undefined,
});

const db = admin.database();

async function run() {
    const email = argv.email;
    const name = argv.name || '';
    const password = argv.password; // optional
    const siteIds = argv.siteIds ? argv.siteIds.split(',').map(s => s.trim()).filter(Boolean) : [];

    if (!email) {
        console.error('Missing --email argument');
        process.exit(1);
    }

    try {
        // Create the Auth user
        const userRecord = await admin.auth().createUser({
            email,
            emailVerified: false,
            password: password || Math.random().toString(36).slice(-10),
            displayName: name,
        });

        const uid = userRecord.uid;
        console.log('Created auth user:', uid);

        // Set custom claim for role
        await admin.auth().setCustomUserClaims(uid, { role: 'technician' });

        // Write users/{uid} record
        await db.ref(`users/${uid}`).set({
            name,
            email,
            role: 'technician',
            siteIds,
            createdBy: 'admin-script',
            createdAt: new Date().toISOString(),
        });

        // Generate password reset link so the technician can set their password (if you used a random password)
        const resetLink = await admin.auth().generatePasswordResetLink(email);
        console.log('Password reset link (send to user):', resetLink);

        console.log('Done.');
    } catch (err) {
        console.error('Error creating technician user:', err);
        process.exit(1);
    }
}

run();
