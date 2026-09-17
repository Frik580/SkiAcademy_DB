export class InsufficientFundsError extends Error {
  constructor(
    readonly currentBalance?: number,
    readonly required?: number
  ) {
    super('Insufficient funds');
    this.name = 'InsufficientFundsError';
  }
}
