import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "@verdocs/web-sdk-react/dist/globals.css";
import "@verdocs/web-sdk-react/dist/overrides.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/auth-context";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PublicChatbot } from "@/components/public/public-chatbot";
import { JsonLd } from "@/components/seo/json-ld";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_URL,
} from "@/lib/seo";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Missouri Real Estate & Property Management",
    template: "%s | Coach Johnson Realty",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Missouri real estate",
    "Kansas City homes for sale",
    "Missouri homes for rent",
    "property management Missouri",
    "Coach Johnson Realty",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "Missouri Real Estate & Property Management",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_OG_IMAGE,
        width: 1536,
        height: 1024,
        alt: "Missouri home interior",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Missouri Real Estate & Property Management",
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#06291F" },
    { media: "(prefers-color-scheme: dark)", color: "#0B100E" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${manrope.variable} font-sans antialiased`}>
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            {children}
            <JsonLd
              data={{
                "@context": "https://schema.org",
                "@graph": [
                  {
                    "@type": "RealEstateAgent",
                    "@id": `${SITE_URL}/#organization`,
                    name: SITE_NAME,
                    url: SITE_URL,
                    image: `${SITE_URL}${SITE_OG_IMAGE}`,
                    email: "info@coachjohnsonrealty.com",
                    telephone: "+1-816-555-0147",
                    address: {
                      "@type": "PostalAddress",
                      addressLocality: "Kansas City",
                      addressRegion: "MO",
                      addressCountry: "US",
                    },
                    areaServed: {
                      "@type": "State",
                      name: "Missouri",
                    },
                    contactPoint: {
                      "@type": "ContactPoint",
                      contactType: "customer service",
                      email: "info@coachjohnsonrealty.com",
                      telephone: "+1-816-555-0147",
                    },
                  },
                  {
                    "@type": "WebSite",
                    "@id": `${SITE_URL}/#website`,
                    url: SITE_URL,
                    name: SITE_NAME,
                    description: SITE_DESCRIPTION,
                    publisher: { "@id": `${SITE_URL}/#organization` },
                    inLanguage: "en-US",
                  },
                ],
              }}
            />
            <PublicChatbot />
            <Toaster />
            <SpeedInsights />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
