'use strict';

const { hash } = require('./inventory.cjs');

// Introspect the tokens actually used by Admin Auth/REST, Firestore and Storage.
// No gcloud account listing, credential-file email or environment assertion is
// accepted as identity. Errors deliberately omit provider bodies and tokens.
async function tokenPrincipal(token, request = fetch) {
  if (typeof token !== 'string' || !token) throw Error('BLOCKED: ADC access token unavailable');
  let response;
  try {
    response = await request('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Error('BLOCKED: ADC identity verification unavailable');
  }
  if (!response.ok) throw Error('BLOCKED: ADC identity verification rejected');
  let info;
  try {
    info = await response.json();
  } catch {
    throw Error('BLOCKED: invalid ADC identity response');
  }
  const subject = info.sub ?? info.user_id;
  const verified = info.email_verified ?? info.verified_email;
  if (
    typeof subject !== 'string' ||
    !subject ||
    typeof info.email !== 'string' ||
    !info.email.includes('@') ||
    ![true, 'true'].includes(verified) ||
    !Number.isFinite(Number(info.expires_in)) ||
    Number(info.expires_in) < 60
  )
    throw Error('BLOCKED: verified Google ADC subject/email required');
  return hash({ issuer: 'google', subject, email: info.email.toLowerCase() });
}

function identityVerifier(tokenSources, request = fetch) {
  const cache = new Map();
  let principal;
  return async () => {
    const identities = [];
    for (const source of tokenSources) {
      let token;
      try {
        token = await source();
      } catch {
        throw Error('BLOCKED: actual SDK ADC token unavailable');
      }
      // Cache only the introspection of this exact token, at most 30 seconds.
      const key = hash(token);
      let record = cache.get(key);
      if (!record || Date.now() >= record.until) {
        record = { principal: await tokenPrincipal(token, request), until: Date.now() + 30000 };
        for (const [cachedKey, cached] of cache)
          if (Date.now() >= cached.until) cache.delete(cachedKey);
        if (cache.size >= 16) cache.clear();
        cache.set(key, record);
      }
      identities.push(record.principal);
    }
    if (
      !identities.length ||
      identities.some((value) => value !== identities[0]) ||
      (principal && identities[0] !== principal)
    )
      throw Error('BLOCKED: SDK ADC principal mismatch/change');
    principal = identities[0];
    return principal;
  };
}

module.exports = { tokenPrincipal, identityVerifier };
