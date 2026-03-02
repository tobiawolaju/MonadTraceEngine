import fs from 'fs';
import admin from 'firebase-admin';
import { config } from '../config/index.js';
import { sanitizeForRTDB } from '../utils/normalize.js';

let db;

function loadServiceAccount(serviceAccountJsonPath) {
  if (!serviceAccountJsonPath) return null;

  try {
    const raw = fs.readFileSync(serviceAccountJsonPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[firebase] Invalid service account json path: ${serviceAccountJsonPath}. ${error.message}`);
    return null;
  }
}

export function initFirebase() {
  const serviceAccount = loadServiceAccount(config.firebase.serviceAccountJsonPath);

  if (!serviceAccount) {
    console.warn('[firebase] Missing service account json: using in-memory mode only.');
    return null;
  }

  const databaseURL = config.firebase.databaseURL || serviceAccount.databaseURL;
  if (!databaseURL) {
    console.warn('[firebase] Missing FIREBASE_DATABASE_URL/databaseURL: using in-memory mode only.');
    return null;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL
    });
  }

  db = admin.database();
  return db;
}

export async function persistBlock(block) {
  if (!db) return;

  const id = `${block.nodeId}_${block.blockHeight}_${block.hash}`;
  const sanitizedBlock = sanitizeForRTDB(block);

  await db.ref(`blocks/${id}`).set(sanitizedBlock);
}

export async function removeBlock(block) {
  if (!db) return;

  const id = `${block.nodeId}_${block.blockHeight}_${block.hash}`;
  await db.ref(`blocks/${id}`).remove();
}
