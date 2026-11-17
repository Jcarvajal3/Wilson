/**
 * Target application registry for network rule inspection and diagnostic checks.
 */

export const TARGETS = [
  {
    id: "claude",
    name: "Claude",
    domainRule: "(anthropic|claude)",
    sampleDomains: ["claude.ai", "api.anthropic.com"],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    domainRule: "(openai|chatgpt|oaistatic|oaiusercontent)",
    sampleDomains: ["chatgpt.com", "api.openai.com"],
  },
  {
    id: "custom",
    name: "Proyecto Propio",
    domainRule: "(example|myproject)",
    sampleDomains: ["api.ipify.org", "cloudflare.com"],
  },
];

/**
 * Look up a target definition by id, falling back to `claude` when unknown.
 * @param {string} [id]
 * @returns {{ id: string, name: string, domainRule: string, sampleDomains: string[] }}
 */
export function getTargetById(id) {
  if (typeof id === "string" && id.trim().length > 0) {
    const normalized = id.trim().toLowerCase();
    const found = TARGETS.find((target) => target.id === normalized);
    if (found) {
      return found;
    }
  }
  return TARGETS[0];
}
