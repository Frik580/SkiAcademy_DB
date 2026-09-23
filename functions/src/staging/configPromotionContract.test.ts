import { describe, expect, it } from 'vitest';
import {
  CourseIdSchema,
  InstructorIdSchema,
} from '@ski-academy/shared-domain';
import {
  findMediaPlaceholders,
  mediaPlaceholderUrl,
  parsePromotionManifest,
  stableHash,
  type ConfigPromotionManifest,
} from './configPromotionContract';

const instructorId = InstructorIdSchema.parse('instructor_stage_alpha');

function instructorRecord(overrides: Record<string, unknown> = {}) {
  const payload = { name: 'Alpine Instructor', pricePerHourKZT: 15_000, ...overrides };
  return {
    kind: 'instructor' as const,
    logicalKey: `instructor:${instructorId}`,
    sourcePath: `instructors/${instructorId}`,
    sourceId: instructorId,
    selected: true,
    sourceHash: stableHash(payload),
    payload,
  };
}

function manifest(record = instructorRecord()): ConfigPromotionManifest {
  return parsePromotionManifest({
    schemaVersion: 1,
    sourceProjectId: 'ski-school-staging',
    exportedAt: '2026-09-24T00:00:00.000Z',
    sourceDocuments: [record],
    mappings: {
      instructors: record.kind === 'instructor'
        ? [{ logicalKey: record.logicalKey, stagingInstructorId: instructorId }]
        : [],
      courses: record.kind === 'course'
        ? [{ logicalKey: record.logicalKey, stagingCourseId: record.sourceId }]
        : [],
    },
    media: [],
    excludedSummary: { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] },
  });
}

describe('configuration promotion manifest contract', () => {
  it('requires the exact staging source and recomputable source payload hashes', () => {
    const valid = manifest();
    expect(valid.sourceProjectId).toBe('ski-school-staging');
    expect(() => parsePromotionManifest({ ...valid, sourceProjectId: 'ski-school-8f3ca' })).toThrow(/source/);
    expect(() => parsePromotionManifest({
      ...valid,
      sourceDocuments: [{ ...valid.sourceDocuments[0]!, sourceHash: 'a'.repeat(64) }],
    })).toThrow(/hash mismatch/);
  });

  it('rejects copied Account links, revisions, audit fields, and TEST scope', () => {
    for (const field of ['linkedAccountId', 'revision', 'audit', 'dataScope', 'testSessionId']) {
      expect(() => manifest(instructorRecord({ [field]: 'forbidden' }))).toThrow();
    }
  });

  it('keeps staging Account/Auth identifiers out of exported payloads', () => {
    const sourceAccountId = 'staging-account-private';
    const valid = manifest();
    expect(JSON.stringify(valid.sourceDocuments)).not.toContain(sourceAccountId);
    expect(JSON.stringify(valid.sourceDocuments)).not.toContain('linkedAccountId');
  });

  it('rejects Firebase download tokens in any manifest value', () => {
    const payload = {
      duration: 'One day', description: 'Course', dates: '1 October',
      bgImageUrl: 'https://storage.yandexcloud.net/carve/course.webp',
      videoUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/video.mp4?alt=media&token=secret',
    };
    const courseId = CourseIdSchema.parse('course_stage_alpha');
    const record = {
      kind: 'course_catalog_content' as const,
      logicalKey: `course:${courseId}`,
      sourcePath: `course_catalog_content/${courseId}`,
      sourceId: courseId,
      selected: true,
      sourceHash: stableHash(payload),
      payload,
    };
    expect(() => manifest(record)).toThrow(/token/i);
  });

  it('tracks placeholder media references without storing their source URL', () => {
    const placeholder = mediaPlaceholderUrl('media:course:cover');
    expect(findMediaPlaceholders({ slides: [{ backgroundImage: placeholder }] })).toEqual(['media:course:cover']);
  });

  it('rejects image-cache and private Storage objects from the manifest', () => {
    const mediaKey = 'media:banner:one';
    const payload = {
      slides: [{
        id: 'banner-one', line1En: '', line1Ru: '', line2En: '', line2Ru: '',
        line3En: '', line3Ru: '', backgroundImage: mediaPlaceholderUrl(mediaKey),
      }],
      slideIntervalSeconds: 12,
      slidesRandomOrder: false,
    };
    const record = {
      kind: 'resort_slides' as const,
      logicalKey: 'resort_slides' as const,
      sourcePath: 'resort_data/config' as const,
      sourceId: 'resort_config' as const,
      selected: true,
      sourceHash: stableHash(payload),
      payload,
    };
    const base = {
      schemaVersion: 1,
      sourceProjectId: 'ski-school-staging',
      exportedAt: '2026-09-24T00:00:00.000Z',
      sourceDocuments: [record],
      mappings: { instructors: [], courses: [] },
      media: [{
        mediaKey,
        ownerKind: 'resort',
        ownerLogicalKey: 'resort_slides',
        fieldPath: 'slides.0.backgroundImage',
        sourceBucket: 'ski-school-staging.firebasestorage.app',
        sourceObjectPath: 'image-cache/banner-one',
        sha256: 'a'.repeat(64),
        contentType: 'image/webp',
      }],
      excludedSummary: { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] },
    };
    expect(() => parsePromotionManifest(base)).toThrow(/outside the source allowlist/);
    expect(() => parsePromotionManifest({
      ...base,
      media: [{ ...base.media[0]!, sourceObjectPath: 'customers/customer-1/private.jpg' }],
    })).toThrow(/outside the source allowlist/);
  });

  it('requires operator mappings to match the source logical key', () => {
    const record = instructorRecord();
    expect(() => parsePromotionManifest({
      schemaVersion: 1,
      sourceProjectId: 'ski-school-staging',
      exportedAt: '2026-09-24T00:00:00.000Z',
      sourceDocuments: [record],
      mappings: {
        instructors: [{ logicalKey: 'instructor:some-other-key', stagingInstructorId: instructorId }],
        courses: [],
      },
      media: [],
      excludedSummary: { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] },
    })).toThrow(/mapping does not match its source logical key/);
  });

  it('validates Yandex media as HTTPS URLs under /carve/ without query tokens', () => {
    const courseId = CourseIdSchema.parse('course_stage_alpha');
    const validPayload = {
      duration: 'One day', description: 'Course', dates: '1 October',
      bgImageUrl: 'https://storage.yandexcloud.net/carve/course.webp',
    };
    const record = {
      kind: 'course_catalog_content' as const,
      logicalKey: `course:${courseId}`,
      sourcePath: `course_catalog_content/${courseId}`,
      sourceId: courseId,
      selected: true,
      sourceHash: stableHash(validPayload),
      payload: validPayload,
    };
    expect(() => manifest(record)).not.toThrow();
    expect(() => manifest({
      ...record,
      payload: { ...validPayload, bgImageUrl: 'https://storage.yandexcloud.net/private/course.webp' },
      sourceHash: stableHash({ ...validPayload, bgImageUrl: 'https://storage.yandexcloud.net/private/course.webp' }),
    })).toThrow(/allowlisted/);
  });

  it('hashes equivalent JSON payloads deterministically', () => {
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });
});
