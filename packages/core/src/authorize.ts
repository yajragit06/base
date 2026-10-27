export interface Actor {
  type: "user" | "agent" | "system";
  /** Opaque id from the caller's trusted context, never from command input. */
  id: string;
}

export type Authorizer = (
  actor: Actor,
  permission: string,
  scope: { siteId: string | undefined },
) => boolean | Promise<boolean>;

/** The default until roles exist (Feature 4): nothing is allowed. */
export const denyAll: Authorizer = () => false;

/** For tests and trusted system jobs only. */
export const allowAll: Authorizer = () => true;
