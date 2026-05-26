import { getModel } from "@earendil-works/pi-ai";
import type { Model, Api } from "@earendil-works/pi-ai";

export function getFlashModel(): Model<Api> {
  return getModel("deepseek", "deepseek-v4-flash");
}

export function getProModel(): Model<Api> {
  return getModel("deepseek", "deepseek-v4-pro");
}

export function getApiKey(): string {
  return process.env.DEEPSEEK_API_KEY || "";
}
