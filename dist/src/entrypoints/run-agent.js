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
const core = __importStar(require("@actions/core"));
const promises_1 = require("fs/promises");
const openai_1 = require("../llm/openai");
const anthropic_1 = require("../llm/anthropic");
const builder_1 = require("../prompt/builder");
const inline_1 = require("../github/inline");
const rest_1 = require("@octokit/rest");
function detectProvider(model) {
    if (model.startsWith("claude"))
        return "anthropic";
    if (model.startsWith("gpt") || model.startsWith("o3"))
        return "openai";
    throw new Error("Unknown model prefix");
}
function parsePositiveInteger(value, fieldName) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${fieldName} value: ${value}`);
    }
    return parsed;
}
async function run() {
    try {
        const contextPath = core.getInput("context_file", { required: true });
        const context = JSON.parse(await (0, promises_1.readFile)(contextPath, "utf8"));
        const model = core.getInput("model") || process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL;
        if (!model)
            throw new Error("model not specified");
        const provider = detectProvider(model);
        const prompt = (0, builder_1.buildPrompt)({
            title: context.title,
            body: context.body,
            diff: context.diff,
            thread: context.thread,
            tokenLimit: parsePositiveInteger(core.getInput("max_tokens") || process.env.MAX_TOKENS || "25000", "max_tokens"),
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
            }
            else if (provider === "openai") {
                answer = await (0, openai_1.chatCompletion)(messages, {
                    apiKey: process.env.OPENAI_API_KEY,
                    model,
                    timeoutMs: parsePositiveInteger(core.getInput("timeout_ms") || process.env.TIMEOUT_MS || "60000", "timeout_ms"),
                });
            }
            else {
                answer = await (0, anthropic_1.anthropicChat)(messages, {
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    model,
                    maxTokens: 1024,
                    timeoutMs: parsePositiveInteger(core.getInput("timeout_ms") || process.env.TIMEOUT_MS || "60000", "timeout_ms"),
                });
            }
        }
        catch (err) {
            answer = `⚠️ LLM call failed: ${err.message}`;
        }
        // Try to detect JSON block with inline comments
        let inline = [];
        const jsonMatch = answer.match(/```json([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                inline = JSON.parse(jsonMatch[1].trim());
                answer = answer.replace(jsonMatch[0], "").trim();
            }
            catch { }
        }
        if (inline.length > 0) {
            const octokit = new rest_1.Octokit({ auth: process.env.GITHUB_TOKEN });
            await (0, inline_1.postInlineReview)(octokit, context.repo.owner, context.repo.repo, context.prNumber, inline, answer);
        }
        const bodyPath = `${process.env.RUNNER_TEMP}/pr-agent-body.txt`;
        await (0, promises_1.writeFile)(bodyPath, answer, "utf8");
        core.setOutput("body_file", bodyPath);
    }
    catch (err) {
        core.setFailed(err.message);
    }
}
run();
