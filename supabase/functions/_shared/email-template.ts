/**
 * Drive Precise — shared email design system.
 *
 * Forked from the first client site's template rather than rewritten, because
 * the structure is the part that took the work: table-based layout throughout,
 * because Outlook still does not do flexbox, and every dimension in pixels
 * because Gmail strips a stylesheet.
 *
 * What changed is the brand block below and nothing else. That is the whole
 * argument for keeping this file shaped the way it is — a new client site is a
 * palette swap, not an email project.
 */

// ─── Brand tokens ─────────────────────────────────────────────────────────────

export const B = {
  ink: "#16161A",
  paper: "#FFFFFF",
  wash: "#F7F7F4",
  blue: "#063298",
  yellow: "#F7D117",
  border: "#E2E2DC",
  muted: "#5A5A63",
  faint: "#9A9AA3",
  good: "#1B6B45",
  bad: "#98341F",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** HTML-escapes a value for interpolation into a template. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function eyebrow(text: string): string {
  return `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${B.blue};font-weight:700;">${
    esc(text)
  }</p>`;
}

export function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;color:${B.ink};font-weight:700;">${
    esc(text)
  }</h1>`;
}

export function p(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${B.ink};">${text}</p>`;
}

export function small(text: string): string {
  return `<p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:1.5;color:${B.muted};">${text}</p>`;
}

export function hr(): string {
  return `<div style="height:1px;background:${B.border};margin:22px 0;"></div>`;
}

/**
 * A label/value table. Owner alerts are read on a phone in a driveway, so the
 * detail that decides what to do next has to survive being skimmed.
 */
export function facts(rows: Array<[string, string | null | undefined]>): string {
  const cells = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:6px 12px 6px 0;font-family:${FONT};font-size:13px;color:${B.muted};white-space:nowrap;vertical-align:top;">${
          esc(label)
        }</td>
           <td style="padding:6px 0;font-family:${FONT};font-size:15px;color:${B.ink};font-weight:600;">${
          esc(value)
        }</td>
         </tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${B.wash};border:1px solid ${B.border};border-radius:8px;padding:12px 16px;margin:0 0 18px;">${cells}</table>`;
}

export function btn(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
    <tr><td style="background:${B.blue};border-radius:6px;">
      <a href="${
    esc(href)
  }" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">${
    esc(label)
  }</a>
    </td></tr>
  </table>`;
}

/**
 * The owner wrapper. Plainer than anything customer-facing on purpose — this is
 * an operational message to one person who already knows who we are, so the
 * space goes to the facts rather than to a masthead.
 */
export function ownerWrapper(inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${B.wash};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${B.wash};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${B.paper};border:1px solid ${B.border};border-radius:10px;">
        <tr><td style="height:4px;background:${B.yellow};border-radius:10px 10px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 8px;">${inner}</td></tr>
        <tr><td style="padding:0 28px 24px;">
          <div style="height:1px;background:${B.border};margin:8px 0 14px;"></div>
          <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${B.faint};">
            Drive Precise Ltd — sent automatically by your website.<br>
            Manage alerts in the ForgeLink Portal.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
