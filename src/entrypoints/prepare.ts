#!/usr/bin/env bun
import { Octokit } from "@octokit/rest";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { isTriggerPresent } from "../github/trigger";
import { upsertTrackingComment } from "../github/comments";
import { writeFile } from "fs/promises";

async function run() {
  const trigger = process.env.TRIGGER_PHRASE || "@agent";
  const shouldRun = isTriggerPresent(trigger);
  core.setOutput("run_agent", shouldRun ? "true" : "false");
  if (!shouldRun) return;

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const commentId = await upsertTrackingComment(
    octokit,
    `PR Agent is working… \n\n(Trigger phrase \`${trigger}\` detected)`,
  );

  // gather PR metadata
  const prNumber = github.context.payload.pull_request?.number ?? github.context.payload.issue?.number;
  if (!prNumber) {
    throw new Error("No PR or issue number found in GitHub context");
  }
  let pr, files;
  try {
    pr = await octokit.rest.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: prNumber,
    });

    // Get changed files with patch (may be truncated)
    files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: prNumber,
      per_page: 100,
    });
  } catch (error) {
    throw new Error(`GitHub API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const diff = files
    .map((f) => `File: ${f.filename}\n${f.patch ?? ""}`)
    .join("\n\n");

  const ctx = {
    repo: github.context.repo,
    commentId,
    prNumber,
    title: pr.data.title,
    body: pr.data.body ?? "",
    diff,
    thread: [] as {author: string; body: string}[],
  };

  // Collect recent user replies to agent comment for follow-up context
  let comments;
  try {
    comments = await octokit.rest.issues.listComments({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prNumber,
    });
  } catch (error) {
    throw new Error(`GitHub API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  const agentIndex = comments.data.findIndex((c) => c.id === commentId);
  if (agentIndex >= 0) {
    const replies = comments.data.slice(agentIndex + 1).filter((c) => !c.user?.login?.includes("github-actions"));
    ctx.thread = replies.map((r) => ({ author: r.user?.login ?? "", body: r.body ?? "" })).slice(-5); // last 5
  }

  const ctxPath = `${process.env.RUNNER_TEMP}/pr-agent-context.json`;
  await writeFile(ctxPath, JSON.stringify(ctx), "utf8");
  core.setOutput("context_file", ctxPath);
}

run(); 