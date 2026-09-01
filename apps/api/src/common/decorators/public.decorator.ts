import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'atcon:isPublic';

// Opt-out rather than opt-in, so a route someone forgets to decorate ends up
// locked instead of public.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
