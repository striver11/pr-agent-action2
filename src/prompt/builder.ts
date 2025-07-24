import { readFileSync } from "fs";
import { join } from "path";

export interface PromptContext {
  title: string;
  body: string;
  diff: string;
  tokenLimit: number;
  thread?: { author: string; body: string }[];
  repo: { owner: string; repo: string };
  prNumber: number;
}

export function buildPrompt(ctx: PromptContext): string {
  // Read the template file using GitHub Action path (ES modules compatible)
  const templatePath = join(process.env.GITHUB_ACTION_PATH || ".", "src", "prompt", "review-template.md");
  let template: string;
  try {
    template = readFileSync(templatePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to load prompt template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Format thread context
  let threadContent = "";
  if (ctx.thread && ctx.thread.length > 0) {
    threadContent = ctx.thread
      .map((m) => `@${m.author}: ${m.body.replace(/\n/g, " ")}`)
      .join("\n");
  }

  // Apply diff truncation
  const allowed = ctx.tokenLimit * 4; // rough char estimate
  let diff = ctx.diff;
  if (diff.length > allowed) {
    diff = diff.slice(0, allowed) + "\n... (truncated)";
  }

  // Replace template placeholders
  return template
    .replace("{{REPO}}", `${ctx.repo.owner}/${ctx.repo.repo}`)
    .replace("{{PR_NUMBER}}", ctx.prNumber.toString())
    .replace("{{TITLE}}", ctx.title)
    .replace("{{BODY}}", ctx.body)
    .replace("{{DIFF}}", diff)
    .replace("{{THREAD}}", threadContent);
} 