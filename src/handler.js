// AWS Lambda handler for the serverless TODO API.
//
// A single Lambda function handles all routes behind API Gateway (proxy
// integration). It supports both REST API (v1) and HTTP API (v2) event shapes
// so it works with either API Gateway type and with `sam local`.
//
//   GET    /tasks       -> list tasks
//   POST   /tasks       -> create a task
//   PUT    /tasks/{id}  -> update a task
//   DELETE /tasks/{id}  -> delete a task

import { repo, newId } from './repository.js';
import { response } from './response.js';

// Normalise the differences between API Gateway REST (v1) and HTTP (v2) events.
function parseEvent(event) {
  const method =
    event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.path || event.rawPath || event.requestContext?.http?.path || '/';
  const id = event.pathParameters?.id;
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      body = {};
    }
  }
  return { method, path, id, body };
}

export const handler = async (event) => {
  const { method, id, body } = parseEvent(event);

  try {
    // CORS preflight
    if (method === 'OPTIONS') {
      return response(200, { ok: true });
    }

    switch (method) {
      case 'GET': {
        const tasks = await repo.list();
        return response(200, tasks);
      }

      case 'POST': {
        if (!body.title || typeof body.title !== 'string') {
          return response(400, { message: 'A "title" string is required' });
        }
        const task = {
          id: newId(),
          title: body.title,
          completed: Boolean(body.completed) || false,
          createdAt: new Date().toISOString(),
        };
        await repo.create(task);
        return response(201, task);
      }

      case 'PUT': {
        if (!id) return response(400, { message: 'Task id is required in the path' });
        const updated = await repo.update(id, {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.completed !== undefined && { completed: Boolean(body.completed) }),
        });
        if (!updated) return response(404, { message: 'Task not found' });
        return response(200, updated);
      }

      case 'DELETE': {
        if (!id) return response(400, { message: 'Task id is required in the path' });
        const removed = await repo.remove(id);
        if (!removed) return response(404, { message: 'Task not found' });
        return response(200, removed);
      }

      default:
        return response(405, { message: `Method ${method} not allowed` });
    }
  } catch (err) {
    console.error('Handler error:', err);
    return response(500, { message: 'Internal server error' });
  }
};
