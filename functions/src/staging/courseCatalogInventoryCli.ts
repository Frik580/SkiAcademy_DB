import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  documentMatchesReadScope,
  LIVE_CANONICAL_READ_SCOPE,
  TestSessionIdSchema,
} from '@ski-academy/shared-domain';
import { parseCourseCatalogContent } from '../canonical/courses/courseCatalogContentStore';
import { parseCourse } from '../canonical/courses/courseStore';

function scopeOf(data: FirebaseFirestore.DocumentData): string {
  if (documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, data)) return 'live';
  const session = TestSessionIdSchema.safeParse(data.testSessionId);
  if (
    session.success &&
    documentMatchesReadScope({ dataScope: 'test', testSessionId: session.data }, data)
  ) {
    return `test/${data.testSessionId}`;
  }
  return 'invalid';
}

async function* documents(db: Firestore, collection: string) {
  const query = db.collection(collection).orderBy(FieldPath.documentId());
  let after: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (after ? query.startAfter(after) : query).limit(200).get();
    yield* page.docs;
    if (page.size < 200) return;
    after = page.docs.at(-1);
  }
}

export async function inventoryCourseCatalog(db: Firestore) {
  const contentById = new Map<string, { scope: string; discipline: unknown; valid: boolean }>();
  const invalidContent: { id: string; scope: string }[] = [];
  for await (const doc of documents(db, 'course_catalog_content')) {
    const data = doc.data();
    const scope = scopeOf(data);
    const parsed = parseCourseCatalogContent(data);
    const valid = scope !== 'invalid' && parsed?.courseId === doc.id;
    contentById.set(doc.id, { scope, discipline: data.discipline, valid });
    if (!valid) invalidContent.push({ id: doc.id, scope });
  }

  const counts: Record<string, number> = {};
  const issues = [];
  for await (const doc of documents(db, 'courses')) {
    const data = doc.data();
    const scope = scopeOf(data);
    const course = parseCourse(data);
    if (!course || course.courseId !== doc.id || scope === 'invalid') continue;
    const key = `${scope}/${course.lifecycle}`;
    counts[key] = (counts[key] ?? 0) + 1;
    const candidate = contentById.get(doc.id);
    const content = candidate?.scope === scope ? candidate : undefined;
    const problems = [];
    if (!content) problems.push('missing_content');
    else {
      if (!content.valid) problems.push('invalid_content');
      if (content.discipline === undefined) problems.push('missing_discipline');
      else if (content.discipline !== 'ski') problems.push('non_ski_discipline');
    }
    if (problems.length) {
      issues.push({
        id: doc.id,
        scope,
        lifecycle: course.lifecycle,
        problems,
        discipline:
          content?.discipline === 'ski' || content?.discipline === 'snowboard'
            ? content.discipline
            : undefined,
      });
    }
  }
  return { counts, issues, invalidContent };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const project = args[1];
  if (
    !project ||
    (emulator
      ? args.length !== 2 ||
        args[0] !== '--project' ||
        !project.startsWith('demo-') ||
        !/^(localhost|127\.0\.0\.1):\d+$/.test(emulator)
      : args.length !== 3 ||
        args[0] !== '--project' ||
        project !== 'ski-school-8f3ca' ||
        args[2] !== '--confirmed-production-read-only')
  ) {
    throw new Error(
      'Use a local demo emulator, or explicitly confirm a read-only production inventory.'
    );
  }
  const app = initializeApp({
    projectId: project,
    ...(emulator ? {} : { credential: applicationDefault() }),
  });
  inventoryCourseCatalog(getFirestore(app))
    .then((result) => console.log(JSON.stringify({ project, ...result }, null, 2)))
    .finally(() => deleteApp(app))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
