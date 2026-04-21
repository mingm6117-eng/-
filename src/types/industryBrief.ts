export type BriefSource = {
  label: string;
  title: string;
  url: string;
  publishedAt: string | null;
  site: string;
};

export type BriefCardData = {
  id: string;
  title: string;
  summary?: string;
  highlight?: string;
  items: string[];
  sources: BriefSource[];
};

export type BriefPrice = {
  label: string;
  value: string;
};

export type IndustryBriefPayload = {
  meta: {
    date: string;
    title: string;
    subtitle: string;
    generatedAt: string;
    lastSuccessfulRefreshAt: string;
    status: string;
    error?: string;
  };
  markets: BriefCardData[];
  crypto: BriefCardData & {
    prices: BriefPrice[];
  };
  ai: BriefCardData[];
  knowledge: BriefCardData;
  signals: BriefCardData;
};
