import { Reflector } from '@nestjs/core';

export const CurrentUser = Reflector.createDecorator<string[]>();
