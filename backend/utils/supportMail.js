const { sendEmail } = require('./email');

// Emails for support tickets. All sends are fire-and-forget (sendEmail already swallows and logs its own
// errors), so a mail problem can never fail raising or answering a ticket.

const CATEGORY_LABEL = { order: 'Order', card: 'Card', payment: 'Payment or invoice', account: 'Account or profile', other: 'Other' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function supportInbox() {
  return process.env.SUPPORT_EMAIL || process.env.APP_EMAIL || '';
}

function clientAppUrl(path = '') {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : '';
}

function adminPanelUrl(path = '') {
  const base = (process.env.ADMIN_PANEL_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : '';
}

// A plain, email-client-safe layout: a header table (From / To / Date / Subject) and the message body.
function mailHtml({ heading, rows, body, footer, button }) {
  const rowHtml = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:3px 0;color:#111827;font-weight:600;">${esc(v)}</td></tr>`)
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#111827;">
  <div style="padding:14px 0;font-size:13px;color:#6b7280;">${esc(heading)}</div>
  <table style="font-size:13px;border-collapse:collapse;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;width:100%;margin-bottom:16px;"><tbody>${rowHtml}</tbody></table>
  <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(body)}</div>
  ${button ? `<p style="margin:22px 0 0;"><a href="${esc(button.url)}" style="background:#0d9394;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">${esc(button.label)}</a></p>` : ''}
  <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">${esc(footer)}</p>
</div>`;
}

function plain(rows, body, footer) {
  return `${rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${body}\n\n-- \n${footer}`;
}

// Customer raised a ticket: one mail to the support inbox, one confirmation to the customer.
function sendTicketRaised({ ticket, client, description }) {
  const subjectTag = `[${ticket.ticketNumber}] ${ticket.subject}`;
  const inbox = supportInbox();
  if (inbox) {
    const rows = [
      ['From', `${client.fullName || client.clientId}${client.loginEmail ? ` <${client.loginEmail}>` : ''}`],
      ['To', 'Support team'],
      ['Phone', client.phone || ''],
      ['Customer ID', client.clientId],
      ['Regarding', CATEGORY_LABEL[ticket.category] + (ticket.orderNumber ? ` · Order ${ticket.orderNumber}` : '') + (ticket.cardNumber ? ` · Card #${ticket.cardNumber}` : '')],
      ['Subject', ticket.subject],
    ];
    const url = adminPanelUrl('/dashboard/support-tickets');
    const footer = `Ticket ${ticket.ticketNumber}. Reply from the admin panel so it is saved on the ticket.`;
    sendEmail(inbox, subjectTag, {
      text: plain(rows, description, footer) + (url ? `\n${url}` : ''),
      html: mailHtml({ heading: 'New support ticket', rows, body: description, footer, button: url ? { url, label: 'Open in admin panel' } : null }),
      replyTo: client.loginEmail || undefined,
    }).catch(() => {});
  }
  if (client.loginEmail) {
    const rows = [
      ['From', 'HuntsTAG Support'],
      ['To', client.loginEmail],
      ['Subject', subjectTag],
    ];
    const url = clientAppUrl('/dashboard/tickets');
    const footer = `Your ticket number is ${ticket.ticketNumber}. We will reply in your ticket, and by email.`;
    const body = `Hi ${client.fullName || ''},\n\nWe have received your ticket. Here is a copy of what you sent:\n\n${description}`;
    sendEmail(client.loginEmail, `We received your ticket ${ticket.ticketNumber}`, {
      text: plain(rows, body, footer) + (url ? `\n${url}` : ''),
      html: mailHtml({ heading: 'Ticket received', rows, body, footer, button: url ? { url, label: 'View your ticket' } : null }),
    }).catch(() => {});
  }
}

// Support replied: mail the customer, "Re:" style.
function sendTicketReply({ ticket, client, text }) {
  if (!client?.loginEmail) return;
  const rows = [
    ['From', 'HuntsTAG Support'],
    ['To', client.loginEmail],
    ['Subject', `Re: [${ticket.ticketNumber}] ${ticket.subject}`],
  ];
  const url = clientAppUrl('/dashboard/tickets');
  const footer = `Ticket ${ticket.ticketNumber}. You can reply from your dashboard.`;
  const body = `Hi ${client.fullName || ''},\n\n${text}\n\nRegards,\nSupport team`;
  sendEmail(client.loginEmail, `Re: [${ticket.ticketNumber}] ${ticket.subject}`, {
    text: plain(rows, body, footer) + (url ? `\n${url}` : ''),
    html: mailHtml({ heading: 'Reply to your ticket', rows, body, footer, button: url ? { url, label: 'Open your ticket' } : null }),
  }).catch(() => {});
}

function sendTicketResolved({ ticket, client }) {
  if (!client?.loginEmail) return;
  const rows = [
    ['From', 'HuntsTAG Support'],
    ['To', client.loginEmail],
    ['Subject', `Resolved: [${ticket.ticketNumber}] ${ticket.subject}`],
  ];
  const url = clientAppUrl('/dashboard/tickets');
  const footer = `Ticket ${ticket.ticketNumber}. If it is not fixed, reply to the ticket and it will be reopened.`;
  const body = `Hi ${client.fullName || ''},\n\nYour ticket has been marked as resolved. If the problem is still there, just reply to it and we will pick it up again.`;
  sendEmail(client.loginEmail, `Resolved: [${ticket.ticketNumber}] ${ticket.subject}`, {
    text: plain(rows, body, footer) + (url ? `\n${url}` : ''),
    html: mailHtml({ heading: 'Ticket resolved', rows, body, footer, button: url ? { url, label: 'View your ticket' } : null }),
  }).catch(() => {});
}

// A customer replied on an existing ticket: tell the support inbox.
function sendCustomerReply({ ticket, client, text }) {
  const inbox = supportInbox();
  if (!inbox) return;
  const rows = [
    ['From', `${client?.fullName || ticket.clientId}${client?.loginEmail ? ` <${client.loginEmail}>` : ''}`],
    ['To', 'Support team'],
    ['Subject', `Re: [${ticket.ticketNumber}] ${ticket.subject}`],
  ];
  const url = adminPanelUrl('/dashboard/support-tickets');
  const footer = `Ticket ${ticket.ticketNumber} (${ticket.status === 'open' ? 'reopened or open' : ticket.status}).`;
  sendEmail(inbox, `Re: [${ticket.ticketNumber}] ${ticket.subject}`, {
    text: plain(rows, text, footer) + (url ? `\n${url}` : ''),
    html: mailHtml({ heading: 'New reply from a customer', rows, body: text, footer, button: url ? { url, label: 'Open in admin panel' } : null }),
    replyTo: client?.loginEmail || undefined,
  }).catch(() => {});
}

module.exports = { sendTicketRaised, sendTicketReply, sendTicketResolved, sendCustomerReply };
