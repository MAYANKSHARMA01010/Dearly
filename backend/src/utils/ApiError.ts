export interface ValidationDetail {
  field: string;
  code: string;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ValidationDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
