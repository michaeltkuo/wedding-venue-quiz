// Reads the quiz's answer options straight from embed-app.html, so the wording that gets embedded is
// always the wording couples actually see. Used by scripts/embeddings/build.mts and tests/semantic.test.ts.

export interface QuizOption {
  question: string;
  value: string;
  title: string;
  description: string;
}

const QUESTION_ID = /^\s*id: "([A-Za-z]+)",\s*$/;
const OPTION = /\{\s*value: "([^"]+)",(?:\s*minimumCapacity: \d+,)?\s*title: "([^"]+)",\s*description: "([^"]+)"\s*\}/;

export function extractQuizOptions(html: string): QuizOption[] {
  const start = html.indexOf("const questions = [");
  if (start === -1) throw new Error("Could not find `const questions = [` in embed-app.html");
  const options: QuizOption[] = [];
  let question: string | null = null;
  for (const line of html.slice(start).split("\n")) {
    if (/^\s*\];\s*$/.test(line)) break;
    const id = line.match(QUESTION_ID);
    if (id) {
      question = id[1];
      continue;
    }
    const option = line.match(OPTION);
    if (option && question) {
      options.push({ question, value: option[1], title: option[2], description: option[3] });
    }
  }
  return options;
}
