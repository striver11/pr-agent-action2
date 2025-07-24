#!/usr/bin/env bun
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const rest_1 = require("@octokit/rest");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const trigger_1 = require("../github/trigger");
const comments_1 = require("../github/comments");
const promises_1 = require("fs/promises");
async function run() {
    const trigger = process.env.TRIGGER_PHRASE || "@agent";
    const shouldRun = (0, trigger_1.isTriggerPresent)(trigger);
    core.setOutput("run_agent", shouldRun ? "true" : "false");
    if (!shouldRun)
        return;
    const octokit = new rest_1.Octokit({ auth: process.env.GITHUB_TOKEN });
    const commentId = await (0, comments_1.upsertTrackingComment)(octokit, `PR Agent is working… \n\n(Trigger phrase \`${trigger}\` detected)`);
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
    }
    catch (error) {
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
        thread: [],
    };
    // Collect recent user replies to agent comment for follow-up context
    let comments;
    try {
        comments = await octokit.rest.issues.listComments({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: prNumber,
        });
    }
    catch (error) {
        throw new Error(`GitHub API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    const agentIndex = comments.data.findIndex((c) => c.id === commentId);
    if (agentIndex >= 0) {
        const replies = comments.data.slice(agentIndex + 1).filter((c) => !c.user?.login?.includes("github-actions"));
        ctx.thread = replies.map((r) => ({ author: r.user?.login ?? "", body: r.body ?? "" })).slice(-5); // last 5
    }
    const ctxPath = `${process.env.RUNNER_TEMP}/pr-agent-context.json`;
    await (0, promises_1.writeFile)(ctxPath, JSON.stringify(ctx), "utf8");
    core.setOutput("context_file", ctxPath);
}
run();
