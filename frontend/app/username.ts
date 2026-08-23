const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function isValidUsername(username: string) {
  return usernamePattern.test(username);
}
