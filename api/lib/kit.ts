// Kit (ConvertKit) API v4 client. Contracts verified against https://developers.kit.com/api-reference (Sep 2026).
import { KIT_FIELD_KEYS, QUIZ_TAKER_TAG, STYLE_TAG_NAMES, type StyleTagName } from "./tags";

const KIT_BASE_URL = "https://api.kit.com/v4";
// The visitor is waiting on this request, so no single Kit call is allowed to hang the results.
const KIT_TIMEOUT_MS = 4000;

function getApiKey(): string {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    throw new Error("KIT_API_KEY is not set");
  }
  return apiKey;
}

async function kitFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${KIT_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(KIT_TIMEOUT_MS),
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
  options: { firstName?: string; fields?: Record<string, string> } = {}
): Promise<KitSubscriber> {
  const body: Record<string, unknown> = { email_address: email };
  if (options.firstName) body.first_name = options.firstName;
  if (options.fields && Object.keys(options.fields).length > 0) body.fields = options.fields;
  const result = await kitFetch<{ subscriber: KitSubscriber }>("/subscribers", {
    method: "POST",
    body: JSON.stringify(body),
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

async function addTag(email: string, tagName: string): Promise<void> {
  await tagSubscriberByEmail(await resolveOrCreateTag(tagName), email);
}

// Names of the tags currently on a subscriber (first page is plenty: a quiz taker has a handful).
async function listTagNames(subscriberId: number): Promise<string[]> {
  const result = await kitFetch<{ tags: { name: string }[] }>(`/subscribers/${subscriberId}/tags`);
  return result.tags.map((tag) => tag.name);
}

export interface QuizSignup {
  email: string;
  firstName?: string;
  /** YYYY-MM */
  weddingDate?: string;
  /** Which blog post the visitor came from (the ?src= value). */
  signupSource?: string;
  /** The #1 venue's first style, or null when the sheet's style text isn't one of the five. */
  topStyle: StyleTagName | null;
  /** Simple HTML of the matches shown on screen; email #1 inserts this field. */
  quizResultsHtml: string;
}

// Full quiz-to-Kit sync, per the launch plan:
//  1. Create/update the subscriber with first name + custom fields.
//  2. Tag "Quiz taker" (every time; tagging is idempotent).
//  3. Tag the top style ONLY if the subscriber has no style tag yet, so a retake that lands on a
//     different style doesn't start a second welcome sequence. top_style follows the same rule, so
//     the field never disagrees with the tag that drove the sequence.
export async function syncQuizSignup(signup: QuizSignup): Promise<void> {
  const fields: Record<string, string> = {
    [KIT_FIELD_KEYS.quizResults]: signup.quizResultsHtml,
  };
  if (signup.weddingDate) fields[KIT_FIELD_KEYS.weddingDate] = signup.weddingDate;
  if (signup.signupSource) fields[KIT_FIELD_KEYS.signupSource] = signup.signupSource;

  const subscriber = await upsertSubscriber(signup.email, { firstName: signup.firstName, fields });

  await addTag(signup.email, QUIZ_TAKER_TAG);

  if (!signup.topStyle) return;

  const existing = await listTagNames(subscriber.id);
  const styleNames: string[] = [...STYLE_TAG_NAMES];
  const hasStyleTag = existing.some((name) => styleNames.some((style) => style.toLowerCase() === name.toLowerCase()));
  if (hasStyleTag) return;

  await upsertSubscriber(signup.email, { fields: { [KIT_FIELD_KEYS.topStyle]: signup.topStyle } });
  await addTag(signup.email, signup.topStyle);
}
