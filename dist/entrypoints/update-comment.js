#!/usr/bin/env bun
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { readFile } from "fs/promises";
async function run() {
    try {
        // const contextPath = core.getInput("context_file", { required: true });
        // const bodyPath = core.getInput("body_file", { required: true });
        const contextPath = core.getInput("context_file") || process.argv.includes('--context_file')
            ? process.argv[process.argv.indexOf('--context_file') + 1]
            : undefined;
        
        const bodyPath = core.getInput("body_file") || process.argv.includes('--body_file')
            ? process.argv[process.argv.indexOf('--body_file') + 1]
            : undefined;
        
        if (!contextPath || !bodyPath) {
            throw new Error("context_file and body_file must be provided either as input or CLI args.");
        }
      
        const context = JSON.parse(await readFile(contextPath, "utf8"));
        const body = await readFile(bodyPath, "utf8");
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        await octokit.rest.issues.updateComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: context.commentId,
            body,
        });
    }
    catch (err) {
        core.setFailed(err.message);
    }
}
run();
