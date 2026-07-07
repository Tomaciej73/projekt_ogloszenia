import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MultiPortal Listing Manager",
  description:
    "Create listing drafts once and publish across multiple marketplace platforms.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}