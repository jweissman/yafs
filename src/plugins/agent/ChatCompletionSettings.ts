export type ChatCompletionSettings = { apiUrl: string; model?: string };

export function chatCompletionSettings(
  environment = process.env,
): ChatCompletionSettings {
  const apiUrl = environment.YAFS_LLM_BASE_URL || "http://localhost:1234/v1";
  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    model: environment.YAFS_LLM_MODEL,
  };
}
