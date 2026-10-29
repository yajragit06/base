import { redirect } from "next/navigation";

// The public website arrives at `/` with Feature 24; until then `/` is the admin.
export default function RootPage() {
  redirect("/admin");
}
