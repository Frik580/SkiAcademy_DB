import {
  CourseProvisioningManifestSchema,
  type CourseProvisioningManifest,
} from '@ski-academy/shared-domain';
import rawManifest from './manifest-course_1784217360616.json';

export const T31B_PILOT_COURSE_ID = 'course_1784217360616' as const;

export const T31B_PILOT_EXPECTED_FINGERPRINT =
  '6d8aef9172c3a7cd0e766a80e7feec3d8450fe28ca8488acf717745c170ae67f' as const;

export const T31B_PILOT_DRY_RUN_IDEMPOTENCY_KEY = 't31b-pilot-dry-run-base-20260830' as const;

export const T31B_PILOT_APPLY_IDEMPOTENCY_KEY = 't31b-pilot-apply-base-20260830' as const;

export const T31B_PILOT_MANIFEST: CourseProvisioningManifest =
  CourseProvisioningManifestSchema.parse(rawManifest);
