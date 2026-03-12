#!/usr/bin/env node

import OpenAI from "openai";
import type { FunctionTool } from "openai/resources/responses/responses.js";
import { defineCommand, runMain } from "citty";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export const readFile = ({ path }: { path: string }) => {
  const absolutePath = join(process.cwd(), path);
  return readFileSync(absolutePath, "utf-8");
};

export const writeFile = ({
  path,
  content,
}: {
  path: string;
  content: string;
}) => {
  const absolutePath = join(process.cwd(), path);
  writeFileSync(absolutePath, content);
  return `File written to ${path}`;
};

const bash = ({ command }: { command: string }) => {
  try {
    const result = execSync(command, {
      encoding: "utf-8",
      shell: "/bin/bash",
      cwd: process.cwd(),
    });

    return result.trim() || "ok";
  } catch (error: any) {
    return (
      error?.stderr?.toString()?.trim() ||
      error?.stdout?.toString()?.trim() ||
      error?.message ||
      "command failed"
    );
  }
};

const functions: any = {
  readFile: readFile,
  writeFile: writeFile,
  bash: bash,
};

const main = defineCommand({
  meta: {
    name: "agent",
    version: "0.0.1",
    description: "Agent CLI scaffold powered by citty",
  },
  args: {
    message: {
      type: "string",
      description: "The message to send to the agent",
    },
  },
  async run({ args }) {
    const apiKey = process.env.OPENAI_API_KEY;
    const message = args.message?.trim();

    if (!message) {
      throw new Error("message is required");
    }

    const client = new OpenAI({ apiKey });

    const messages: any[] = [
      {
        role: "user",
        content: message,
      },
    ];

    const tools: FunctionTool[] = [
      {
        name: "readFile",
        description: "Read a file",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
        type: "function",
        strict: true,
      },
      {
        name: "writeFile",
        description: "Write a file",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
        type: "function",
        strict: true,
      },
      {
        name: "bash",
        description: "Run a bash command",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            command: { type: "string" },
          },
          required: ["command"],
        },
        type: "function",
        strict: true,
      },
    ];

    while (true) {
      const response = await client.responses.create({
        model: "gpt-4o-mini",
        instructions: "You are a coding assistant",
        input: messages,
        tools,
      });

      const output = response.output[0] as any;
      messages.push(output);
      if (output.type === "message") {
        console.log(output.content[0].text);
        return;
      }

      if (output.type === "function_call") {
        const { name, call_id, arguments: functionArguments } = output;
        const parsedFunctionArguments = JSON.parse(functionArguments);
        const functionResult = functions[name](parsedFunctionArguments);
        messages.push({
          type: "function_call_output",
          call_id,
          output: functionResult,
        });
      }
    }
  },
});

runMain(main);
