const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/i;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string) {
  return usernamePattern.test(normalizeUsername(username));
}
