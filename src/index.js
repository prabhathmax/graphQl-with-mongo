import 'dotenv/config';
import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import schema from './graphql';
import model from './models';
import AuthenticatedDirective from './graphql/directives/authenticated';

const getCurrentUserId = async ({ headers }) => {
  const matcher = /^Bearer .+$/gi;
  const { authorization = null } = headers;

  if (authorization && matcher.test(authorization)) {
    const [, token] = authorization.split(/\s+/);

    try {
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.id;
      }
    } catch (e) {
      // We do nothing so it returns null
    }
  }

  return null;
};

const startServer = async () => {
  const server = new ApolloServer({
    typeDefs: schema.typeDefs,
    resolvers: schema.resolvers,
    schemaDirectives: {
      authenticated: AuthenticatedDirective,
    },
    context: async ({ req }) => {
      const currentUser = await getCurrentUserId(req);
      return { model, currentUser };
    },
  });

  const app = express();
  server.applyMiddleware({ app });

  // DB connection
  await mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  });
  // mongoose.set('debug', true);

  app.listen({ port: 4000 }, () =>
    // eslint-disable-next-line no-console
    console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`),
  );
};

startServer();
