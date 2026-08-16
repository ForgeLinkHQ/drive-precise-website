/**
 * Builders for `mailto:` and `tel:` links.
 *
 * The scheme is a literal here, so `javascript:` cannot be smuggled in. The
 * real problem these solve is subtler: a `mailto:` URL accepts headers after a
 * `?`, so an address stored as
 *
 *     someone@example.com?bcc=attacker@example.net
 *
 * turns an innocent "Email" button into one that silently blind-copies a
 * stranger. The same trick sets `cc`, or rewrites the subject and body we
 * thought we were choosing. Percent-encoding the address means those characters
 * arrive as literal text in the To: field, where they belong.
 */

/** A phone number safe to place after `tel:`. */
export function telHref(phone: string): string {
  return `tel:${encodeURIComponent(phone)}`;
}

/**
 * A `mailto:` link whose recipient cannot inject extra headers.
 *
 * `subject` and `body` are ours rather than a customer's, but they are encoded
 * too — a registration or a name often ends up interpolated into them, and an
 * ampersand would otherwise truncate the rest.
 */
export function mailtoHref(email: string, opts: { subject?: string; body?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.subject) params.set("subject", opts.subject);
  if (opts.body) params.set("body", opts.body);
  const query = params.toString();
  return `mailto:${encodeURIComponent(email)}${query ? `?${query}` : ""}`;
}
