import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Mark } from "@/components/mark";
import { SiteSwitcher } from "@/components/site-switcher";
import { PageTree } from "@/components/tree/page-tree";
import { VerifyEmail } from "@/components/verify-email";
import { ApiError, apiGet, getMe, type TreePage } from "@/lib/api";

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const me = await getMe();
  if (me === "email_not_verified") return <VerifyEmail />;
  if (!me.memberships.some((m) => m.siteId === siteId)) notFound();

  let top: TreePage;
  try {
    top = await apiGet<TreePage>(`/sites/${encodeURIComponent(siteId)}/tree`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
    throw error;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Mark className="size-6" />
          Base
        </Link>
        <SiteSwitcher sites={me.memberships} currentId={siteId} />
        <div className="ml-auto">
          <UserButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Page tree" className="w-72 shrink-0 overflow-y-auto border-r p-2">
          <PageTree
            key={siteId}
            siteId={siteId}
            initialItems={top.items}
            initialCursor={top.nextCursor}
          />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
