/**
 * Builders for `mailto:` and `tel:` links.
 *
 * These take contact details that came from outside the code, a customer's own
 * address typed into a form, or a business's details loaded from the database,
 * and put them in an href. The scheme is a literal here, so `javascript:`
 * cannot be smuggled in, and this is not the XSS a scanner will call it.
 *
 * The real problem is subtler. A `mailto:` URL takes headers after a `?`, so an
 * address stored as
 *
 *     someone@example.com?bcc=attacker@example.net
 *
 * turns an innocent "Email" button into one that silently blind-copies a
 * stranger on whatever the sender writes. The same trick sets `cc`, or rewrites
 * the `subject` and `body` we thought we were choosing. Percent-encoding the
 * address means those characters arrive as literal text in the To: field, where
 * they belong.
 */

/** A phone number safe to place after `tel:`. */
export function telHref(phone: string): string {
  return `tel:${encodeURIComponent(phone)}`;
}

/**
 * A `mailto:` link whose recipient cannot inject extra headers.
 *
 * `subject` and `body` are ours rather than the customer's, but they are
 * encoded too. A name or a reference often ends up interpolated into them, and
 * an ampersand in "Marks & Spencer" would otherwise truncate the rest.
 */
export function mailtoHref(email: string, opts: { subject?: string; body?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.subject) params.set("subject", opts.subject);
  if (opts.body) params.set("body", opts.body);
  const query = params.toString();
  return `mailto:${encodeURIComponent(email)}${query ? `?${query}` : ""}`;
}
