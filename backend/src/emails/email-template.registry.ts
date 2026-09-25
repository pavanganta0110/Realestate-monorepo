export const EMAIL_TEMPLATE_VERSION = 1;

export const EMAIL_TEMPLATE_KEYS = [
  'agent.verification',
  'agent.approved',
  'agent.declined',
  'agent.resubmission_received',
  'agent.resubmitted_for_review',
  'sale_listing.submitted',
  'sale_listing.resubmitted',
  'sale_listing.approved',
  'sale_listing.rejected',
  'buyer_inquiry.created',
  'buyer_inquiry.buyer_replied',
  'buyer_inquiry.agent_replied',
  'tenant.invited',
  'rental_admin.invited',
  'account.password_reset',
  'rental.published',
  'rental.unpublished',
  'lease.created',
  'lease.status_updated',
  'lease.renewal_offered',
  'lease.vacate_notice_received',
  'lease.move_out_inspection_scheduled',
  'lease.deposit_itemized',
  'lease.deposit_returned',
  'rent.reminder',
  'rent.late_notice',
  'rent.payment_recorded',
  'move_in.charges_posted',
  'move_in.payment_recorded',
  'move_in.inspection_ready',
  'move_in.inspection_acknowledged',
  'maintenance.created',
  'maintenance.updated',
  'maintenance.vendor_assigned',
  'maintenance.completion_confirmed',
  'tenant_message.created',
  'tenant_message.admin_replied',
  'tenant.custom_notice',
  'tenant.dashboard_sign_in',
  'rental_application.submitted',
  'rental_application.status_updated',
  'owner.stripe_onboarding_invited',
  'owner.stripe_onboarding_completed',
  'owner.payout_sent',
  'owner.statement_ready',
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export type EmailTemplateVariables = Record<
  string,
  string | number | boolean | null | undefined
>;

export type RenderedEmail = {
  key: EmailTemplateKey;
  version: number;
  subject: string;
  html: string;
  critical: boolean;
  maxAttempts: number;
};

function escape(value: EmailTemplateVariables[string]) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function text(value: EmailTemplateVariables[string]) {
  return escape(value);
}

function money(value: EmailTemplateVariables[string]) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(amount) ? amount : 0);
}

function button(label: string, url: EmailTemplateVariables[string]) {
  if (!url) return '';
  return `<p style="margin:28px 0"><a href="${text(url)}" style="display:inline-block;padding:12px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${escape(label)}</a></p>`;
}

function layout(title: string, content: string) {
  return `<div style="background:#f8fafc;padding:28px 12px"><div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;color:#0f172a"><p style="margin:0 0 18px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Coach Johnson Realty</p><h2 style="margin:0 0 18px;font-size:24px">${escape(title)}</h2>${content}<hr style="border:0;border-top:1px solid #e2e8f0;margin:26px 0 18px"><p style="margin:0;color:#64748b;font-size:12px">This is a transactional message from Coach Johnson Realty.</p></div></div>`;
}

function result(
  key: EmailTemplateKey,
  subject: string,
  title: string,
  content: string,
  critical = false,
): RenderedEmail {
  return {
    key,
    version: EMAIL_TEMPLATE_VERSION,
    subject,
    html: layout(title, content),
    critical,
    maxAttempts: critical ? 3 : 1,
  };
}

export function renderEmailTemplate(
  key: EmailTemplateKey,
  values: EmailTemplateVariables,
): RenderedEmail {
  const hello = values.name ? `<p>Hello ${text(values.name)},</p>` : '';
  switch (key) {
    case 'agent.verification':
      return result(
        key,
        'Verify your Johnson Realty agent application',
        'Verify your email',
        `${hello}<p>Confirm your email address to submit your agent company application for review.</p>${button('Verify application', values.url)}<p>If you did not submit this application, you can ignore this email.</p>`,
        true,
      );
    case 'agent.approved':
      return result(
        key,
        'Your Johnson Realty agent application was approved',
        'Application approved',
        `${hello}<p>Your agent company has been approved. You can now sign in and manage sale listings.</p>`,
        true,
      );
    case 'agent.declined':
      return result(
        key,
        'Update on your Johnson Realty agent application',
        'Application update',
        `${hello}<p>We could not approve your application at this time.</p><p><strong>Reason:</strong> ${text(values.reason)}</p><p>Update your company information and resubmit when ready.</p>`,
        true,
      );
    case 'agent.resubmission_received':
      return result(
        key,
        'Your Johnson Realty agent application was resubmitted',
        'Application resubmitted',
        `${hello}<p>We received your updated application and will email you after review.</p>`,
        true,
      );
    case 'agent.resubmitted_for_review':
      return result(
        key,
        `Agent application resubmitted: ${String(values.companyName ?? '')}`,
        'Agent application resubmitted',
        `<p><strong>${text(values.companyName)}</strong> (${text(values.contactName)}) submitted updated information.</p>${button('Review application', values.url)}`,
        true,
      );
    case 'sale_listing.submitted':
    case 'sale_listing.resubmitted': {
      const resubmitted = key === 'sale_listing.resubmitted';
      return result(
        key,
        `${resubmitted ? 'Sale listing resubmitted' : 'New sale listing for review'}: ${String(values.listingName ?? '')}`,
        resubmitted ? 'Sale listing resubmitted' : 'New sale listing submitted',
        `<p><strong>${text(values.companyName)}</strong> submitted <strong>${text(values.listingName)}</strong> for review.</p>${button('Review listing', values.url)}`,
        true,
      );
    }
    case 'sale_listing.approved':
      return result(
        key,
        `Sale listing approved: ${String(values.listingName ?? '')}`,
        'Listing approved',
        `${hello}<p><strong>${text(values.listingName)}</strong> is approved and publicly available.</p>`,
        true,
      );
    case 'sale_listing.rejected':
      return result(
        key,
        `Changes requested: ${String(values.listingName ?? '')}`,
        'Listing changes requested',
        `${hello}<p><strong>${text(values.listingName)}</strong> was returned for changes.</p><p><strong>Reason:</strong> ${text(values.reason)}</p>`,
        true,
      );
    case 'buyer_inquiry.created':
      return result(
        key,
        `New buyer inquiry: ${String(values.listingName ?? '')}`,
        'New buyer inquiry',
        `${hello}<p><strong>${text(values.buyerName)}</strong> asked about <strong>${text(values.listingName)}</strong>.</p>${button('Open agent inbox', values.url)}`,
      );
    case 'buyer_inquiry.buyer_replied':
      return result(
        key,
        `Buyer replied: ${String(values.listingName ?? '')}`,
        'Buyer reply',
        `${hello}<p><strong>${text(values.buyerName)}</strong> added a message about <strong>${text(values.listingName)}</strong>.</p>${button('Open conversation', values.url)}`,
      );
    case 'buyer_inquiry.agent_replied':
      return result(
        key,
        `Reply about ${String(values.listingName ?? '')}`,
        'Your listing inquiry has a reply',
        `${hello}<p><strong>${text(values.agentName)}</strong> replied about <strong>${text(values.listingName)}</strong>.</p><p>Return to the inquiry confirmation in the browser where you submitted it.</p>`,
      );
    case 'tenant.invited':
      return result(
        key,
        'Welcome to Coach Johnson Realty — tenant portal invitation',
        'Complete your tenant account',
        `${hello}<p>You were invited to the tenant portal to view your lease, payments, maintenance requests, and messages.</p>${button('Complete account setup', values.url)}<p>This secure link expires according to the invitation policy.</p>`,
        true,
      );
    case 'rental_admin.invited':
      return result(
        key,
        'Complete your Coach Johnson Realty administrator account',
        'Complete your rental administrator account',
        `${hello}<p>You were invited to manage Coach Johnson Realty&apos;s rental operations. Use the secure link below to set your password and open the rental administration portal.</p>${button('Complete administrator setup', values.url)}<p>This secure link expires according to the invitation policy.</p>`,
        true,
      );
    case 'account.password_reset':
      return result(
        key,
        'Password reset request — Coach Johnson Realty',
        'Reset your password',
        '<p>We received a request to reset your Coach Johnson Realty account password.</p>' +
          button('Reset my password', values.url) +
          '<p>If you did not request this, ignore this email.</p>',
        true,
      );
    case 'rental.published':
    case 'rental.unpublished': {
      const published = key === 'rental.published';
      return result(
        key,
        `Rental ${published ? 'published' : 'unpublished'}: ${String(values.propertyName ?? '')}`,
        `Rental ${published ? 'published' : 'unpublished'}`,
        `${hello}<p><strong>${text(values.propertyName)}</strong> at ${text(values.address)} was ${published ? 'published on the Johnson Realty rental site' : 'removed from the public rental site'}.</p>`,
      );
    }
    case 'lease.created':
      return result(
        key,
        'Your lease is available — Coach Johnson Realty',
        'Lease created',
        `${hello}<p>Your lease for <strong>${text(values.propertyName)}</strong>, unit ${text(values.unitNumber)}, runs from ${text(values.startDate)} through ${text(values.endDate)}.</p>${button('Open tenant portal', values.url)}`,
        true,
      );
    case 'lease.status_updated':
      return result(
        key,
        `Lease status updated: ${String(values.status ?? '')}`,
        'Lease update',
        `${hello}<p>Your lease for <strong>${text(values.propertyName)}</strong>, unit ${text(values.unitNumber)}, is now <strong>${text(values.status)}</strong>.</p>${button('View lease', values.url)}`,
        true,
      );
    case 'lease.renewal_offered':
      return result(
        key,
        'Lease renewal ready for review — Coach Johnson Realty',
        'Review your renewal offer',
        `${hello}<p>A renewal offer for <strong>${text(values.propertyName)}</strong> is ready for signature.</p><p>New end date: <strong>${text(values.endDate)}</strong><br>Monthly rent: <strong>${money(values.monthlyRent)}</strong><br>Respond by: <strong>${text(values.responseDue)}</strong></p>${button('Review renewal', values.url)}`,
        true,
      );
    case 'lease.vacate_notice_received':
      return result(
        key,
        'Notice to vacate received — Coach Johnson Realty',
        'Your notice was recorded',
        `${hello}<p>We recorded the planned move-out from <strong>${text(values.propertyName)}</strong> on <strong>${text(values.moveOutDate)}</strong>.</p><p>Management will confirm the final inspection schedule in the resident portal.</p>${button('View move-out plan', values.url)}`,
        true,
      );
    case 'lease.move_out_inspection_scheduled':
      return result(
        key,
        'Final inspection scheduled — Coach Johnson Realty',
        'Move-out walkthrough scheduled',
        `${hello}<p>The final inspection for <strong>${text(values.propertyName)}</strong> is scheduled for <strong>${text(values.scheduledAt)}</strong>.</p>${button('View move-out plan', values.url)}`,
        true,
      );
    case 'lease.deposit_itemized':
      return result(
        key,
        'Security deposit statement ready — Coach Johnson Realty',
        'Deposit itemization ready',
        `${hello}<p>Your security deposit statement for <strong>${text(values.propertyName)}</strong> is ready.</p><p>Deductions: <strong>${money(values.deductions)}</strong><br>Return amount: <strong>${money(values.refund)}</strong><br>Return deadline: <strong>${text(values.dueDate)}</strong></p>${button('Review statement', values.url)}`,
        true,
      );
    case 'lease.deposit_returned':
      return result(
        key,
        'Security deposit return completed — Coach Johnson Realty',
        'Deposit return recorded',
        `${hello}<p>A security deposit return of <strong>${money(values.refund)}</strong> for <strong>${text(values.propertyName)}</strong> was completed by ${text(values.method)}.</p><p>Reference: <strong>${text(values.reference)}</strong></p>${button('View return record', values.url)}`,
        true,
      );
    case 'rent.reminder':
      return result(
        key,
        'Rent reminder — Coach Johnson Realty',
        'Upcoming rent payment',
        `${hello}<p>Your rent of <strong>${money(values.amount)}</strong> is due on <strong>${text(values.dueDate)}</strong>.</p>${button('View payment history', values.url)}`,
        true,
      );
    case 'rent.late_notice':
      return result(
        key,
        'Important: late rent notice — Coach Johnson Realty',
        'Late rent notice',
        `${hello}<p>Your payment is overdue. A late fee of <strong>${money(values.lateFee)}</strong> is recorded.</p><p>Total balance due: <strong>${money(values.total)}</strong>.</p>${button('Open tenant portal', values.url)}`,
        true,
      );
    case 'rent.payment_recorded':
      return result(
        key,
        'Payment recorded — Coach Johnson Realty',
        'Payment update',
        `${hello}<p>A payment of <strong>${money(values.amount)}</strong> was recorded with status <strong>${text(values.status)}</strong>.</p><p>Balance due: <strong>${money(values.balanceDue)}</strong>.</p>${button('View payment history', values.url)}`,
        true,
      );
    case 'move_in.charges_posted':
      return result(
        key,
        'Move-in charges are ready — Coach Johnson Realty',
        'Move-in balance posted',
        `${hello}<p>Move-in charges totaling <strong>${money(values.amount)}</strong> were posted for <strong>${text(values.propertyName)}</strong>.</p><p>Review each categorized charge before making a one-time payment.</p>${button('Review move-in charges', values.url)}`,
        true,
      );
    case 'move_in.payment_recorded':
      return result(
        key,
        'Move-in payment recorded — Coach Johnson Realty',
        'Move-in payment update',
        `${hello}<p>A move-in payment of <strong>${money(values.amount)}</strong> was recorded for <strong>${text(values.propertyName)}</strong>.</p><p>Remaining move-in balance: <strong>${money(values.balanceDue)}</strong>.</p>${button('View payment details', values.url)}`,
        true,
      );
    case 'move_in.inspection_ready':
      return result(
        key,
        'Review your move-in inspection: Coach Johnson Realty',
        'Move-in condition record ready',
        `${hello}<p>Review the room-by-room condition record and key handover for <strong>${text(values.propertyName)}</strong>, unit ${text(values.unitNumber)}.</p><p>Add any observations or photos before acknowledging the record.</p>${button('Review move-in inspection', values.url)}`,
        true,
      );
    case 'move_in.inspection_acknowledged':
      return result(
        key,
        `Move-in inspection acknowledged: ${String(values.propertyName ?? '')}`,
        'Move-in inspection completed',
        `<p><strong>${text(values.tenantName)}</strong> acknowledged the condition record and key handover for <strong>${text(values.propertyName)}</strong>, unit ${text(values.unitNumber)}.</p>${button('Open inspection record', values.url)}`,
        true,
      );
    case 'maintenance.created':
      return result(
        key,
        `New ${String(values.priority ?? '')} maintenance request`,
        'Maintenance request submitted',
        `<p>${text(values.tenantName)} submitted a <strong>${text(values.priority)}</strong> ${text(values.category)} request for ${text(values.propertyName)}, unit ${text(values.unitNumber)}.</p>${button('Review request', values.url)}`,
        true,
      );
    case 'maintenance.updated':
      return result(
        key,
        `Maintenance request update — #${String(values.requestId ?? '')}`,
        'Maintenance update',
        `${hello}<p>Your ${text(values.category)} request is now <strong>${text(values.status)}</strong>.</p>${button('View request', values.url)}`,
      );
    case 'maintenance.vendor_assigned':
      return result(
        key,
        `Service assignment: ${String(values.propertyName ?? '')} unit ${String(values.unitNumber ?? '')}`,
        'Maintenance service assignment',
        `${hello}<p>You have been assigned a <strong>${text(values.category)}</strong> service request at <strong>${text(values.propertyName)}</strong>, ${text(values.propertyAddress)}, unit ${text(values.unitNumber)}.</p><p>${text(values.description)}</p>${values.scheduledAt ? `<p><strong>Scheduled:</strong> ${text(values.scheduledAt)}</p>` : ''}<p>Contact Coach Johnson Realty if the timing or scope needs clarification.</p>`,
        true,
      );
    case 'maintenance.completion_confirmed':
      return result(
        key,
        `Tenant confirmed maintenance completion — #${String(values.requestId ?? '')}`,
        'Completion confirmed',
        `<p>${text(values.tenantName)} confirmed completion of the ${text(values.category)} request at ${text(values.propertyName)}, unit ${text(values.unitNumber)}.</p>${button('Open request', values.url)}`,
      );
    case 'tenant_message.created':
      return result(
        key,
        `Tenant message: ${String(values.subject ?? 'Support')}`,
        'New tenant message',
        `<p><strong>${text(values.tenantName)}</strong> sent a message${values.propertyName ? ` about ${text(values.propertyName)}` : ''}.</p>${button('Open admin inbox', values.url)}`,
      );
    case 'tenant_message.admin_replied':
      return result(
        key,
        `Management replied: ${String(values.subject ?? 'Support')}`,
        'New message from management',
        `${hello}<p>Coach Johnson Realty replied to your tenant portal conversation.</p>${button('Open messages', values.url)}`,
      );
    case 'tenant.custom_notice': {
      const subject = String(values.subject ?? '')
        .trim()
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 180);
      const message = String(values.message ?? '').slice(0, 10000);
      const paragraphs = message
        .split(/\n\s*\n/)
        .map(
          (paragraph) =>
            `<p style="white-space:pre-wrap">${text(paragraph)}</p>`,
        )
        .join('');
      return result(
        key,
        subject || 'Resident notice from Coach Johnson Realty',
        String(values.category ?? '')
          .trim()
          .slice(0, 80) || 'Resident notice',
        `${hello}${paragraphs}`,
      );
    }
    case 'tenant.dashboard_sign_in':
      return result(
        key,
        'Sign in to your Coach Johnson Realty tenant dashboard',
        'Tenant dashboard sign-in',
        `${hello}<p>Use the secure link below to sign in to your Coach Johnson Realty tenant dashboard and view your lease, payments, maintenance requests, and messages.</p>${button('Sign in to dashboard', values.url)}<p>If you forgot your password, choose the password reset option on the sign-in page.</p>`,
      );
    case 'rental_application.submitted':
      return result(
        key,
        `New rental application: ${String(values.propertyName ?? '')}`,
        'Rental application submitted',
        `<p>${text(values.applicantName)} submitted an application for <strong>${text(values.propertyName)}</strong>.</p>${button('Review application', values.url)}`,
        true,
      );
    case 'rental_application.status_updated':
      return result(
        key,
        `Rental application update: ${String(values.propertyName ?? '')}`,
        'Application status updated',
        `${hello}<p>Your application for <strong>${text(values.propertyName)}</strong> is now <strong>${text(values.status)}</strong>.</p>${values.reason ? `<p><strong>Johnson Realty message:</strong> ${text(values.reason)}</p>` : ''}${button('View secure application', values.url)}`,
        true,
      );
    case 'owner.stripe_onboarding_invited':
      return result(
        key,
        'Set up your property payout account',
        'Payout setup invitation',
        `${hello}<p>Complete the secure payout onboarding for your Johnson Realty-managed property.</p>${button('Set up payouts', values.url)}`,
        true,
      );
    case 'owner.stripe_onboarding_completed':
      return result(
        key,
        'Property payout setup completed',
        'Payout account ready',
        `${hello}<p>Your property payout account is active.</p>`,
        true,
      );
    case 'owner.payout_sent':
      return result(
        key,
        'Property payout sent',
        'Payout sent',
        `${hello}<p>A payout of <strong>${money(values.amount)}</strong> was sent for <strong>${text(values.propertyName)}</strong>.</p>`,
        true,
      );
    case 'owner.statement_ready':
      return result(
        key,
        'Owner statement ready',
        'Your property statement is ready',
        `${hello}<p>The ${text(values.period)} statement for <strong>${text(values.propertyName)}</strong> is ready.</p>${button('View statement', values.url)}`,
      );
  }
}
