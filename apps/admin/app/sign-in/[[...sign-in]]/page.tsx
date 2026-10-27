import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted p-4">
      <SignIn />
    </main>
  );
}
