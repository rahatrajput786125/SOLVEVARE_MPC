import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

// Catches every unhandled exception in the app.
// Returns a consistent { success, error, statusCode } shape.
// Without this, NestJS returns different shapes for different error types.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let errors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const resp = exceptionResponse as Record<string, unknown>;
        // NestJS ValidationPipe returns { message: string[] } for 400s
        message = (resp.message as string) ?? (resp.error as string) ?? message;
        errors = Array.isArray(resp.message) ? resp.message : undefined;
      }
    } else if (exception instanceof Error) {
      // Log unexpected errors with full stack — these are bugs
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
        `${request.method} ${request.url}`
      );
    }

    response.status(status).json({
      success: false,
      error: message,
      ...(errors ? { errors } : {}),
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
