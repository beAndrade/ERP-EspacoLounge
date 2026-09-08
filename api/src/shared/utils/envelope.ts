export type ApiError = { code: string; message: string };

export type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
};

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data, error: null };
}

export function fail<T = null>(
  code: string,
  message: string,
): ApiResponse<T> {
  return { ok: false, data: null, error: { code, message } };
}
