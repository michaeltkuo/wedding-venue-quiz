// Kit (ConvertKit) API v4 client. Contracts verified against https://developers.kit.com/api-reference (Sep 2026).
const KIT_BASE_URL = "https://api.kit.com/v4";

function getApiKey(): string {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    throw new Error("KIT_API_KEY is not set");
  }
  return apiKey;
}

async function kitFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${KIT_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": getApiKey(),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kit API ${path} failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

export interface KitSubscriber {
  id: number;
  email_address: string;
  first_name: string | null;
  state: string;
}

// POST /v4/subscribers is an upsert by email_address; safe to call on every submission.
export async function upsertSubscriber(
  email: string,
  fields?: Record<string, string>
): Promise<KitSubscriber> {
  const result = await kitFetch<{ subscriber: KitSubscriber }>("/subscribers", {
    method: "POST",
    body: JSON.stringify({ email_address: email, fields }),
  });
  return result.subscriber;
}

// POST /v4/tags is idempotent on name (case-insensitive), so this doubles as "find or create".
export async function resolveOrCreateTag(name: string): Promise<number> {
  const result = await kitFetch<{ tag: { id: number; name: string } }>("/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return result.tag.id;
}

export async function tagSubscriberByEmail(tagId: number, email: string): Promise<void> {
  await kitFetch(`/tags/${tagId}/subscribers`, {
    method: "POST",
    body: JSON.stringify({ email_address: email }),
  });
}

export async function tagSubscriberWithNames(email: string, tagNames: string[]): Promise<void> {
  for (const name of tagNames) {
    const tagId = await resolveOrCreateTag(name);
    await tagSubscriberByEmail(tagId, email);
  }
}
