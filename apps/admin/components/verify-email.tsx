import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** Shown when the identity provider has not verified the person's email yet. */
export function VerifyEmail() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Verify your email to continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Base needs a verified email before it can show your sites. Verify it from the email you
          were sent, then sign in again.
        </p>
        <SignOutButton>
          <Button variant="outline" size="sm" className="mt-4">
            Sign out
          </Button>
        </SignOutButton>
      </div>
    </main>
  );
}
