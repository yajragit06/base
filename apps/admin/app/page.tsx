import { redirect } from "next/navigation";
import { VerifyEmail } from "@/components/verify-email";
import { getMe } from "@/lib/api";

export default async function HomePage() {
  const me = await getMe();
  if (me === "email_not_verified") return <VerifyEmail />;
  const first = me.memberships[0];
  if (first) redirect(`/sites/${first.siteId}`);
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">You are not on any site yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a site owner or admin to add you. You are signed in as {me.user.email}.
        </p>
      </div>
    </main>
  );
}
