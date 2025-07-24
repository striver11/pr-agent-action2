#!/usr/bin/env bun
import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import { readFile } from "fs/promises";

async function run() {
  try {
    const contextPath = core.getInput("context_file", { required: true });
    const bodyPath = core.getInput("body_file", { required: true });
    const context = JSON.parse(await readFile(contextPath, "utf8"));
    const body = await readFile(bodyPath, "utf8");

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    await octokit.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: context.commentId,
      body,
    });
  } catch (err: any) {
    core.setFailed(err.message);
  }
}

run(); 