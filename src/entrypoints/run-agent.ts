#!/usr/bin/env bun
import * as core from "@actions/core";
import { readFile, writeFile } from "fs/promises";
import { chatCompletion } from "../llm/openai";
import { anthropicChat } from "../llm/anthropic";
import { buildPrompt } from "../prompt/builder";
import { postInlineReview, InlineComment } from "../github/inline";
import { Octokit } from "@octokit/rest";

function detectProvider(model: string) {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o3")) return "openai";
  throw new Error("Unknown model prefix");
}

function parsePositiveInteger(value: string, fieldName: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName} value: ${value}`);
  }
  return parsed;
}

async function run() {
  try {
    const contextPath = core.getInput("context_file", { required: true });
    const context = JSON.parse(await readFile(contextPath, "utf8"));

    const model = core.getInput("model") || process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL;
    if (!model) throw new Error("model not specified");
    const provider = detectProvider(model);

    const prompt = buildPrompt({
      title: context.title,
      body: context.body,
      diff: context.diff,
      thread: context.thread,
      tokenLimit: parsePositiveInteger(
        core.getInput("max_tokens") || process.env.MAX_TOKENS || "25000",
        "max_tokens"
      ),
      repo: context.repo,
      prNumber: context.prNumber,
    });

    const messages = [
      { role: "user", content: prompt },
    ];

    let answer = "";
    try {
      if (process.env.LLM_FAKE_RESPONSE) {
        answer = process.env.LLM_FAKE_RESPONSE;
      } else if (provider === "openai") {
        answer = await chatCompletion(messages as any, {
          apiKey: process.env.OPENAI_API_KEY!,
          model,
          timeoutMs: parsePositiveInteger(
            core.getInput("timeout_ms") || process.env.TIMEOUT_MS || "60000",
            "timeout_ms"
          ),
        });
      } else {
        answer = await anthropicChat(messages as any, {
          apiKey: process.env.ANTHROPIC_API_KEY!,
          model,
          maxTokens: 1024,
          timeoutMs: parsePositiveInteger(
            core.getInput("timeout_ms") || process.env.TIMEOUT_MS || "60000",
            "timeout_ms"
          ),
        });
      }
    } catch (err: any) {
      answer = `⚠️ LLM call failed: ${err.message}`;
    }

    // Try to detect JSON block with inline comments
    let inline: InlineComment[] = [];
    const jsonMatch = answer.match(/```json([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        inline = JSON.parse(jsonMatch[1].trim());
        answer = answer.replace(jsonMatch[0], "").trim();
      } catch {}
    }

    if (inline.length > 0) {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      await postInlineReview(
        octokit,
        context.repo.owner,
        context.repo.repo,
        context.prNumber,
        inline,
        answer,
      );
    }

    const bodyPath = `${process.env.RUNNER_TEMP}/pr-agent-body.txt`;
    await writeFile(bodyPath, answer, "utf8");

    core.setOutput("body_file", bodyPath);
  } catch (err: any) {
    core.setFailed(err.message);
  }
}

run(); 