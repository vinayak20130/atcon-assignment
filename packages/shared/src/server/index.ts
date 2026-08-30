/**
 * Server-only entry point (@atcon/shared/server).
 *
 * Node-only code lives here so it never reaches a browser bundle through the
 * main barrel.
 */
export * from './password';
