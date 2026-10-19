'use strict';

const { hash } = require('./inventory.cjs');
const { createHash } = require('node:crypto');
function publicCacheProof(metadata) {
  if (!/^image-cache\//.test(metadata.name)) return undefined;
  const { sourceUrl, width, quality } = metadata.metadata ?? {};
  try {
    const url = new URL(sourceUrl);
    const w = Number(width),
      q = Number(quality);
    const digest = createHash('sha256').update(`${sourceUrl}|${w}|${q}|webp`).digest('hex');
    if (
      url.protocol === 'https:' &&
      url.hostname === 'storage.yandexcloud.net' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      url.pathname.startsWith('/carve/') &&
      [480, 960, 1280, 1920].includes(w) &&
      Number.isInteger(q) &&
      q >= 40 &&
      q <= 90 &&
      metadata.name === `image-cache/${digest}_w${w}_q${q}.webp` &&
      metadata.contentType === 'image/webp'
    )
      return { sourceUrl, width: w, quality: q };
  } catch {
    /* Unknown metadata stays unsupported. */
  }
  return undefined;
}

function objectName(name) {
  if (
    typeof name !== 'string' ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(name) ||
    name.split('/').some((p) => p === '.' || p === '..')
  )
    throw Error('BLOCKED: invalid Storage object name');
  return name;
}
function bucketName(target) {
  const name =
    target.storageBucket ??
    (target.projectId.startsWith('demo-') ? `${target.projectId}.firebasestorage.app` : undefined);
  if (
    ![`${target.projectId}.firebasestorage.app`, `${target.projectId}.appspot.com`].includes(name)
  )
    throw Error('BLOCKED: explicit project-owned --bucket required');
  return name;
}
function fingerprint(metadata) {
  const value = JSON.parse(
    JSON.stringify({
      name: metadata.name,
      bucket: metadata.bucket,
      generation: metadata.generation,
      metageneration: metadata.metageneration,
      size: metadata.size,
      md5Hash: metadata.md5Hash,
      crc32c: metadata.crc32c,
      metadata: metadata.metadata ?? {},
      contentType: metadata.contentType,
    })
  );
  if (!value.generation || !value.metageneration || (!value.md5Hash && !value.crc32c))
    throw Error('BLOCKED: Storage generation/content fingerprint missing');
  return {
    name: objectName(value.name),
    generation: String(value.generation),
    sha256: hash(value),
    ...(publicCacheProof(metadata) ? { publicCache: publicCacheProof(metadata) } : {}),
  };
}
async function inventoryObjects(bucket, maxObjects = 10000) {
  const objects = [];
  const seen = new Set();
  let pageToken;
  do {
    const [files, next] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const file of files) {
      if (objects.length >= maxObjects || seen.has(file.name))
        throw Error('BLOCKED: Storage inventory cap/duplicate');
      seen.add(file.name);
      objects.push(fingerprint(file.metadata));
    }
    const token = next?.pageToken;
    if (token && token === pageToken) throw Error('BLOCKED: non-advancing Storage cursor');
    pageToken = token;
  } while (pageToken);
  return {
    complete: true,
    bucket: bucket.name,
    objects: objects.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function storageReferences(data, bucket, found = new Set()) {
  if (typeof data === 'string') {
    let name;
    if (data.startsWith(`gs://${bucket}/`)) name = data.slice(bucket.length + 6);
    else if (
      /^(test-sessions|test-actors|avatars|participant-avatars|courses|instructors|chat|image-cache)\//.test(
        data
      )
    )
      name = data;
    else {
      try {
        const url = new URL(data);
        if (['firebasestorage.googleapis.com', '127.0.0.1', 'localhost'].includes(url.hostname)) {
          const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
          if (match && decodeURIComponent(match[1]) === bucket) name = decodeURIComponent(match[2]);
        } else if (
          url.hostname === 'storage.googleapis.com' &&
          url.pathname.startsWith(`/${bucket}/`)
        )
          name = decodeURIComponent(url.pathname.slice(bucket.length + 2));
        else if (url.hostname === `${bucket}.storage.googleapis.com`)
          name = decodeURIComponent(url.pathname.slice(1));
      } catch {
        /* Ordinary text/external links are not bucket authority. */
      }
    }
    if (name) found.add(name);
  } else if (Array.isArray(data)) data.forEach((v) => storageReferences(v, bucket, found));
  else if (data && typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype)
    Object.values(data).forEach((v) => storageReferences(v, bucket, found));
  return found;
}

function storagePlan(snapshot, selection, actions, target, blockers) {
  const inventory = snapshot.storage;
  if (!inventory?.complete || inventory.bucket !== bucketName(target))
    throw Error('BLOCKED: complete Storage inventory required');
  const objects = new Map(inventory.objects.map((o) => [o.name, o]));
  const removedDocs = new Set(actions.filter((a) => a.kind === 'delete').map((a) => a.path));
  const requested = new Map((selection.storageObjects ?? []).map((o) => [o.name, o]));
  if (requested.size !== (selection.storageObjects ?? []).length)
    throw Error('BLOCKED: duplicate Storage target');
  const deletions = [];
  const classification = [];
  for (const object of inventory.objects) {
    const parts = object.name.split('/');
    const disposable =
      parts.length === 5 && parts[0] === 'test-sessions' && parts[2] === 'booking-chat';
    const persistent =
      /^(avatars|participant-avatars|instructors|courses|test-actors)\//.test(object.name) ||
      (parts[0] === 'test-sessions' && parts[2] === 'course-assets') ||
      (object.publicCache &&
        object.name ===
          `image-cache/${createHash('sha256').update(`${object.publicCache.sourceUrl}|${object.publicCache.width}|${object.publicCache.quality}|webp`).digest('hex')}_w${object.publicCache.width}_q${object.publicCache.quality}.webp`);
    if (object.publicCache) {
      const contains = (v) =>
        typeof v === 'string'
          ? v === object.publicCache.sourceUrl ||
            v === object.name ||
            v.includes(encodeURIComponent(object.publicCache.sourceUrl))
          : Array.isArray(v)
            ? v.some(contains)
            : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
              ? Object.values(v).some(contains)
              : false;
      classification.push({
        name: object.name,
        generation: object.generation,
        sha256: object.sha256,
        type: 'shared_public_catalog_cache',
        decision: 'preserve',
        sourceUrl: object.publicCache.sourceUrl,
        references: snapshot.rows
          .filter(
            (r) => contains(r.data) || storageReferences(r.data, inventory.bucket).has(object.name)
          )
          .map((r) => r.path),
        reason: 'verified public proxy provenance; no exclusive operation ownership',
      });
    }
    if (disposable && selection.testSessionIds.includes(parts[1])) {
      const source = snapshot.rows.find((r) => r.path === `bookings/${parts[3]}`)?.data;
      if (!source || source.dataScope !== 'test' || source.testSessionId !== parts[1])
        blockers.push(`Orphan/foreign selected-session Storage media: ${object.name}`);
    }
    if (!disposable && !persistent) blockers.push(`Unsupported Storage ownership: ${object.name}`);
    if (disposable && removedDocs.has(`bookings/${parts[3]}`)) {
      const booking = snapshot.rows.find((r) => r.path === `bookings/${parts[3]}`)?.data;
      const approved = requested.get(object.name);
      if (
        !selection.testSessionIds.includes(parts[1]) ||
        booking?.dataScope !== 'test' ||
        booking.testSessionId !== parts[1] ||
        !approved ||
        approved.generation !== object.generation ||
        approved.sha256 !== object.sha256
      )
        blockers.push(`Unreviewed/foreign Storage dependency: ${object.name}`);
      else deletions.push(object);
    } else if (requested.has(object.name))
      blockers.push(`Storage target is persistent or has no deleted TEST Booking: ${object.name}`);
  }
  for (const name of requested.keys())
    if (!objects.has(name)) blockers.push(`Missing selected Storage object: ${name}`);
  const deleting = new Set(deletions.map((o) => o.name));
  for (const row of snapshot.rows) {
    for (const name of storageReferences(row.data, inventory.bucket)) {
      if (!objects.has(name)) blockers.push(`Missing Storage reference: ${row.path}: ${name}`);
      if (!removedDocs.has(row.path) && deleting.has(name))
        blockers.push(`Retained Storage reference: ${row.path}: ${name}`);
    }
  }
  return { ...inventory, deletions, classification };
}

function verifyObjects(current, expected, count, pending) {
  if (!current?.complete || current.bucket !== expected.bucket)
    throw Error('BLOCKED: Storage unavailable/incomplete');
  const remaining = new Map(expected.objects.map((o) => [o.name, o]));
  for (const o of expected.deletions.slice(0, count)) remaining.delete(o.name);
  const actual = new Map(current.objects.map((o) => [o.name, o]));
  // Absence is resumable only with a durable pre-delete intent. A blind 404 is
  // never treated as success for an unstarted step.
  if (pending && !actual.has(pending.name)) remaining.delete(pending.name);
  if (hash([...remaining].sort()) !== hash([...actual].sort()))
    throw Error('BLOCKED: Storage drift; preserve fence and recovery evidence');
}

module.exports = {
  objectName,
  bucketName,
  fingerprint,
  publicCacheProof,
  inventoryObjects,
  storageReferences,
  storagePlan,
  verifyObjects,
};
