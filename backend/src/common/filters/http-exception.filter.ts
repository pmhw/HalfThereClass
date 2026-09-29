import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (exception as any)?.name === 'MulterError' && (exception as any)?.code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorMessage: string | string[];
    if (exception instanceof HttpException) {
      const message = exception.getResponse();
      errorMessage = typeof message === 'string' ? message : (message as any).message;
    } else if ((exception as any)?.name === 'MulterError' && (exception as any)?.code === 'LIMIT_FILE_SIZE') {
      errorMessage = '图片过大，请选择较小的图片（建议 8MB 以内）';
    } else if ((exception as any)?.message === 'File too large') {
      errorMessage = '图片过大，请选择较小的图片（建议 8MB 以内）';
      // keep status as payload too large when possible
    } else {
      errorMessage = '服务器内部错误';
    }

    const finalStatus =
      status === HttpStatus.INTERNAL_SERVER_ERROR
      && (exception as any)?.message === 'File too large'
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : status;

    this.logger.error(
      `${request.method} ${request.url} - ${finalStatus} - ${errorMessage}`,
    );

    response.status(finalStatus).json({
      code: finalStatus,
      message: errorMessage,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
