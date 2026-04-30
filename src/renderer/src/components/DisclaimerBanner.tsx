import type { ReactElement } from 'react';

type DisclaimerBannerProps = {
  text: string;
};

export function DisclaimerBanner({ text }: DisclaimerBannerProps): ReactElement {
  return (
    <div className="rounded-lg border border-warning/35 bg-[oklch(0.965_0.026_84)] px-4 py-3 text-sm text-ink">
      <span className="font-semibold">Legal disclaimer: </span>
      {text}
    </div>
  );
}
