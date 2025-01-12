import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.status || 500;
  const code = err.code || 'SERVER_ERROR';
  
  res.status(status).json({
    error: err.name || 'Error',
    details: {
      code,
      message: err.message || 'Internal Server Error'
    }
  });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
