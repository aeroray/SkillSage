import { useEffect, useState } from "react";
import { getLeaderboard, getSkillDetail, searchSkills } from "./api";
import type { LeaderboardRange, SkillDetail, SkillSearchResult } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useLeaderboard(range: LeaderboardRange) {
  const [skills, setSkills] = useState<SkillSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void getLeaderboard(range)
      .then((result) => {
        if (active) setSkills(result);
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
  }, [range]);

  return { error, loading, skills };
}

export function useSkillSearch(query: string) {
  const [skills, setSkills] = useState<SkillSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
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
    }, 320);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { error, loading, skills };
}

export function useSkillDetail(skillId: string | null) {
  const [detail, setDetail] = useState<SkillDetail>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

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
  }, [skillId]);

  return { detail, error, loading };
}
