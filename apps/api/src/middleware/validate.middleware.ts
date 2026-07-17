import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Express middleware factory that validates req[target] against a Zod schema.
 * On success, replaces req[target] with the parsed (and coerced/defaulted) value.
 * On failure, returns a 400 with structured error details.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const formatted = formatZodError(result.error);
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: formatted,
        },
      });
      return;
    }

    // Replace with parsed data (applies defaults, coercions, transforms)
    (req as any)[target] = result.data;
    next();
  };
}

function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
