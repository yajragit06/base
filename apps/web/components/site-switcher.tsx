"use client";

import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SiteOption {
  siteId: string;
  siteName: string;
  role: string;
}

/** Switches between the sites the signed-in person belongs to. */
export function SiteSwitcher({ sites, currentId }: { sites: SiteOption[]; currentId: string }) {
  const router = useRouter();
  const current = sites.find((site) => site.siteId === currentId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Site: ${current?.siteName ?? "none"}. Switch site`}
        >
          <span className="max-w-48 truncate">{current?.siteName ?? "Choose a site"}</span>
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Sites</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentId}
          onValueChange={(siteId) => router.push(`/admin/sites/${encodeURIComponent(siteId)}`)}
        >
          {sites.map((site) => (
            <DropdownMenuRadioItem key={site.siteId} value={site.siteId}>
              <span className="truncate">{site.siteName}</span>
              <span className="ml-auto pl-4 text-xs text-muted-foreground">{site.role}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
