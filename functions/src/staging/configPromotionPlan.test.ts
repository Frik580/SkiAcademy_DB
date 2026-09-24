import { describe, expect, it } from 'vitest';
import { mediaPlaceholderUrl, parsePromotionManifest, stableHash } from './configPromotionContract';
import { destinationMediaPath, planConfigPromotion } from './configPromotionPlan';

const exportedAt = '2026-09-24T00:00:00.000Z';
const pricing = { additionalParticipantSurchargePerHourKzt: 424_242, maxParticipantsPerLesson: 4 };

function record(kind: 'lesson_pricing_settings' | 'skill_config' | 'achievements_config' | 'instructor_filters' | 'resort_slides', payload: Record<string, unknown>, issues?: string[]) {
  const identity = {
    lesson_pricing_settings: { logicalKey: 'lesson_booking', sourcePath: 'lesson_pricing_settings/lesson_booking', sourceId: 'lesson_booking' },
    skill_config: { logicalKey: 'skill_config', sourcePath: 'settings/skill_config', sourceId: 'skill_config' },
    achievements_config: { logicalKey: 'achievements_config', sourcePath: 'settings/achievements_config', sourceId: 'achievements_config' },
    instructor_filters: { logicalKey: 'instructor_filters', sourcePath: 'settings/instructor_filters', sourceId: 'instructor_filters' },
    resort_slides: { logicalKey: 'resort_slides', sourcePath: 'resort_data/config', sourceId: 'resort_config' },
  }[kind];
  return {
    kind,
    ...identity,
    selected: true,
    sourceHash: stableHash(payload),
    payload,
    ...(issues ? { issues } : {}),
  };
}

function manifest(sourceDocuments: unknown[], media: unknown[] = []) {
  return parsePromotionManifest({
    schemaVersion: 2,
    sourceProjectId: 'ski-school-staging',
    exportedAt,
    sourceDocuments,
    media,
    excludedSummary: { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] },
  });
}

describe('staging configuration promotion plan', () => {
  it('plans allowlisted global config without reading business-entity targets', () => {
    const source = manifest([
      record('lesson_pricing_settings', pricing),
      record('instructor_filters', { enabled: false }),
    ]);
    const plan = planConfigPromotion(source, {
      documents: {
        'settings/instructor_filters': { enabled: true, unrelated: 'preserved' },
        'instructors/instructor_prod': { name: 'Production Coach', linkedAccountId: 'account_secret' },
        'courses/course_prod': { title: 'Production Course' },
        'courses/course_prod/days/day_prod': { localDate: '2026-10-01' },
        'course_catalog_content/course_prod': { description: 'secret catalog' },
        'users/account_secret': { email: 'secret@example.com' },
      },
      mediaHashes: {},
    });
    expect(plan.operations.map((operation) => operation.kind).sort()).toEqual(['instructor_filters', 'lesson_pricing_settings']);
    expect(plan.operations.map((operation) => operation.targetPath)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/^(instructors|courses|course_catalog_content|users)\//),
    ]));
    const pricingOperation = plan.operations.find((operation) => operation.kind === 'lesson_pricing_settings')!;
    const filterOperation = plan.operations.find((operation) => operation.kind === 'instructor_filters')!;
    expect(pricingOperation.status).toBe('CREATE');
    expect(filterOperation).toMatchObject({ status: 'UPDATE', changedFields: ['enabled'] });
    expect(JSON.stringify(plan.operations)).not.toContain('424242');
    expect(JSON.stringify(plan.operations)).not.toContain('secret@example.com');
    expect(JSON.stringify(plan.operations)).not.toContain('Production Coach');
  });

  it('shows changed field names and source/target hashes without payload values', () => {
    const source = manifest([record('lesson_pricing_settings', pricing)]);
    const current = {
      settingsId: 'lesson_booking',
      additionalParticipantSurchargePerHourKzt: 1_000,
      maxParticipantsPerLesson: 4,
      revision: 3,
      createdAt: { seconds: 1, nanoseconds: 0 },
      updatedAt: { seconds: 1, nanoseconds: 0 },
      audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId: 'correlation_seed' },
    };
    const plan = planConfigPromotion(source, {
      documents: { 'lesson_pricing_settings/lesson_booking': current },
      mediaHashes: {},
    });
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      status: 'UPDATE',
      changedFields: ['additionalParticipantSurchargePerHourKzt'],
    });
    expect(plan.operations[0]?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.operations[0]?.targetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.operations[0]?.sourceHash).not.toBe(plan.operations[0]?.targetHash);
  });

  it('becomes UNCHANGED when the allowlisted target projection matches', () => {
    const source = manifest([record('instructor_filters', { enabled: true })]);
    const first = planConfigPromotion(source, { documents: {}, mediaHashes: {} });
    expect(first.operations[0]?.status).toBe('CREATE');
    const second = planConfigPromotion(source, {
      documents: { 'settings/instructor_filters': { enabled: true, unrelated: 'preserved' } },
      mediaHashes: {},
    });
    expect(second.operations[0]?.status).toBe('UNCHANGED');
    expect(second.operations[0]?.changedFields).toEqual([]);
  });

  it('does not plan a delete when staging has no document for an existing production config', () => {
    const source = manifest([record('skill_config', {
      passPercentage: 70,
      items: [{
        id: 'skill_1', levelTarget: 1, section: 'Basics', num: '1', title: 'Snowplow',
        maxPoints: 10, controlPoints: 4, speedPoints: 3, techniquePoints: 3,
      }],
    })]);
    const plan = planConfigPromotion(source, {
      documents: {
        'settings/achievements_config': { items: [] },
        'instructors/instructor_left_behind': { name: 'Stays' },
      },
      mediaHashes: {},
    });
    expect(plan.operations.map((operation) => operation.targetPath)).toEqual(['settings/skill_config']);
    expect(plan.operations.some((operation) => operation.status === 'SKIP' && operation.reason === 'delete')).toBe(false);
  });

  it('conflicts on an invalid global payload and skips an unselected document', () => {
    const invalid = record('instructor_filters', { enabled: true }, ['source_payload_invalid']);
    const skipped = { ...record('achievements_config', { items: [] }), selected: false };
    const plan = planConfigPromotion(manifest([invalid, skipped]), { documents: {}, mediaHashes: {} });
    expect(plan.hasConflicts).toBe(true);
    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'instructor_filters', status: 'CONFLICT' }),
      expect.objectContaining({ kind: 'achievements_config', status: 'SKIP', reason: 'not_selected' }),
    ]));
  });

  it('plans banner media separately from course and instructor binaries', () => {
    const mediaKey = 'media:banner:one';
    const payload = {
      slides: [{
        id: 'banner-one', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '',
        backgroundImage: mediaPlaceholderUrl(mediaKey),
      }],
      slideIntervalSeconds: 8,
      slidesRandomOrder: true,
    };
    const media = [{
      mediaKey,
      ownerKind: 'resort',
      ownerLogicalKey: 'resort_slides',
      fieldPath: 'slides.0.backgroundImage',
      sourceBucket: 'ski-school-staging.firebasestorage.app',
      sourceObjectPath: 'banners/winter-banner.webp',
      sha256: 'c'.repeat(64),
      contentType: 'image/webp',
    }];
    const source = manifest([record('resort_slides', payload)], media);
    const destination = destinationMediaPath(source.media[0]!);
    expect(destination.startsWith('promotion-assets/config/')).toBe(true);
    expect(destination).not.toMatch(/^(courses|instructors)\//);
    const created = planConfigPromotion(source, { documents: {}, mediaHashes: {} });
    expect(created.operations.find((operation) => operation.kind === 'media')).toMatchObject({
      status: 'CREATE',
      targetPath: destination,
      changedFields: ['binary'],
    });
    const unchanged = planConfigPromotion(source, {
      documents: {},
      mediaHashes: { [destination]: 'c'.repeat(64) },
      mediaUrlReady: { [destination]: true },
    });
    expect(unchanged.operations.find((operation) => operation.kind === 'media')?.status).toBe('UNCHANGED');
  });
});
