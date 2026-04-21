import type { ReactNode } from 'react';

const navItems = ['Story', 'Investing', 'Building', 'Advisory'];
const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4';

export function HeroSection({ children }: { children?: ReactNode }) {
  return (
    <section className="relative bg-black text-white">
      <video
        className="absolute left-0 top-0 h-screen w-full object-cover"
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
      />

      <div className="relative z-10">
        <div className="px-6 pt-6 md:px-12 lg:px-16">
          <nav className="liquid-glass flex items-center justify-between rounded-xl px-4 py-2 text-white">
            <a href="#" className="text-2xl font-semibold tracking-tight">
              VEX
            </a>

            <div className="hidden items-center gap-8 text-sm md:flex">
              {navItems.map((item) => (
                <a key={item} href="#brief" className="transition-colors duration-300 hover:text-gray-300">
                  {item}
                </a>
              ))}
            </div>

            <div className="w-16 md:w-20" aria-hidden="true" />
          </nav>
        </div>

        {children}
      </div>
    </section>
  );
}
