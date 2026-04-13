'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { StatusBadge } from '@/src/ui/operator-console/status-badge';

interface CandidatePreviewRequestItem {
  mediaKey: string;
  app: 'sonarr' | 'radarr';
  decision: 'dispatch' | 'skip';
}

interface CandidateReleasePreview {
  available: boolean;
  mode: 'preferred_release' | 'good_enough_release' | 'fallback_then_upgrade' | 'blind_search';
  reason: string;
  selectedReleaseTitle: string | null;
  selectedReleaseQuality: string | null;
  selectedReleaseResolution: number | null;
  selectedReleaseIndexer: string | null;
  upgradePriority: boolean;
}

interface CandidateReleasePreviewContextValue {
  loading: boolean;
  previews: Record<string, CandidateReleasePreview>;
}

const CandidateReleasePreviewContext =
  createContext<CandidateReleasePreviewContextValue | null>(null);

const formatReleaseSelectionMode = (
  preview: CandidateReleasePreview | undefined
): { label: string; status: 'info' | 'success' | 'degraded' } => {
  if (!preview) {
    return { label: 'n/a', status: 'info' };
  }

  if (!preview.available) {
    return { label: 'Unavailable', status: 'degraded' };
  }

  switch (preview.mode) {
    case 'preferred_release':
      return { label: 'Direct release', status: 'success' };
    case 'good_enough_release':
      return { label: 'Good enough', status: 'info' };
    case 'fallback_then_upgrade':
      return { label: 'Fallback + upgrade', status: 'degraded' };
    case 'blind_search':
    default:
      return { label: 'Blind search', status: 'info' };
  }
};

const CandidateReleasePreviewLoading = ({ label }: { label: string }) => (
  <div className="release-preview release-preview--loading">
    <strong>{label}</strong>
    <small>Loading live preview...</small>
  </div>
);

export const CandidateReleasePreviewProvider = ({
  candidates,
  children,
}: {
  candidates: CandidatePreviewRequestItem[];
  children: ReactNode;
}) => {
  const [resolvedRequestKey, setResolvedRequestKey] = useState('');
  const [previews, setPreviews] = useState<Record<string, CandidateReleasePreview>>({});
  const dispatchCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.decision === 'dispatch'),
    [candidates]
  );
  const requestKey = dispatchCandidates
    .map((candidate) => `${candidate.app}:${candidate.mediaKey}`)
    .join('|');
  const loading = requestKey.length > 0 && resolvedRequestKey !== requestKey;
  const visiblePreviews = useMemo(
    () => (resolvedRequestKey === requestKey ? previews : {}),
    [previews, requestKey, resolvedRequestKey]
  );

  useEffect(() => {
    if (!requestKey) {
      return;
    }

    const abortController = new AbortController();
    let active = true;

    void fetch('/api/candidates/release-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidates: dispatchCandidates.map(({ mediaKey, app }) => ({ mediaKey, app })),
      }),
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Preview request failed with status ${response.status}`);
        }

        return (await response.json()) as {
          previews?: Record<string, CandidateReleasePreview>;
        };
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        setPreviews(payload.previews ?? {});
        setResolvedRequestKey(requestKey);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setPreviews({});
        setResolvedRequestKey(requestKey);
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [dispatchCandidates, requestKey]);

  const value = useMemo(
    () => ({
      loading,
      previews: visiblePreviews,
    }),
    [loading, visiblePreviews]
  );

  return (
    <CandidateReleasePreviewContext.Provider value={value}>
      {children}
    </CandidateReleasePreviewContext.Provider>
  );
};

const useCandidateReleasePreview = () => {
  const context = useContext(CandidateReleasePreviewContext);

  if (!context) {
    throw new Error(
      'Candidate release preview components must be used within CandidateReleasePreviewProvider'
    );
  }

  return context;
};

export const CandidateDispatchPathBadge = ({
  mediaKey,
  decision,
}: {
  mediaKey: string;
  decision: 'dispatch' | 'skip';
}) => {
  const { loading, previews } = useCandidateReleasePreview();

  if (decision !== 'dispatch') {
    return <StatusBadge status="info">n/a</StatusBadge>;
  }

  const preview = previews[mediaKey];

  if (!preview) {
    return (
      <StatusBadge
        status="info"
        {...(loading ? { title: 'Loading release preview' } : {})}
      >
        {loading ? 'Loading...' : 'Preview pending'}
      </StatusBadge>
    );
  }

  const dispatchPath = formatReleaseSelectionMode(preview);

  return (
    <StatusBadge
      status={dispatchPath.status}
      {...(preview.reason ? { title: preview.reason } : {})}
    >
      {dispatchPath.label}
    </StatusBadge>
  );
};

export const CandidateReleasePreviewCell = ({
  mediaKey,
  decision,
}: {
  mediaKey: string;
  decision: 'dispatch' | 'skip';
}) => {
  const { loading, previews } = useCandidateReleasePreview();

  if (decision !== 'dispatch') {
    return 'n/a';
  }

  const preview = previews[mediaKey];

  if (!preview) {
    return (
      <CandidateReleasePreviewLoading
        label={loading ? 'Loading release preview' : 'Preview pending'}
      />
    );
  }

  if (!preview.available) {
    return (
      <div className="release-preview" title={preview.reason}>
        <strong>Release preview unavailable</strong>
        <small>{preview.reason}</small>
      </div>
    );
  }

  if (!preview.selectedReleaseTitle) {
    return (
      <div className="release-preview" title={preview.reason}>
        <strong>No direct release selected</strong>
        <small>{preview.reason}</small>
      </div>
    );
  }

  return (
    <div className="release-preview" title={preview.reason}>
      <strong>{preview.selectedReleaseTitle}</strong>
      <small>
        {[preview.selectedReleaseQuality, preview.selectedReleaseIndexer]
          .filter(Boolean)
          .join(' · ') || preview.reason}
      </small>
    </div>
  );
};
