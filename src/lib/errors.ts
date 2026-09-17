/**
 * Errors that cross the server/browser boundary.
 *
 * Kept in a neutral module on purpose. `ApiError` is thrown by server
 * functions and caught by components, so both sides need the class -- and if
 * it lived in a `.server.ts` file, importing it from a component would pull
 * the service-role Supabase client into the browser bundle with it.
 */

/** A failure we are willing to describe to a customer. */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}
