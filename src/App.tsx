import { BriefSection } from './components/BriefSection';
import { HeroSection } from './components/HeroSection';

export default function App() {
  return (
    <main className="bg-black font-sans text-white">
      <HeroSection>
        <BriefSection overlay />
      </HeroSection>
    </main>
  );
}
