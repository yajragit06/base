"use client";

import { Button } from "@/components/ui/button";

/** Unexpected failures, such as the API being unreachable. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div role="alert" className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Base could not load this page. Check your connection and try again.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
