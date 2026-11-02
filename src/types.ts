/**
 * mailport types.
 *
 * A core subset of the Gmail reference MCP server surface: messages,
 * threads, labels, sending, drafts, modify and trash against the
 * Gmail API. HTTP access is described by a minimal response surface
 * so tests can inject a fake fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

export interface ListMessagesOptions {
  query?: string;
  max_results?: number;
  label_ids?: string[];
}

export interface GetMessageOptions {
  message_id: string;
  format?: string;
}

export interface ListThreadsOptions {
  query?: string;
  max_results?: number;
}

export interface GetThreadOptions {
  thread_id: string;
}

export interface ListLabelsOptions {
  [key: string]: never;
}

export interface SendMessageOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

export interface CreateDraftOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

export interface ModifyMessageOptions {
  message_id: string;
  add_label_ids?: string[];
  remove_label_ids?: string[];
}

export interface TrashMessageOptions {
  message_id: string;
}

export interface CreateLabelOptions {
  name: string;
}
