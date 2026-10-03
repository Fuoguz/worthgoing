import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import { PreferencesProvider } from "@/components/preferences-context";
import { Header, Footer } from "@/components/site-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorthGoing — Make your free time count",
  description:
    "What’s worth leaving home for? Find a plan that fits your interests, time, budget and travel effort.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <PreferencesProvider>
          <Header />
          {children}
          <Footer />
        </PreferencesProvider>
      </body>
    </html>
  );
}
