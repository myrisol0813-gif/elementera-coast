import { onRequest as legacyOnRequest } from './_middleware.full.js';
import { routeChatRequest } from './chat-router.js';

export async function onRequest(context) {
  const chatResponse = await routeChatRequest(context, legacyOnRequest);
  return chatResponse || legacyOnRequest(context);
}
