'use strict';

const { Timestamp, GeoPoint } = require('firebase-admin/firestore');
const { stable, hash } = require('./inventory.cjs');
const { exactPath, assertTarget, assertLocalMutation } = require('./policy.cjs');

class DocumentReference {
  constructor(formattedName) {
    this.formattedName = formattedName;
    this.path = formattedName.split('/documents/')[1];
    this.id = this.path.split('/').at(-1);
  }
}
function decode(value, target, db) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value) || Object.keys(value).length !== 1)
    throw Error('BLOCKED: invalid typed recovery value');
  if (value.$map)
    return Object.fromEntries(
      value.$map.map(([k, v]) => {
        if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))
          throw Error('BLOCKED: unsafe recovery key');
        return [k, decode(v, target, db)];
      })
    );
  if (value.$array) return value.$array.map((v) => decode(v, target, db));
  if (value.$timestamp) return new Timestamp(...value.$timestamp);
  if (value.$geo) return new GeoPoint(...value.$geo);
  if (value.$date) return new Date(value.$date);
  if (Object.hasOwn(value, '$bytes')) return Buffer.from(value.$bytes, 'base64');
  if (value.$number) {
    if (!['NaN', 'Infinity', '-Infinity'].includes(value.$number))
      throw Error('BLOCKED: invalid number');
    return Number(value.$number);
  }
  if (value.$reference) {
    const prefix = `projects/${target.projectId}/databases/${target.databaseId}/documents/`;
    if (!value.$reference.startsWith(prefix)) throw Error('BLOCKED: foreign recovery reference');
    const path = exactPath(value.$reference.slice(prefix.length));
    return db ? db.doc(path) : new DocumentReference(value.$reference);
  }
  throw Error('BLOCKED: unsupported recovery value');
}
function createRecoveryExport(snapshot, target, createdAt = new Date().toISOString()) {
  assertTarget(target.projectId, target.databaseId, target.entrypoint);
  if (target.entrypoint !== 'staging' || !snapshot.complete || !snapshot.storage?.complete)
    throw Error('BLOCKED: complete staging recovery inventory required');
  const body = { format: 'carve-reset-recovery-v1', target, createdAt, snapshot: stable(snapshot) };
  return { ...body, sha256: hash(body) };
}
function readRecoveryExport(archive, db) {
  const { sha256, ...body } = archive;
  assertTarget(body.target.projectId, body.target.databaseId, body.target.entrypoint);
  if (
    body.format !== 'carve-reset-recovery-v1' ||
    body.target.entrypoint !== 'staging' ||
    hash(body) !== sha256
  )
    throw Error('BLOCKED: invalid recovery archive/hash');
  const source = decode(body.snapshot, body.target);
  if (
    !source.complete ||
    !source.storage?.complete ||
    source.rows.some((r) => hash(r.data) !== r.hash)
  )
    throw Error('BLOCKED: incomplete/corrupt recovery documents');
  return db ? decode(body.snapshot, body.target, db) : source;
}
async function restoreEmulatorDocuments(ports, archive, paths) {
  assertLocalMutation(ports.target, ports.identity);
  if (
    !Array.isArray(paths) ||
    !paths.length ||
    paths.length > 100 ||
    new Set(paths).size !== paths.length
  )
    throw Error('BLOCKED: exact bounded restore paths required');
  const snapshot = readRecoveryExport(archive, ports.db);
  const rows = paths.map((path) => {
    exactPath(path);
    const row = snapshot.rows.find((r) => r.path === path);
    if (!row) throw Error('BLOCKED: restore path absent from archive');
    return row;
  });
  await ports.db.runTransaction(async (tx) => {
    const docs = await tx.getAll(...rows.map((r) => ports.db.doc(r.path)));
    for (let i = 0; i < rows.length; i++) {
      if (docs[i].exists && hash(docs[i].data()) !== hash(rows[i].data))
        throw Error('BLOCKED: restore would overwrite changed document');
    }
    for (let i = 0; i < rows.length; i++) if (!docs[i].exists) tx.create(docs[i].ref, rows[i].data);
  });
  return { restoredOrIdentical: rows.length, authWrites: 0 };
}

module.exports = { createRecoveryExport, readRecoveryExport, restoreEmulatorDocuments };
