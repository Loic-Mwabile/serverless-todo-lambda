// Pluggable data layer for tasks.
//
// - If the TABLE_NAME environment variable is set (the real AWS deployment),
//   all operations go to Amazon DynamoDB via the AWS SDK v3, which is
//   pre-installed in the Lambda Node.js runtime.
// - Otherwise (local development / `sam local` without AWS credentials), an
//   in-memory array is used so the API runs with zero setup.
//
// NOTE: the in-memory store is per-process. On real Lambda it would NOT persist
// across cold starts — that is exactly why DynamoDB is used in production.

import { randomUUID } from 'node:crypto';

const TABLE_NAME = process.env.TABLE_NAME;

// ---------- In-memory implementation ----------
let memoryTasks = [
  { id: 'seed-1', title: 'Read the AWS Lambda docs', completed: true, createdAt: new Date().toISOString() },
  { id: 'seed-2', title: 'Deploy this API with SAM', completed: false, createdAt: new Date().toISOString() },
];

const memoryRepo = {
  async list() {
    return memoryTasks;
  },
  async create(task) {
    memoryTasks.push(task);
    return task;
  },
  async update(id, patch) {
    const index = memoryTasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    memoryTasks[index] = { ...memoryTasks[index], ...patch, id };
    return memoryTasks[index];
  },
  async remove(id) {
    const index = memoryTasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const [removed] = memoryTasks.splice(index, 1);
    return removed;
  },
};

// ---------- DynamoDB implementation ----------
// The SDK is imported lazily so local in-memory mode needs no dependencies.
function createDynamoRepo() {
  let docClientPromise;

  async function getClient() {
    if (!docClientPromise) {
      docClientPromise = (async () => {
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        return DynamoDBDocumentClient.from(new DynamoDBClient({}));
      })();
    }
    return docClientPromise;
  }

  return {
    async list() {
      const client = await getClient();
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      const res = await client.send(new ScanCommand({ TableName: TABLE_NAME }));
      return res.Items || [];
    },
    async create(task) {
      const client = await getClient();
      const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
      await client.send(new PutCommand({ TableName: TABLE_NAME, Item: task }));
      return task;
    },
    async update(id, patch) {
      const client = await getClient();
      const { GetCommand, PutCommand } = await import('@aws-sdk/lib-dynamodb');
      const existing = await client.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
      if (!existing.Item) return null;
      const updated = { ...existing.Item, ...patch, id };
      await client.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      return updated;
    },
    async remove(id) {
      const client = await getClient();
      const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
      const res = await client.send(
        new DeleteCommand({ TableName: TABLE_NAME, Key: { id }, ReturnValues: 'ALL_OLD' })
      );
      return res.Attributes || null;
    },
  };
}

export const repo = TABLE_NAME ? createDynamoRepo() : memoryRepo;
export const newId = () => randomUUID();
export const usingDynamo = Boolean(TABLE_NAME);
