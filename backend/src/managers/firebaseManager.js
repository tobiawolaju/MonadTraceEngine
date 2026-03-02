import fs from 'fs';
import admin from 'firebase-admin';
import { config } from '../config/index.js';

function sanitizeForRTDB(input) {
  if (input === undefined || input === null) return null;
  if (Array.isArray(input)) return input.map((item) => sanitizeForRTDB(item));
  if (typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) out[key] = sanitizeForRTDB(value);
    return out;
  }
  return input;
}

function loadServiceAccount(path) {
  if (!path) throw new Error('Missing service account path (ServeiceAccuntJson)');
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

export class FirebaseManager {
  constructor() {
    this.db = null;
  }

  initFirebase() {
    const serviceAccount = loadServiceAccount(config.firebase.serviceAccountJsonPath);
    const databaseURL = config.firebase.databaseURL || serviceAccount.databaseURL;

    if (!databaseURL) {
      throw new Error('Missing FIREBASE_DATABASE_URL (or databaseURL in service account JSON)');
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL
      });
    }

    this.db = admin.database();
    return this.db;
  }

  async verifyDatabaseConnection() {
    if (!this.db) throw new Error('Firebase not initialized');
    await this.db.ref('.info/connected').get();
    await this.db.ref('_healthcheck').set({ ts: Date.now() });
    await this.db.ref('_healthcheck').remove();
  }

  async writeBlockBundle(block, tracesByTxHash = {}) {
    if (!this.db) throw new Error('Firebase not initialized');

    const updates = {};
    updates[`/blocks/${block.blockHeight}`] = sanitizeForRTDB({
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      txCount: block.transactions.length,
      nodeId: block.nodeId,
      status: block.status
    });

    for (const tx of block.transactions) {
      updates[`/transactions/${tx.hash}`] = sanitizeForRTDB({
        blockHeight: block.blockHeight,
        from: tx.from,
        to: tx.to,
        gasUsed: tx.gasUsed ?? null,
        status: tx.status
      });

      updates[`/traces/${tx.hash}`] = sanitizeForRTDB({
        opcodeSummary: tracesByTxHash[tx.hash]?.opcodeSummary ?? {},
        executionMetadata: tracesByTxHash[tx.hash]?.executionMetadata ?? {},
        parallelGroup: tracesByTxHash[tx.hash]?.parallelGroup ?? null
      });
    }

    await this.db.ref().update(updates);
  }

  async rollbackBlocks(fromHeight, toHeight) {
    if (!this.db) throw new Error('Firebase not initialized');
    const updates = {};
    for (let h = fromHeight; h <= toHeight; h += 1) {
      updates[`/blocks/${h}`] = null;
    }
    await this.db.ref().update(updates);
  }
}
