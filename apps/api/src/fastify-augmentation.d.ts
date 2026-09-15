declare module 'fastify' {
  interface FastifyInstance {
    httpErrors?: {
      badRequest?: (message?: string) => Error;
      notFound?: (message?: string) => Error;
    };
  }
}
export {};
