import { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboard, getSkillDetail, searchSkills } from "./api";
import {
  clearCachedLeaderboard,
  getCachedLeaderboard,
  setCachedLeaderboard,
} from "./cache";
import type { LeaderboardRange, SkillDetail, SkillSearchResult } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useLeaderboard(range: LeaderboardRange) {
  const [skills, setSkills] = useState<SkillSearchResult[]>(
    () => getCachedLeaderboard(range) ?? [],
  );
  const [loading, setLoading] = useState(() => !getCachedLeaderboard(range));
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const handledReloadToken = useRef(0);

  useEffect(() => {
    const forceRefresh = reloadToken !== handledReloadToken.current;
    handledReloadToken.current = reloadToken;
    const cached = forceRefresh ? undefined : getCachedLeaderboard(range);
    if (cached) {
      setSkills(cached);
      setError(undefined);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(undefined);
    void getLeaderboard(range)
      .then((result) => {
        if (active) setSkills(result);
        if (active) setCachedLeaderboard(range, result);
      })
      .catch((reason) => {
        if (active) setError(normalizeTauriError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, reloadToken]);

  const refresh = useCallback(() => {
    clearCachedLeaderboard(range);
    setReloadToken((value) => value + 1);
  }, [range]);

  return { error, loading, refresh, skills };
}

export function useSkillSearch(query: string, isComposing = false) {
  const [skills, setSkills] = useState<SkillSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (isComposing) {
      setLoading(false);
      return;
    }

    const normalized = query.trim();
    if (normalized.length < 2) {
      setSkills([]);
      setLoading(false);
      setError(undefined);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void searchSkills(normalized)
        .then((result) => {
          if (active) setSkills(result);
        })
        .catch((reason) => {
          if (active) setError(normalizeTauriError(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isComposing, query, reloadToken]);

  return {
    error,
    loading,
    refresh: () => setReloadToken((value) => value + 1),
    skills,
  };
}

export function useSkillDetail(skillId: string | null) {
  const [detail, setDetail] = useState<SkillDetail>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!skillId) {
      setDetail(undefined);
      setLoading(false);
      setError(undefined);
      return;
    }

    let active = true;
    setLoading(true);
    setError(undefined);
    void getSkillDetail(skillId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((reason) => {
        if (active) setError(normalizeTauriError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [skillId, reloadToken]);

  return {
    detail,
    error,
    loading,
    refresh: () => setReloadToken((value) => value + 1),
  };
}
