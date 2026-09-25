import {
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_VERSION,
  renderEmailTemplate,
} from './email-template.registry';

describe('email template registry', () => {
  it('renders custom tenant notices as escaped structured text with a single-line subject', () => {
    const rendered = renderEmailTemplate('tenant.custom_notice', {
      name: '<Tenant>',
      subject: 'Urgent\r\nBcc: attacker@example.com',
      category: '<Notice>',
      message: '<script>alert(1)</script>\n\nWater is off.',
    });
    expect(rendered.subject).toBe('Urgent Bcc: attacker@example.com');
    expect(rendered.html).toContain('&lt;Tenant&gt;');
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;Notice&gt;');
  });

  it.each(EMAIL_TEMPLATE_KEYS)('renders the versioned %s template', (key) => {
    const rendered = renderEmailTemplate(key, {
      name: '<Taylor>',
      companyName: 'Johnson Realty',
      contactName: 'Taylor',
      listingName: 'Oakwood',
      buyerName: 'Buyer',
      propertyName: 'Oakwood',
      address: '1 Main Street',
      unitNumber: '1A',
      startDate: 'September 1, 2026',
      endDate: 'August 31, 2027',
      dueDate: 'September 1, 2026',
      status: 'active',
      amount: 1000,
      lateFee: 50,
      total: 1050,
      balanceDue: 0,
      priority: 'high',
      category: 'plumbing',
      tenantName: 'Taylor Resident',
      applicantName: 'Applicant',
      period: 'August 2026',
      requestId: 'request-1',
      reason: 'More information required',
      subject: 'Tenant support',
      url: 'https://coachjohnsonrealty.com/test?a=1&b=2',
    });

    expect(rendered.key).toBe(key);
    expect(rendered.version).toBe(EMAIL_TEMPLATE_VERSION);
    expect(rendered.subject).toBeTruthy();
    expect(rendered.html).toContain('Coach Johnson Realty');
    expect(rendered.html).not.toContain('<Taylor>');
  });
});
