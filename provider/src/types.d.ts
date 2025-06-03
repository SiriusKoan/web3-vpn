declare module 'koa';
declare module 'koa-router';
declare module 'koa-bodyparser';

// Extend the Request interface to ensure type safety for request body
declare namespace Koa {
  interface Request {
    body?: any;
  }
  
  interface Context {
    request: Request;
  }

  type Next = () => Promise<void>;
}