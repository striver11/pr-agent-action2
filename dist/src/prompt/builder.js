"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
const fs_1 = require("fs");
const path_1 = require("path");
function buildPrompt(ctx) {
    // Read the template file using GitHub Action path (ES modules compatible)
    const templatePath = (0, path_1.join)(process.env.GITHUB_ACTION_PATH || ".", "src", "prompt", "review-template.md");
    let template;
    try {
        template = (0, fs_1.readFileSync)(templatePath, "utf8");
    }
    catch (error) {
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
