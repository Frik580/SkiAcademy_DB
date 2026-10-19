'use strict';

const { createHash } = require('node:crypto');
const { Timestamp, GeoPoint } = require('firebase-admin/firestore');
const { exactPath, assertTarget } = require('./policy.cjs');

function stable(value) {
  if (value instanceof Timestamp) return { $timestamp: [value.seconds, value.nanoseconds] };
  if (value instanceof GeoPoint) return { $geo: [value.latitude, value.longitude] };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $bytes: value.toString('base64') };
  if (value?.constructor?.name === 'DocumentReference') return { $reference: value.formattedName };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (value === undefined) throw Error('BLOCKED: undefined hash input');
  if (Array.isArray(value)) return { $array: value.map(stable) };
  if (value && typeof value === 'object')
    return {
      $map: Object.keys(value)
        .sort()
        .map((k) => [k, stable(value[k])]),
    };
  return value;
}
function hash(value) {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function assertReadEnvironment(target, env = process.env) {
  assertTarget(target.projectId, target.databaseId, target.entrypoint);
  const demo = target.projectId.startsWith('demo-');
  const emulator =
    /^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST ?? '') &&
    /^127\.0\.0\.1:\d+$/.test(env.FIREBASE_AUTH_EMULATOR_HOST ?? '') &&
    /^127\.0\.0\.1:\d+$/.test(env.FIREBASE_STORAGE_EMULATOR_HOST ?? '');
  if (
    env.STORAGE_EMULATOR_HOST &&
    env.STORAGE_EMULATOR_HOST !== `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}`
  )
    throw Error('BLOCKED: conflicting Storage emulator endpoint');
  if (
    (demo && !emulator) ||
    (!demo &&
      (env.FIRESTORE_EMULATOR_HOST ||
        env.FIREBASE_AUTH_EMULATOR_HOST ||
        env.FIREBASE_STORAGE_EMULATOR_HOST ||
        env.STORAGE_EMULATOR_HOST))
  ) {
    throw Error('BLOCKED: mixed cloud/emulator environment');
  }
}

/** Full recursive inventory including missing ancestor documents. REST metadata
 * calls are explicitly paginated; showMissing prevents hiding orphan children.
 * This is a finite operator-invoked full scan, never a scheduler or poller. */
async function collectInventory(app, db, auth, target, options = {}) {
  assertReadEnvironment(target);
  const maxDocuments = options.maxDocuments ?? 10000;
  const maxRequests = options.maxRequests ?? 5000;
  const baseName = `projects/${target.projectId}/databases/${target.databaseId}/documents`;
  const endpoint = target.projectId.startsWith('demo-')
    ? `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/`
    : 'https://firestore.googleapis.com/v1/';
  let requests = 0;
  async function read(suffix, body) {
    if (++requests > maxRequests)
      throw Error('BLOCKED: metadata request cap reached; inventory incomplete');
    const token = endpoint.startsWith('https:')
      ? await app.options.credential.getAccessToken()
      : undefined;
    const response = await fetch(endpoint + baseName + suffix, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ? token.access_token : 'owner'}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`BLOCKED: inventory HTTP ${response.status}`);
    const data = await response.json();
    if (data.unreachable?.length) throw Error('BLOCKED: unreachable inventory');
    return data;
  }
  const rows = [];
  const ghosts = [];
  const visited = new Set();
  const pending = [{ parent: '', depth: 0 }];
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw Error('BLOCKED: invalid inventory concurrency');
  async function walk(parent = '', depth = 0) {
    if (depth > 20) throw Error('BLOCKED: subcollection depth cap');
    let token;
    do {
      const collections = await read(`${parent}:listCollectionIds`, {
        pageSize: 100,
        ...(token ? { pageToken: token } : {}),
      });
      for (const collection of collections.collectionIds ?? []) {
        if (!/^[A-Za-z0-9_-]+$/.test(collection)) throw Error('BLOCKED: unsupported collection ID');
        const prefix = `${parent}/${collection}`;
        let page;
        do {
          const query = new URLSearchParams({
            pageSize: '100',
            showMissing: 'true',
            ...(page ? { pageToken: page } : {}),
          });
          const result = await read(`${prefix}?${query}`);
          const references = [];
          for (const doc of result.documents ?? []) {
            if (!doc.name.startsWith(baseName + '/'))
              throw Error('BLOCKED: foreign database document');
            const path = exactPath(doc.name.slice(baseName.length + 1));
            if (visited.has(path)) throw Error('BLOCKED: duplicate document during inventory');
            if (visited.size >= maxDocuments)
              throw Error('BLOCKED: document cap; inventory incomplete');
            visited.add(path);
            references.push(db.doc(path));
          }
          if (references.length) {
            for (const doc of await db.getAll(...references)) {
              if (doc.exists)
                rows.push({
                  path: doc.ref.path,
                  data: doc.data(),
                  hash: hash(doc.data()),
                  updateTime: `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`,
                });
              else ghosts.push(doc.ref.path);
              pending.push({ parent: '/' + doc.ref.path, depth: depth + 1 });
            }
          }
          if (result.nextPageToken && result.nextPageToken === page)
            throw Error('BLOCKED: non-advancing document cursor');
          page = result.nextPageToken;
        } while (page);
      }
      if (collections.nextPageToken && collections.nextPageToken === token)
        throw Error('BLOCKED: non-advancing collection cursor');
      token = collections.nextPageToken;
    } while (token);
  }
  while (pending.length) {
    await Promise.all(
      pending.splice(0, concurrency).map(({ parent, depth }) => walk(parent, depth))
    );
  }
  const users = [];
  let token;
  do {
    const result = await auth.listUsers(1000, token);
    for (const user of result.users) {
      // Do not persist credentials or password hashes. Include credential hashes
      // in the fingerprint if available, but ignore volatile login timestamps.
      const json = user.toJSON();
      delete json.metadata;
      users.push({ uid: user.uid, hash: hash(JSON.parse(JSON.stringify(json))) });
      if (users.length > maxDocuments) throw Error('BLOCKED: Auth inventory cap');
    }
    if (result.pageToken && result.pageToken === token)
      throw Error('BLOCKED: non-advancing Auth cursor');
    token = result.pageToken;
  } while (token);
  rows.sort((a, b) => a.path.localeCompare(b.path));
  users.sort((a, b) => a.uid.localeCompare(b.uid));
  return { rows, ghosts: ghosts.sort(), auth: users, complete: true, requests };
}

module.exports = { stable, hash, assertReadEnvironment, collectInventory };
