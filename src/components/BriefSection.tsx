import { useEffect, useState } from 'react';
import type { BriefCardData, BriefSource, IndustryBriefPayload } from '../types/industryBrief';

function formatTimestamp(value?: string | null) {
  if (!value) return 'Unknown';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SourceLine({ sources }: { sources: BriefSource[] }) {
  return (
    <div className="mt-6 border-t border-white/10 pt-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Sources</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sources.map((source) => (
          <a
            key={`${source.url}-${source.title}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-300 transition-colors duration-300 hover:border-white/20 hover:text-white"
            title={source.title}
          >
            {source.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Card({ card }: { card: BriefCardData }) {
  return (
    <article className="liquid-glass rounded-[1.25rem] border border-white/15 p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Briefing</p>
          <h3 className="mt-2 text-2xl font-medium text-white">{card.title}</h3>
        </div>
      </div>

      {card.highlight ? <p className="mb-4 text-base text-white">{card.highlight}</p> : null}
      {card.summary ? <p className="mb-4 text-sm leading-6 text-gray-300">{card.summary}</p> : null}

      <ul className="space-y-3 text-sm leading-6 text-gray-200">
        {card.items.map((item) => (
          <li key={item} className="border-l border-white/10 pl-4">
            {item}
          </li>
        ))}
      </ul>

      <SourceLine sources={card.sources} />
    </article>
  );
}

function PriceStrip({ brief }: { brief: IndustryBriefPayload['crypto'] }) {
  return (
    <div className="liquid-glass rounded-[1.25rem] border border-white/15 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {brief.prices.map((token) => (
          <div key={token.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{token.label}</p>
            <p className="mt-2 text-2xl font-medium text-white">{token.value}</p>
          </div>
        ))}
      </div>

      <SourceLine sources={brief.sources} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="liquid-glass rounded-[1.25rem] border border-white/15 p-8 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-gray-500">Industry Brief</p>
      <p className="mt-4 text-lg text-gray-200">{message}</p>
    </div>
  );
}

export function BriefSection({ overlay = false }: { overlay?: boolean }) {
  const [brief, setBrief] = useState<IndustryBriefPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBrief() {
      try {
        const res = await fetch('/api/industry-brief');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load industry brief');
        if (!cancelled) {
          setBrief(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load industry brief');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBrief();
    return () => {
      cancelled = true;
    };
  }, []);

  const header = (
    <div className="max-w-4xl">
      <p className="text-sm uppercase tracking-[0.25em] text-gray-300">{brief?.meta.date || 'Loading'}</p>
      <h2
        className={
          overlay
            ? 'mt-4 text-4xl font-normal leading-none md:text-5xl lg:text-6xl xl:text-7xl'
            : 'mt-4 text-3xl font-medium md:text-4xl'
        }
        style={overlay ? { letterSpacing: '-0.04em' } : undefined}
      >
        {brief?.meta.title || '今日行业简报'}
      </h2>
      <p className="mt-4 max-w-2xl text-base text-gray-300 md:text-lg">
        {brief?.meta.subtitle || '聚焦半导体、算力、区块链与 AI 的高信号更新。'}
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-300">
        <span>最近更新时间：{formatTimestamp(brief?.meta.lastSuccessfulRefreshAt)}</span>
        {brief?.meta.status ? <span>状态：{brief.meta.status}</span> : null}
        {error ? <span className="text-amber-300">加载异常：{error}</span> : null}
      </div>
    </div>
  );

  const content = (
    <>
      {loading ? <EmptyState message="正在加载最新行业简报..." /> : null}
      {!loading && !brief ? <EmptyState message="当前没有可展示的简报数据。" /> : null}
      {!loading && brief ? (
        <div className="grid gap-6">
          <div className="grid brief-grid gap-6">{brief.markets.map((card) => <Card key={card.id} card={card} />)}</div>
          <PriceStrip brief={brief.crypto} />
          <div className="grid brief-grid gap-6">
            <Card card={brief.crypto} />
            {brief.ai.map((card) => <Card key={card.id} card={card} />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
            <Card card={brief.knowledge} />
            <Card card={brief.signals} />
          </div>
        </div>
      ) : null}
    </>
  );

  if (overlay) {
    return (
      <section id="brief" className="relative text-white">
        <div className="px-6 md:px-12 lg:px-16">
          <div className="mx-auto flex min-h-[calc(100vh-4.75rem)] max-w-7xl flex-col justify-end pb-12 lg:pb-16">
            {header}
          </div>
        </div>
        <div className="relative bg-black px-6 py-12 md:px-12 lg:px-16 lg:py-16">
          <div className="mx-auto max-w-7xl">{content}</div>
        </div>
      </section>
    );
  }

  return (
    <section id="brief" className="relative bg-black px-6 py-16 text-white md:px-12 lg:px-16 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">{header}</div>
        {content}
      </div>
    </section>
  );
}
