import type { Metadata } from "next";
import { Mail, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "Learn how Coach Johnson Realty collects, uses, shares, and protects information across its website and property service portals.",
  path: "/privacy",
});

const sections = [
  {
    title: "Information we collect",
    content: (
      <>
        <p>
          We collect information you provide when you contact us, ask about a
          property, submit a rental inquiry or application, create or use a
          portal account, communicate with our team, or request property
          services. This can include your name, email address, phone number,
          property preferences, messages, and information in application or
          resident records.
        </p>
        <p>
          Resident and staff portals may contain account details, lease terms,
          rent and payment status, maintenance requests, messages, uploaded
          documents, and activity needed to operate the property relationship.
          Payment providers process payment-card details. We receive the
          transaction status and related records needed to provide the service,
          rather than the full card number.
        </p>
        <p>
          We also receive limited technical information such as browser and
          device information, approximate usage and security logs, and
          information stored in necessary cookies or local storage for sign-in,
          session security, and site functionality.
        </p>
      </>
    ),
  },
  {
    title: "How we use information",
    content: (
      <>
        <p>We use information to:</p>
        <ul>
          <li>respond to questions, inquiries, applications, and service requests;</li>
          <li>provide real estate, rental, property-management, and resident services;</li>
          <li>create and secure portal accounts and communicate about account activity;</li>
          <li>process payments, leases, maintenance, documents, and e-signatures;</li>
          <li>protect our systems, prevent misuse, and keep records accurate; and</li>
          <li>improve our website, services, and communications.</li>
        </ul>
      </>
    ),
  },
  {
    title: "How we share information",
    content: (
      <>
        <p>
          We do not sell personal information. We may share information when
          needed to provide the requested service, including with property
          owners, authorized managers, agents, vendors, and service providers
          involved in a transaction or property relationship.
        </p>
        <p>
          We use service providers for hosting, databases, authentication,
          email delivery, payments, e-signatures, security, and website or
          assistant functionality. They may process information only as needed
          to provide services to us and under their own privacy terms.
        </p>
        <p>
          We may also disclose information when required by law, to respond to
          a valid legal process, protect people or property, enforce our terms,
          or support a business transfer such as a merger or sale of assets.
        </p>
      </>
    ),
  },
  {
    title: "Website assistant and communications",
    content: (
      <>
        <p>
          Messages sent to the public website assistant may be processed by an
          artificial-intelligence service to generate a response. Assistant
          conversations and contact details may also be used to route a request
          to our team. Please do not submit passwords, payment-card numbers,
          Social Security numbers, or other sensitive information in a public
          chat or contact form.
        </p>
        <p>
          You can stop non-essential marketing messages by using the unsubscribe
          option in the message or contacting us. Operational messages about
          accounts, leases, payments, security, or requested services may still
          be sent when necessary.
        </p>
      </>
    ),
  },
  {
    title: "Retention, security, and your choices",
    content: (
      <>
        <p>
          We keep information for as long as reasonably needed to provide our
          services, maintain account and property records, meet legal or
          accounting requirements, resolve disputes, and protect our systems.
          Retention periods vary by the type of record and the relationship.
        </p>
        <p>
          We use reasonable administrative, technical, and organizational
          safeguards designed to protect information. No internet transmission
          or storage system can be guaranteed completely secure.
        </p>
        <p>
          You may contact us to request access to, correction of, or deletion
          of personal information, subject to identity verification and records
          we must retain by law or for legitimate business purposes. You can
          also control cookies through your browser settings. We will not
          discriminate against you for making a privacy request.
        </p>
      </>
    ),
  },
  {
    title: "Children and third-party links",
    content: (
      <>
        <p>
          Our website and portals are not directed to children under 13, and we
          do not knowingly collect personal information from children under 13.
          If you believe a child provided information to us, please contact us.
        </p>
        <p>
          Our website may link to third-party services. Their privacy practices
          are governed by their own policies, not this one.
        </p>
      </>
    ),
  },
  {
    title: "Changes and contact",
    content: (
      <>
        <p>
          We may update this policy as our services or legal obligations change.
          The updated version will be posted on this page with a new last-updated
          date.
        </p>
        <p>
          Questions or privacy requests can be sent to{" "}
          <a
            className="font-semibold text-primary underline underline-offset-4"
            href="mailto:info@coachjohnsonrealty.com"
          >
            info@coachjohnsonrealty.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <SiteHeader />
      <main id="main-content">
        <section className="public-container py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">Your information</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Privacy policy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Coach Johnson Realty explains what information we collect, why we
              use it, and the choices available to you across our website and
              property service portals.
            </p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Last updated October 1, 2026
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <article className="grid gap-8 rounded-[1.5rem] border border-border bg-card p-6 sm:p-10">
              {sections.map((section) => (
                <section
                  key={section.title}
                  className="border-b border-border pb-8 last:border-0 last:pb-0"
                >
                  <h2 className="text-xl font-semibold tracking-[-0.025em]">
                    {section.title}
                  </h2>
                  <div className="mt-3 grid gap-4 text-sm leading-7 text-muted-foreground [&_li]:pl-1 [&_ol]:grid [&_ol]:gap-2 [&_p]:max-w-3xl [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:grid [&_ul]:gap-2">
                    {section.content}
                  </div>
                </section>
              ))}
            </article>

            <aside className="grid gap-4 lg:sticky lg:top-28">
              <div className="rounded-[1.25rem] border border-border bg-secondary p-5">
                <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-base font-semibold">Privacy questions?</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Contact our team if you need help understanding or updating
                  your information.
                </p>
                <a
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary/35 hover:text-primary"
                  href="mailto:info@coachjohnsonrealty.com"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Email our team
                </a>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
