import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'atcon:isPublic';

/**
 * Opts a route out of authentication.
 *
 * Authentication is global and opt-OUT rather than opt-in: forgetting a
 * decorator then leaves an endpoint locked rather than wide open, which is the
 * right way round for a system holding candidates' personal data.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
