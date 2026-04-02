/*
 * Minimal Express server to create technician Auth user + users/{uid} record
 * and generate/send a password reset link.
 *
 * Usage:
 * 1) Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON
 * 2) Set DB_URL to your RTDB URL (e.g., https://<PROJECT>.firebaseio.com)
 * 3) Optional SMTP vars to send email automatically: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
 * 4) Install deps: npm install express firebase-admin body-parser cors nodemailer
 * 5) Run: node index.js
 *
 * Endpoint:
 * POST /api/create-technician
 * body: { name, email, siteIds: ["site1","site2"], sendEmail: true }
 */

const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

const nodemailer = require('nodemailer');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
    process.exit(1);
}

const databaseURL = process.env.DB_URL || process.env.FIREBASE_DATABASE_URL;

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: databaseURL,
});

const db = admin.database();
const app = express();
app.use(cors());
app.use(bodyParser.json());

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

app.post('/api/create-technician', async (req, res) => {
    try {
        const { name, email, siteIds = [], sendEmail = true } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'name and email required' });

        // Create Auth user with random password
        const password = Math.random().toString(36).slice(-10);
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        const uid = userRecord.uid;

        // Set custom claim
        await admin.auth().setCustomUserClaims(uid, { role: 'technician' });

        // Write users/{uid}
        await db.ref(`users/${uid}`).set({
            name,
            email,
            role: 'technician',
            siteIds,
            createdBy: 'server-api',
            createdAt: new Date().toISOString(),
        });

        // Generate password reset link
        const resetLink = await admin.auth().generatePasswordResetLink(email);

        // Optionally send email via SMTP
        if (sendEmail && transporter) {
            const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
            const mail = {
                from,
                to: email,
                subject: 'AcreLink: Set your password',
                text: `Hello ${name},\n\nPlease set your account password using the following link:\n${resetLink}\n\nIf you did not expect this email, ignore it.`,
            };

            await transporter.sendMail(mail);
        }

        return res.json({ ok: true, uid, resetLink: sendEmail && transporter ? null : resetLink });
    } catch (err) {
        console.error('create-technician error', err);
        // If user exists, return 409
        if (err.code && err.code === 'auth/email-already-exists') {
            return res.status(409).json({ error: 'auth_exists' });
        }
        return res.status(500).json({ error: err.message || String(err) });
    }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
