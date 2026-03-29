import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Documents the actual wire format: the ApiSuccessResponse<T> envelope that
 * TransformResponseInterceptor wraps around every controller return value.
 *
 * Usage:
 *   @ApiWrappedResponse(SafeUserResponseDto)           // 200
 *   @ApiWrappedResponse(AuthResponseDto, HttpStatus.CREATED)  // 201
 */
export const ApiWrappedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  status: number = HttpStatus.OK,
): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              message: {
                type: 'string',
                example: 'Operation completed successfully',
              },
              data: { $ref: getSchemaPath(model) },
              error: { type: 'object', nullable: true, example: null },
              meta: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string', format: 'date-time' },
                  path: { type: 'string', example: '/auth/me' },
                  method: { type: 'string', example: 'GET' },
                  requestId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        ],
      },
    }),
  );

/**
 * Documents paginated list responses.
 */
export const ApiWrappedPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: HttpStatus.OK,
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string' },
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              error: { type: 'object', nullable: true, example: null },
              meta: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string', format: 'date-time' },
                  path: { type: 'string' },
                  method: { type: 'string' },
                  requestId: { type: 'string' },
                  pagination: {
                    type: 'object',
                    properties: {
                      page: { type: 'number', example: 1 },
                      limit: { type: 'number', example: 20 },
                      total: { type: 'number', example: 4 },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }),
  );
