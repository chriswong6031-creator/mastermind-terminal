import { LevelsLearn } from "@/components/levels/LevelsLearn";

// Static content page — no server-side data reads. Cap the CDN cache at 5 min:
// without this the static prerender emits s-maxage=31536000 (1yr) and EdgeOne
// serves the OLD build after a deploy until an owner purges it. See app/heatmap/page.tsx.
export const revalidate = 300;

export default function LearnPage() {
  return <LevelsLearn />;
}
