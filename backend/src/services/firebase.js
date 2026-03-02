import admin from 'firebase-admin';
import { config } from '../config/index.js';

let db;

export function initFirebase() {
  if (!config.firebase.projectId || !config.firebase.clientEmail || !config.firebase.privateKey) {
    console.warn('[firebase] Missing credentials: using in-memory mode only.');
    return null;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey
      }),
      ...(config.firebase.databaseURL ? { databaseURL: config.firebase.databaseURL } : {})
    });
  }

  db = admin.firestore();
  return db;
}

export async function persistBlock(block) {
  if (!db) return;
  const id = `${block.nodeId}_${block.blockHeight}_${block.hash}`;
  await db.collection('blocks').doc(id).set(block, { merge: true });
}

export async function removeBlock(block) {
  if (!db) return;
  const id = `${block.nodeId}_${block.blockHeight}_${block.hash}`;
  await db.collection('blocks').doc(id).delete();
}
