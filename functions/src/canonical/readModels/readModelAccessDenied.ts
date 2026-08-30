export class ReadModelAccessDeniedError extends Error {
  readonly code = 'permission-denied' as const;

  constructor() {
    super('This action is not permitted.');
    this.name = 'ReadModelAccessDeniedError';
  }
}
