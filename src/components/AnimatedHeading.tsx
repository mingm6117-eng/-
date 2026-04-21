import { CSSProperties, Fragment, useEffect, useState } from 'react';

type AnimatedHeadingProps = {
  text: string;
  charDelay?: number;
  initialDelay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
};

export function AnimatedHeading({
  text,
  charDelay = 30,
  initialDelay = 200,
  duration = 500,
  className = '',
  style,
}: AnimatedHeadingProps) {
  const [active, setActive] = useState(false);
  const lines = text.split('\n');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActive(true);
    }, initialDelay);

    return () => window.clearTimeout(timer);
  }, [initialDelay]);

  return (
    <div className={className} style={style}>
      {lines.map((line, lineIndex) => {
        const characters = Array.from(line);

        return (
          <div key={`${line}-${lineIndex}`} className="block">
            {characters.map((character, charIndex) => {
              const delay = initialDelay + lineIndex * characters.length * charDelay + charIndex * charDelay;

              return (
                <span
                  key={`${character}-${lineIndex}-${charIndex}`}
                  className="inline-block whitespace-pre transition-[opacity,transform]"
                  style={{
                    transitionDuration: `${duration}ms`,
                    transitionDelay: `${delay}ms`,
                    opacity: active ? 1 : 0,
                    transform: active ? 'translateX(0)' : 'translateX(-18px)',
                  }}
                >
                  {character === ' ' ? '\u00A0' : character}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
