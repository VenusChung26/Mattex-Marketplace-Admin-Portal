import { Link, Navigate, useParams } from "react-router-dom";
import { listPrototypeEmails } from "../lib/mailTemplate";
import { adminOrigin, marketplaceOrigin } from "../lib/origins";

export default function EmailPreviewPage() {
  const { id } = useParams();
  const emails = listPrototypeEmails({
    marketplaceOrigin: marketplaceOrigin(),
    adminOrigin: adminOrigin(),
  });

  if (!id) {
    return (
      <div className="min-h-screen bg-paper px-6 py-12 text-ink">
        <div className="mx-auto max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">Prototype</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-900">Mattex emails</h1>
          <p className="mt-2 text-sm text-mute">Same HTML as Marketplace and Sales portal emails. Sales does not preview buyer-facing mail from the inbox; Reject and cancel still open a preview at send time.</p>
          <ul className="mt-8 space-y-3">
            {emails.map((email) => (
              <li key={email.id}>
                <Link
                  to={`/emails/${email.id}`}
                  className="block rounded-xl border border-line bg-white px-4 py-4 hover:border-brand-400"
                >
                  <p className="font-display text-lg font-semibold tracking-tight text-brand-900">{email.label}</p>
                  <p className="mt-1 text-sm text-mute">{email.subject}</p>
                  <p className="mt-2 text-xs text-brand-700">{email.href}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const found = emails.find((email) => email.id === id);
  if (!found) return <Navigate to="/emails" replace />;

  return (
    <iframe
      title={found.subject}
      srcDoc={found.html}
      className="block h-screen w-screen border-0 bg-paper"
    />
  );
}
