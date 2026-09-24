import { describe, expect, it } from 'vitest';
import {
  findMediaPlaceholders,
  mediaPlaceholderUrl,
  parsePromotionManifest,
  stableHash,
  type ConfigPromotionManifest,
} from './configPromotionContract';

const exportedAt = '2026-09-24T00:00:00.000Z';

function excludedSummary() {
  return { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] };
}

function pricingPayload(amount = 6_000) {
  return { additionalParticipantSurchargePerHourKzt: amount, maxParticipantsPerLesson: 4 };
}

function pricingRecord(payload = pricingPayload()) {
  return {
    kind: 'lesson_pricing_settings' as const,
    logicalKey: 'lesson_booking' as const,
    sourcePath: 'lesson_pricing_settings/lesson_booking' as const,
    sourceId: 'lesson_booking' as const,
    selected: true,
    sourceHash: stableHash(payload),
    payload,
  };
}

function resortRecord(backgroundImage: string) {
  const payload = {
    slides: [{
      id: 'banner-one',
      line1En: 'Alpine',
      line1Ru: 'Альпы',
      line2En: '',
      line2Ru: '',
      line3En: '',
      line3Ru: '',
      backgroundImage,
    }],
    slideIntervalSeconds: 12,
    slidesRandomOrder: false,
  };
  return {
    kind: 'resort_slides' as const,
    logicalKey: 'resort_slides' as const,
    sourcePath: 'resort_data/config' as const,
    sourceId: 'resort_config' as const,
    selected: true,
    sourceHash: stableHash(payload),
    payload,
  };
}

function manifest(sourceDocuments: unknown[], media: unknown[] = []): ConfigPromotionManifest {
  return parsePromotionManifest({
    schemaVersion: 2,
    sourceProjectId: 'ski-school-staging',
    exportedAt,
    sourceDocuments,
    media,
    excludedSummary: excludedSummary(),
  });
}

describe('configuration promotion manifest contract', () => {
  it('requires schemaVersion 2, the staging source, and recomputable payload hashes', () => {
    const valid = manifest([pricingRecord()]);
    expect(valid.schemaVersion).toBe(2);
    expect(valid.sourceProjectId).toBe('ski-school-staging');
    expect(valid).not.toHaveProperty('mappings');
    expect(() => parsePromotionManifest({ ...valid, sourceProjectId: 'ski-school-8f3ca' })).toThrow(/source/);
    expect(() => parsePromotionManifest({
      ...valid,
      sourceDocuments: [{ ...valid.sourceDocuments[0]!, sourceHash: 'a'.repeat(64) }],
    })).toThrow(/hash mismatch/);
  });

  it('fails closed on an older business-entity promotion manifest', () => {
    expect(() => parsePromotionManifest({
      schemaVersion: 1,
      sourceProjectId: 'ski-school-staging',
      exportedAt,
      sourceDocuments: [],
      mappings: {
        instructors: [{ logicalKey: 'instructor:staging', stagingInstructorId: 'instructor_stage', productionInstructorId: 'instructor_prod', productionAccountId: 'account_prod' }],
        courses: [{ logicalKey: 'course:staging', stagingCourseId: 'course_stage', productionCourseId: 'course_prod' }],
      },
      media: [],
      excludedSummary: excludedSummary(),
    })).toThrow(/unsupported manifest schemaVersion 1/);
    expect(() => parsePromotionManifest({
      schemaVersion: 2,
      sourceProjectId: 'ski-school-staging',
      exportedAt,
      sourceDocuments: [pricingRecord()],
      mappings: { instructors: [], courses: [] },
      media: [],
      excludedSummary: excludedSummary(),
    })).toThrow(/business-entity mappings/);
  });

  it('rejects identity, revision, audit, TEST scope, and download tokens', () => {
    for (const field of ['linkedAccountId', 'revision', 'audit', 'dataScope', 'testSessionId', 'password']) {
      const payload = { ...pricingPayload(), [field]: 'forbidden' };
      expect(() => manifest([{ ...pricingRecord(payload), sourceHash: stableHash(payload) }])).toThrow();
    }
    const tokenSlide = resortRecord('https://storage.yandexcloud.net/carve/hero.webp');
    const tokenPayload = {
      ...tokenSlide.payload,
      slides: [{ ...(tokenSlide.payload as { slides: Array<Record<string, unknown>> }).slides[0]!, line1En: 'preview?token=secret' }],
    };
    expect(() => manifest([{ ...tokenSlide, payload: tokenPayload, sourceHash: stableHash(tokenPayload) }])).toThrow(/token/i);
  });

  it('accepts a public Yandex banner and rejects private or query-bearing URLs', () => {
    expect(() => manifest([resortRecord('https://storage.yandexcloud.net/carve/hero.webp')])).not.toThrow();
    const privatePayload = resortRecord('https://storage.yandexcloud.net/private/hero.webp');
    expect(() => manifest([privatePayload])).toThrow(/allowlisted/);
  });

  it('accepts the supported logical slide keys and rejects unknown identifiers and media categories', () => {
    for (const key of ['wall7', 'wall2', 'wall5', 'about']) {
      expect(() => manifest([resortRecord(key)])).not.toThrow();
    }
    expect(() => manifest([resortRecord('something-random')])).toThrow(/allowlisted/);
    for (const url of [
      'https://images.example.com/hero.jpg',
      'https://storage.yandexcloud.net/carve/courses/course.webp',
      'https://storage.yandexcloud.net/carve/instructors/instructor.jpg',
      'https://storage.yandexcloud.net/carve/image-cache/cached.webp',
    ]) {
      expect(() => manifest([resortRecord(url)])).toThrow(/allowlisted/);
    }
  });

  it('accepts only allowlisted banner Storage objects', () => {
    const mediaKey = 'media:banner:one';
    const record = resortRecord(mediaPlaceholderUrl(mediaKey));
    const base = {
      schemaVersion: 2,
      sourceProjectId: 'ski-school-staging',
      exportedAt,
      sourceDocuments: [record],
      media: [{
        mediaKey,
        ownerKind: 'resort',
        ownerLogicalKey: 'resort_slides',
        fieldPath: 'slides.0.backgroundImage',
        sourceBucket: 'ski-school-staging.firebasestorage.app',
        sourceObjectPath: 'banners/winter-banner.webp',
        sha256: 'a'.repeat(64),
        contentType: 'image/webp',
      }],
      excludedSummary: excludedSummary(),
    };
    expect(() => parsePromotionManifest(base)).not.toThrow();
    expect(findMediaPlaceholders(record.payload)).toEqual([mediaKey]);
    for (const sourceObjectPath of ['image-cache/banner.webp', 'courses/course_a.webp', 'instructors/instructor_a.jpg', 'customers/customer_a/avatar.jpg']) {
      expect(() => parsePromotionManifest({
        ...base,
        media: [{ ...base.media[0]!, sourceObjectPath }],
      })).toThrow(/outside the source allowlist/);
    }
  });

  it('hashes equivalent JSON payloads deterministically', () => {
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });
});
