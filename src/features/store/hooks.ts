import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLeaderboard,
  getSkillDetail,
  getSkillTranslations,
  saveSkillTranslation,
  searchSkills,
} from "./api";
import {
  clearCachedDetail,
  clearCachedLeaderboard,
  getCachedDetail,
  getCachedLeaderboard,
  setCachedDetail,
  setCachedLeaderboard,
} from "./cache";
import type {
  LeaderboardRange,
  SkillDetail,
  SkillSearchResult,
  SkillTranslationCache,
} from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useLeaderboard(range: LeaderboardRange) {
  const [skills, setSkills] = useState<SkillSearchResult[]>(
    () => getCachedLeaderboard(range) ?? [],
  );
  const [loading, setLoading] = useState(() => !getCachedLeaderboard(range));
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const handledReloadToken = useRef(0);
  /** Orders overlapping requests. `active` cancels the effect that started a
   * fetch, but when the user switches range quickly both fetches are live and
   * the slower one must not overwrite the newer results. */
  const requestId = useRef(0);

  useEffect(() => {
    const forceRefresh = reloadToken !== handledReloadToken.current;
    handledReloadToken.current = reloadToken;
    const cached = forceRefresh ? undefined : getCachedLeaderboard(range);
    if (cached) {
      // A cached range wins immediately, so invalidate any in-flight fetch for
      // the range the user just navigated away from.
      requestId.current += 1;
      setSkills(cached);
      setError(undefined);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    let active = true;
    setLoading(true);
    setError(undefined);
    void getLeaderboard(range)
      .then((result) => {
        if (!active || currentRequest !== requestId.current) return;
        setSkills(result);
        setCachedLeaderboard(range, result);
      })
      .catch((reason) => {
        if (active && currentRequest === requestId.current) {
          setError(normalizeTauriError(reason));
        }
      })
      .finally(() => {
        if (active && currentRequest === requestId.current) setLoading(false);
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
  /** Monotonic request id. `active` only cancels the effect that started a
   * request; it cannot order two requests that are both still mounted, which is
   * what happens while the user keeps typing. Without this, a slow response for
   * "re" could land after a fast one for "react" and replace the newer results
   * with the older ones. */
  const requestId = useRef(0);

  useEffect(() => {
    if (isComposing) {
      setLoading(false);
      return;
    }

    const normalized = query.trim();
    if (normalized.length < 2) {
      // Invalidate any in-flight request so its late response cannot repopulate
      // the list after the query was cleared.
      requestId.current += 1;
      setSkills([]);
      setLoading(false);
      setError(undefined);
      return;
    }

    const currentRequest = ++requestId.current;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void searchSkills(normalized)
        .then((result) => {
          if (active && currentRequest === requestId.current) setSkills(result);
        })
        .catch((reason) => {
          if (active && currentRequest === requestId.current) {
            setError(normalizeTauriError(reason));
          }
        })
        .finally(() => {
          if (active && currentRequest === requestId.current) setLoading(false);
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
  const [detail, setDetail] = useState<SkillDetail | undefined>(() =>
    skillId ? getCachedDetail(skillId) : undefined,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  /** Orders overlapping requests, so a slow response for a skill the user has
   * already navigated away from cannot replace the current one. */
  const requestId = useRef(0);

  useEffect(() => {
    if (!skillId) {
      setDetail(undefined);
      setLoading(false);
      setError(undefined);
      return;
    }

    const currentRequest = ++requestId.current;
    const cached = getCachedDetail(skillId);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(undefined);
      return;
    }

    let active = true;
    setLoading(true);
    setError(undefined);
    // Drop the previous skill's detail before fetching the next one. Without
    // this, switching from A to B left `detail` pointing at A for the whole of
    // B's request, and the dialog renders its title, its "open on skills.sh"
    // link and an *enabled* install button from `detail` — so clicking install
    // in that window installed A, not the skill the user had just picked. The
    // sibling hooks do not need this because they replace a list, where the
    // stale value is visibly stale; here the stale value looks like an answer.
    setDetail(undefined);
    void getSkillDetail(skillId)
      .then((result) => {
        if (!active || currentRequest !== requestId.current) return;
        setCachedDetail(skillId, result);
        setDetail(result);
      })
      .catch((reason) => {
        if (active && currentRequest === requestId.current) {
          setError(normalizeTauriError(reason));
        }
      })
      .finally(() => {
        if (active && currentRequest === requestId.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [skillId, reloadToken]);

  return {
    detail,
    error,
    loading,
    /** Forces a refetch, bypassing and replacing the cache entry. */
    refresh: () => {
      if (skillId) clearCachedDetail(skillId);
      setReloadToken((value) => value + 1);
    },
  };
}

let cachedTranslations: SkillTranslationCache | undefined;
let translationsPromise: Promise<SkillTranslationCache> | undefined;

function loadTranslations() {
  if (cachedTranslations) return Promise.resolve(cachedTranslations);
  if (translationsPromise) return translationsPromise;
  const request = getSkillTranslations()
    .then((result) => {
      cachedTranslations = result;
      return result;
    })
    .finally(() => {
      if (translationsPromise === request) translationsPromise = undefined;
    });
  translationsPromise = request;
  return request;
}

export function useSkillDescriptionTranslations() {
  const [translations, setTranslations] = useState<SkillTranslationCache>(
    () => cachedTranslations ?? {},
  );
  const [loading, setLoading] = useState(() => !cachedTranslations);
  const [error, setError] = useState<string>();

  // The cache is module-level so navigating between /store and /skills does not
  // re-read the whole translation file on every mount.
  useEffect(() => {
    if (cachedTranslations) return;
    let active = true;
    void loadTranslations()
      .then((result) => {
        if (active) setTranslations(result);
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
  }, []);

  const save = useCallback(async (skillId: string, translatedDescription: string) => {
    await saveSkillTranslation(skillId, translatedDescription);
    const next = {
      ...(cachedTranslations ?? {}),
      [skillId]: translatedDescription,
    };
    cachedTranslations = next;
    setTranslations(next);
  }, []);

  return { error, loading, save, translations };
}
