import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

@Catch()
export class ProblemDetailsFilter<T> implements ExceptionFilter {
  catch(exception: T, host: ArgumentsHost) {}
}
