import { GameCard } from "@renderer/components";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";

import type { CatalogueEntry } from "@types";

import type { DebouncedFunc } from "lodash";
import { debounce } from "lodash";

import { InboxIcon, SearchIcon } from "@primer/octicons-react";
import { clearSearch, setSearch } from "@renderer/features";
import { useAppDispatch } from "@renderer/hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as styles from "./home.css";
import { buildGameDetailsPath } from "@renderer/helpers";

import { vars } from "@renderer/theme.css";

export default function SearchResults() {
  const dispatch = useAppDispatch();

  const { t } = useTranslation("home");
  const [searchParams] = useSearchParams();

  const [searchResults, setSearchResults] = useState<CatalogueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTypingMessage, setShowTypingMessage] = useState(false);

  const debouncedFunc = useRef<DebouncedFunc<() => void> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const navigate = useNavigate();

  const handleGameClick = (game: CatalogueEntry) => {
    dispatch(clearSearch());
    navigate(buildGameDetailsPath(game));
  };

  useEffect(() => {
    dispatch(setSearch(searchParams.get("query") ?? ""));
  }, [dispatch, searchParams]);

  useEffect(() => {
    setIsLoading(true);
    if (debouncedFunc.current) debouncedFunc.current.cancel();
    if (abortControllerRef.current) abortControllerRef.current.abort();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    debouncedFunc.current = debounce(() => {
      const query = searchParams.get("query") ?? "";

      if (query.length < 3) {
        setIsLoading(false);
        setShowTypingMessage(true);
        setSearchResults([]);
        return;
      }

      setShowTypingMessage(false);
      window.electron
        .searchGames(query)
        .then((results) => {
          if (abortController.signal.aborted) return;

          setSearchResults(results);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    }, 500);

    debouncedFunc.current();
  }, [searchParams, dispatch]);

  const noResultsContent = () => {
    if (isLoading) return null;

    if (showTypingMessage) {
      return (
        <div className={styles.noResults}>
          <SearchIcon size={56} />

          <p>{t("start_typing")}</p>
        </div>
      );
    }

    if (searchResults.length === 0) {
      return (
        <div className={styles.noResults}>
          <InboxIcon size={56} />

          <p>{t("no_results")}</p>
        </div>
      );
    }

    return null;
  };

  return (
    <SkeletonTheme baseColor={vars.color.background} highlightColor="#444">
      <section className={styles.content}>
        <section className={styles.cards}>
          {isLoading &&
            Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className={styles.cardSkeleton} />
            ))}

          {!isLoading && searchResults.length > 0 && (
            <>
              {searchResults.map((game) => (
                <GameCard
                  key={game.objectId}
                  game={game}
                  onClick={() => handleGameClick(game)}
                />
              ))}
            </>
          )}
        </section>

        {noResultsContent()}
      </section>
    </SkeletonTheme>
  );
}
