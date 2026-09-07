import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { ApiResponse } from "@mpc/shared";

// Wraps every controller return value in { success: true, data: ... }
// This means controllers just return their data — no manual wrapping needed.
// The exception filter handles the error case.
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the controller already returned an ApiResponse shape, pass through
        if (data && typeof data === "object" && "success" in data) {
          return data;
        }
        return { success: true, data };
      })
    );
  }
}
