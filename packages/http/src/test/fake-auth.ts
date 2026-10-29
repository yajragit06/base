import { type AuthAdapter, type Profile, UnverifiedEmailError } from "../auth.js";

/** Tokens map straight to auth ids; counts profile lookups so tests can see caching. */
export function fakeAuth(
  people: Record<string, { authId: string; unverified?: boolean } & Profile>,
) {
  const calls = { getProfile: 0 };
  const adapter: AuthAdapter = {
    async verify(token) {
      return people[token]?.authId ?? null;
    },
    async getProfile(authId) {
      calls.getProfile += 1;
      const person = Object.values(people).find((p) => p.authId === authId);
      if (!person) throw new Error(`no profile for ${authId}`);
      if (person.unverified) throw new UnverifiedEmailError(authId);
      return { email: person.email, name: person.name };
    },
  };
  return { adapter, calls };
}
