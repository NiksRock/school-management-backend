export type ValidationErrorDetail = {
  field: string;
  message: string;
};

export type ApiErrorPayload = {
  code: string;
  details?: ValidationErrorDetail[] | null;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
};

export type ApiMeta = {
  timestamp: string;
  path: string;
  method: string;
  requestId?: string;
  pagination?: PaginationMeta;
};

export type ApiSuccessResponse<T> = {
  success: true;
  message: string;
  data: T;
  error: null;
  meta: ApiMeta;
};

export type ApiErrorResponse = {
  success: false;
  message: string;
  data: null;
  error: ApiErrorPayload;
  meta: ApiMeta;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
