export const metadata = { title: 'Privacy — Chess Coach' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 prose prose-neutral">
      <h1 className="text-3xl font-bold">Privacy</h1>
      <p className="mt-4 text-neutral-700">
        We collect the minimum needed to give you a report: your email and your public chess
        username. We only ever read your <strong>public</strong> games.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-neutral-700">
        <li>Your email is used to send your report and product updates you opt into — nothing else.</li>
        <li>We never post to your account or access private games.</li>
        <li>
          You can delete all your data at any time; this removes your account and every report and
          analysis tied to it.
        </li>
      </ul>
      <p className="mt-6 text-sm text-neutral-500">
        Questions? Email us and we&apos;ll help.
      </p>
    </main>
  );
}
