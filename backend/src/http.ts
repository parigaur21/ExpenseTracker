import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
}

