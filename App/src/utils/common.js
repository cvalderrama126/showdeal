function parseYmdDate(value) {
  if (!value || typeof value !== "string") return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestCredential(authentication) {
  const credentials = Array.isArray(authentication) ? authentication : [];
  if (credentials.length === 0) return null;

  let bestCredential = null;
  let bestCreatedAt = null;
  let bestIndex = -1;

  credentials.forEach((item, index) => {
    const created = parseYmdDate(item?.created);
    if (!created) return;

    if (
      !bestCreatedAt
      || created.getTime() > bestCreatedAt.getTime()
      || (created.getTime() === bestCreatedAt.getTime() && index > bestIndex)
    ) {
      bestCreatedAt = created;
      bestCredential = item;
      bestIndex = index;
    }
  });

  if (!bestCredential) {
    const last = credentials[credentials.length - 1];
    return last && typeof last === "object" ? last : null;
  }

  return bestCredential;
}

function toBigIntOrNull(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text);
}

function parseInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return fallback;
  return Math.min(parsed, max);
}

function mergeAdditional(base, patch) {
  const safeBase = base && typeof base === "object" ? base : {};
  const safePatch = patch && typeof patch === "object" ? patch : {};
  return {
    ...safeBase,
    ...safePatch,
  };
}

module.exports = {
  parseYmdDate,
  getLatestCredential,
  toBigIntOrNull,
  parseInteger,
  mergeAdditional,
};
