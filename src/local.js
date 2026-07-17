// Local test harness — lets you run the Lambda handler without SAM or Docker.
// It starts a tiny HTTP server, converts each request into an API Gateway
// (REST v1) proxy event, invokes the handler, and returns the result.
//
//   npm run local        # starts http://localhost:4000
//
// Uses the in-memory repository (no DynamoDB / AWS credentials required) as long
// as TABLE_NAME is not set.

import { createServer } from 'node:http';
import { handler } from './handler.js';

const PORT = process.env.PORT || 4000;

const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', async () => {
    // /tasks/:id -> pathParameters.id
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const segments = url.pathname.split('/').filter(Boolean); // e.g. ['tasks', 'abc']
    const id = segments[0] === 'tasks' ? segments[1] : undefined;

    const event = {
      httpMethod: req.method,
      path: url.pathname,
      pathParameters: id ? { id } : null,
      body: raw || null,
    };

    const result = await handler(event);
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  });
});

server.listen(PORT, () => {
  console.log(`Local TODO API (Lambda handler) running on http://localhost:${PORT}`);
  console.log('Try:  curl http://localhost:' + PORT + '/tasks');
});
