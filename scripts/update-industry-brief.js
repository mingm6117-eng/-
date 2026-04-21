const industryBriefData = require('../industry-brief-data');

async function main() {
  const brief = await industryBriefData.buildIndustryBrief({ force: true });
  console.log(
    `[industry-brief] Updated ${brief.meta.date} at ${brief.meta.lastSuccessfulRefreshAt} (${brief.meta.status})`,
  );
}

main().catch((err) => {
  console.error('[industry-brief] Update failed:', err.message);
  process.exitCode = 1;
});
