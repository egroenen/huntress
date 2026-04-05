import type { ReactNode } from 'react';

const clampPercent = (value: number): number => Math.max(0, Math.min(value, 100));

const getTone = (used: number, limit: number): 'healthy' | 'degraded' | 'unavailable' => {
  if (limit <= 0) {
    return 'unavailable';
  }

  const ratio = used / limit;

  if (ratio >= 0.85) {
    return 'unavailable';
  }

  if (ratio >= 0.6) {
    return 'degraded';
  }

  return 'healthy';
};

export const BudgetMeter = ({
  used,
  limit,
  detail,
}: {
  used: number;
  limit: number;
  detail?: ReactNode;
}) => {
  const tone = getTone(used, limit);
  const percent = clampPercent(limit > 0 ? (used / limit) * 100 : 0);

  return (
    <div className="budget-meter">
      <div className="budget-meter__bar" aria-hidden="true">
        <span
          className={`budget-meter__fill budget-meter__fill--${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail ? <div className="budget-meter__detail">{detail}</div> : null}
    </div>
  );
};
