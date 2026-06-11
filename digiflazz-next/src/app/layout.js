import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata = {
  title: "Digiflazz Console",
  description: "Panel manajemen otomasi produk Digiflazz",
};

const themeScript = `(function(){try{var t=localStorage.getItem('df_theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var r=document.documentElement;if(t==='dark'){r.classList.add('dark');}r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={jakarta.variable} suppressHydrationWarning>
    <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
