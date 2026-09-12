import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  if (getSessionUserId()) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <Link href="/" className="text-sm text-neutral-500 hover:text-brand">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-neutral-600">
        Enter the email you signed up with and we&apos;ll send you a sign-in link or a 6-digit
        code.
      </p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </main>
  );
}
