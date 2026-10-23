/**
 * SISKA — In-Memory Firebase Admin SDK Test Harness (Auth + Firestore + Storage)
 * Memungkinkan pengujian unit & integrasi penuh seluruh Domain Services & Route Handlers
 * (termasuk `runTransaction`, `WriteBatch`, sub-koleksi, dan kompensasi Storage `FILE-04`)
 * secara deterministik sesuai `docs/09-TEST-PLAN.md`.
 */

let apps = [];
const docStore = new Map();
const storageObjects = new Map();
const customClaimsStore = new Map();
let simulateNextCommitFailure = false;

export function resetMockFirebaseAdmin() {
  docStore.clear();
  storageObjects.clear();
  customClaimsStore.clear();
  simulateNextCommitFailure = false;
}

export function setSimulateNextCommitFailure(flag) {
  simulateNextCommitFailure = Boolean(flag);
}

export function seedMockDocs(docsArray, filesArray = []) {
  for (const { path, data } of docsArray) {
    docStore.set(path.replace(/^\/+|\/+$/g, ''), structuredClone(data));
  }
  for (const { path, bytes } of filesArray) {
    storageObjects.set(path, Buffer.from(bytes));
  }
}

export function getMockDoc(path) {
  return docStore.get(path.replace(/^\/+|\/+$/g, '')) ?? null;
}

export function getMockStorageObject(path) {
  return storageObjects.get(path) ?? null;
}

export function listMockCollectionDocs(prefix) {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const partsCount = cleanPrefix.split('/').length + 1;
  const results = [];
  for (const [key, val] of docStore.entries()) {
    if (
      key.startsWith(`${cleanPrefix}/`) &&
      key.split('/').length === partsCount
    ) {
      const id = key.slice(cleanPrefix.length + 1);
      results.push({ id, path: key, data: structuredClone(val) });
    }
  }
  return results;
}

let autoIdCounter = 1;
function nextMockId() {
  const id = `mock_id_${String(autoIdCounter++).padStart(4, '0')}`;
  return id;
}

class MockDocSnapshot {
  constructor(id, path, rawData, ref) {
    this.id = id;
    this.ref = ref;
    this._path = path;
    this._data = rawData ? structuredClone(rawData) : undefined;
    this.exists = rawData !== undefined;
  }
  data() {
    return this._data ? structuredClone(this._data) : undefined;
  }
}

class MockDocRef {
  constructor(path, db) {
    this.path = path.replace(/^\/+|\/+$/g, '');
    const segs = this.path.split('/');
    this.id = segs[segs.length - 1];
    this._db = db;
  }
  collection(subName) {
    return new MockCollectionRef(`${this.path}/${subName}`, this._db);
  }
  async get() {
    const raw = docStore.get(this.path);
    return new MockDocSnapshot(this.id, this.path, raw, this);
  }
  async create(data) {
    if (simulateNextCommitFailure) {
      simulateNextCommitFailure = false;
      throw new Error('Simulated Firestore write failure');
    }
    if (docStore.has(this.path)) {
      throw new Error(`Document already exists: ${this.path}`);
    }
    docStore.set(this.path, structuredClone(data));
  }
  async set(data) {
    if (simulateNextCommitFailure) {
      simulateNextCommitFailure = false;
      throw new Error('Simulated Firestore write failure');
    }
    docStore.set(this.path, structuredClone(data));
  }
  async update(patch) {
    if (simulateNextCommitFailure) {
      simulateNextCommitFailure = false;
      throw new Error('Simulated Firestore write failure');
    }
    const existing = docStore.get(this.path) || {};
    docStore.set(this.path, { ...structuredClone(existing), ...structuredClone(patch) });
  }
  async delete() {
    docStore.delete(this.path);
  }
}

class MockQuery {
  constructor(collectionPath, db, filters = [], sorts = [], limitCount = null, afterSnap = null) {
    this._collectionPath = collectionPath.replace(/^\/+|\/+$/g, '');
    this._db = db;
    this._filters = filters;
    this._sorts = sorts;
    this._limitCount = limitCount;
    this._afterSnap = afterSnap;
  }
  where(field, op, value) {
    return new MockQuery(
      this._collectionPath,
      this._db,
      [...this._filters, { field, op, value }],
      this._sorts,
      this._limitCount,
      this._afterSnap,
    );
  }
  orderBy(field, direction = 'asc') {
    return new MockQuery(
      this._collectionPath,
      this._db,
      this._filters,
      [...this._sorts, { field, direction }],
      this._limitCount,
      this._afterSnap,
    );
  }
  select() {
    return this;
  }
  startAfter(snap) {
    return new MockQuery(
      this._collectionPath,
      this._db,
      this._filters,
      this._sorts,
      this._limitCount,
      snap,
    );
  }
  limit(n) {
    return new MockQuery(
      this._collectionPath,
      this._db,
      this._filters,
      this._sorts,
      n,
      this._afterSnap,
    );
  }
  async get() {
    let entries = listMockCollectionDocs(this._collectionPath);

    for (const f of this._filters) {
      entries = entries.filter((entry) => {
        const val = entry.data[f.field] ?? null;
        if (f.op === '==') return val === f.value;
        return true;
      });
    }

    for (const s of [...this._sorts].reverse()) {
      entries.sort((a, b) => {
        const va = a.data[s.field];
        const vb = b.data[s.field];
        const ta = va instanceof Date ? va.getTime() : String(va ?? '');
        const tb = vb instanceof Date ? vb.getTime() : String(vb ?? '');
        if (ta < tb) return s.direction === 'desc' ? 1 : -1;
        if (ta > tb) return s.direction === 'desc' ? -1 : 1;
        return 0;
      });
    }

    if (this._afterSnap) {
      const idx = entries.findIndex((e) => e.id === this._afterSnap.id);
      if (idx >= 0) {
        entries = entries.slice(idx + 1);
      }
    }

    if (this._limitCount !== null) {
      entries = entries.slice(0, this._limitCount);
    }

    const docs = entries.map(
      (e) =>
        new MockDocSnapshot(
          e.id,
          e.path,
          e.data,
          new MockDocRef(e.path, this._db),
        ),
    );
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
    };
  }
}

class MockCollectionRef extends MockQuery {
  constructor(collectionPath, db) {
    super(collectionPath, db);
  }
  doc(id = nextMockId()) {
    return new MockDocRef(`${this._collectionPath}/${id}`, this._db);
  }
}

class MockBatch {
  constructor() {
    this._ops = [];
  }
  create(ref, data) {
    this._ops.push({ type: 'create', ref, data: structuredClone(data) });
    return this;
  }
  set(ref, data) {
    this._ops.push({ type: 'set', ref, data: structuredClone(data) });
    return this;
  }
  update(ref, patch) {
    this._ops.push({ type: 'update', ref, patch: structuredClone(patch) });
    return this;
  }
  delete(ref) {
    this._ops.push({ type: 'delete', ref });
    return this;
  }
  async commit() {
    if (simulateNextCommitFailure) {
      simulateNextCommitFailure = false;
      throw new Error('Simulated Firestore batch commit failure');
    }
    for (const op of this._ops) {
      if (op.type === 'create') {
        if (docStore.has(op.ref.path)) {
          throw new Error(`Document already exists: ${op.ref.path}`);
        }
        docStore.set(op.ref.path, op.data);
      } else if (op.type === 'set') {
        docStore.set(op.ref.path, op.data);
      } else if (op.type === 'update') {
        const cur = docStore.get(op.ref.path) || {};
        docStore.set(op.ref.path, { ...structuredClone(cur), ...op.patch });
      } else if (op.type === 'delete') {
        docStore.delete(op.ref.path);
      }
    }
  }
}

class MockTransaction extends MockBatch {
  async get(refOrQuery) {
    return refOrQuery.get();
  }
}

class MockFirestore {
  collection(name) {
    return new MockCollectionRef(name, this);
  }
  batch() {
    return new MockBatch();
  }
  async runTransaction(fn) {
    const tx = new MockTransaction();
    const result = await fn(tx);
    await tx.commit();
    return result;
  }
}

const mockFirestoreInstance = new MockFirestore();

export function initializeApp(options = {}) {
  const app = { name: '[DEFAULT]', options };
  apps = [app];
  return app;
}

export function getApps() {
  return apps;
}

export function getApp() {
  return apps[0] || initializeApp();
}

export function cert(c) {
  return c;
}

export function applicationDefault() {
  return {};
}

export function getAuth() {
  return {
    async verifyIdToken(token) {
      const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      return parsed;
    },
    async setCustomUserClaims(uid, claims) {
      customClaimsStore.set(uid, claims);
    },
  };
}

export function getFirestore() {
  return mockFirestoreInstance;
}

export function getStorage() {
  return {
    bucket(bucketName = 'demo-siska.appspot.com') {
      return {
        file(storagePath) {
          return {
            async save(buffer) {
              storageObjects.set(storagePath, Buffer.from(buffer));
            },
            async exists() {
              return [storageObjects.has(storagePath)];
            },
            async download() {
              const buf = storageObjects.get(storagePath);
              if (!buf) throw new Error(`Object not found: ${storagePath}`);
              return [Buffer.from(buf)];
            },
            async delete() {
              storageObjects.delete(storagePath);
            },
            async getSignedUrl({ action }) {
              return [
                `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(storagePath)}?signed=${action}`,
              ];
            },
          };
        },
      };
    },
  };
}

