import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It does not exist, or you do not have access to it.
        </p>
        <Link href="/admin" className="mt-4 inline-block text-sm text-primary underline">
          Go to your sites
        </Link>
      </div>
    </main>
  );
}
