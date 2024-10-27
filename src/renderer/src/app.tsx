import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { Sidebar, BottomPanel, Header, Toast } from "@renderer/components";

import {
  useAppDispatch,
  useAppSelector,
  useDownload,
  useLibrary,
  useToast,
  useUserDetails,
} from "@renderer/hooks";

import * as styles from "./app.css";

import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  setSearch,
  clearSearch,
  setUserPreferences,
  toggleDraggingDisabled,
  closeToast,
  setUserDetails,
  setProfileBackground,
  setGameRunning,
} from "@renderer/features";
import { useTranslation } from "react-i18next";
import { UserFriendModal } from "./pages/shared-modals/user-friend-modal";
import { downloadSourcesWorker } from "./workers";
import { repacksContext } from "./context";
import { logger } from "./logger";
import { SubscriptionTourModal } from "./pages/shared-modals/subscription-tour-modal";

interface TourModals {
  subscriptionModal?: boolean;
}

export interface AppProps {
  children: React.ReactNode;
}

export function App() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { updateLibrary, library } = useLibrary();

  const { t } = useTranslation("app");

  const downloadSourceMigrationLock = useRef(false);

  const { clearDownload, setLastPacket } = useDownload();

  const { indexRepacks } = useContext(repacksContext);

  const {
    isFriendsModalVisible,
    friendRequetsModalTab,
    friendModalUserId,
    syncFriendRequests,
    hideFriendsModal,
  } = useUserDetails();

  const { userDetails, fetchUserDetails, updateUserDetails, clearUserDetails } =
    useUserDetails();

  const dispatch = useAppDispatch();

  const navigate = useNavigate();
  const location = useLocation();

  const search = useAppSelector((state) => state.search.value);

  const draggingDisabled = useAppSelector(
    (state) => state.window.draggingDisabled
  );

  const toast = useAppSelector((state) => state.toast);

  const { showSuccessToast } = useToast();

  const [showSubscritionTourModal, setShowSubscritionTourModal] =
    useState(false);

  useEffect(() => {
    Promise.all([window.electron.getUserPreferences(), updateLibrary()]).then(
      ([preferences]) => {
        dispatch(setUserPreferences(preferences));
      }
    );
  }, [navigate, location.pathname, dispatch, updateLibrary]);

  useEffect(() => {
    const unsubscribe = window.electron.onDownloadProgress(
      (downloadProgress) => {
        if (downloadProgress.game.progress === 1) {
          clearDownload();
          updateLibrary();
          return;
        }

        setLastPacket(downloadProgress);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [clearDownload, setLastPacket, updateLibrary]);

  useEffect(() => {
    const cachedUserDetails = window.localStorage.getItem("userDetails");

    if (cachedUserDetails) {
      const { profileBackground, ...userDetails } =
        JSON.parse(cachedUserDetails);

      dispatch(setUserDetails(userDetails));
      dispatch(setProfileBackground(profileBackground));
    }

    fetchUserDetails().then((response) => {
      if (response) {
        updateUserDetails(response);
        syncFriendRequests();
      }
    });
  }, [fetchUserDetails, syncFriendRequests, updateUserDetails, dispatch]);

  useEffect(() => {
    const tourModalsString = window.localStorage.getItem("tourModals") || "{}";

    const tourModals = JSON.parse(tourModalsString) as TourModals;

    if (!tourModals.subscriptionModal) {
      setShowSubscritionTourModal(true);
    }
  }, []);

  const onSignIn = useCallback(() => {
    fetchUserDetails().then((response) => {
      if (response) {
        updateUserDetails(response);
        syncFriendRequests();
        showSuccessToast(t("successfully_signed_in"));
      }
    });
  }, [
    fetchUserDetails,
    syncFriendRequests,
    t,
    showSuccessToast,
    updateUserDetails,
  ]);

  useEffect(() => {
    const unsubscribe = window.electron.onGamesRunning((gamesRunning) => {
      if (gamesRunning.length) {
        const lastGame = gamesRunning[gamesRunning.length - 1];
        const libraryGame = library.find(
          (library) => library.id === lastGame.id
        );

        if (libraryGame) {
          dispatch(
            setGameRunning({
              ...libraryGame,
              sessionDurationInMillis: lastGame.sessionDurationInMillis,
            })
          );
          return;
        }
      }
      dispatch(setGameRunning(null));
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch, library]);

  useEffect(() => {
    const listeners = [
      window.electron.onSignIn(onSignIn),
      window.electron.onLibraryBatchComplete(() => {
        updateLibrary();
      }),
      window.electron.onSignOut(() => clearUserDetails()),
    ];

    return () => {
      listeners.forEach((unsubscribe) => unsubscribe());
    };
  }, [onSignIn, updateLibrary, clearUserDetails]);

  const handleSearch = useCallback(
    (query: string) => {
      dispatch(setSearch(query));

      if (query === "") {
        navigate(-1);
        return;
      }

      const searchParams = new URLSearchParams({
        query,
      });

      navigate(`/search?${searchParams.toString()}`, {
        replace: location.pathname.startsWith("/search"),
      });
    },
    [dispatch, location.pathname, navigate]
  );

  const handleClear = useCallback(() => {
    dispatch(clearSearch());
    navigate(-1);
  }, [dispatch, navigate]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [location.pathname, location.search]);

  useEffect(() => {
    new MutationObserver(() => {
      const modal = document.body.querySelector("[role=dialog]");

      dispatch(toggleDraggingDisabled(Boolean(modal)));
    }).observe(document.body, {
      attributes: false,
      childList: true,
    });
  }, [dispatch, draggingDisabled]);

  useEffect(() => {
    if (downloadSourceMigrationLock.current) return;

    downloadSourceMigrationLock.current = true;

    window.electron.getDownloadSources().then(async (downloadSources) => {
      if (!downloadSources.length) {
        const id = crypto.randomUUID();
        const channel = new BroadcastChannel(`download_sources:sync:${id}`);

        channel.onmessage = (event: MessageEvent<number>) => {
          const newRepacksCount = event.data;
          window.electron.publishNewRepacksNotification(newRepacksCount);
        };

        downloadSourcesWorker.postMessage(["SYNC_DOWNLOAD_SOURCES", id]);
      }

      for (const downloadSource of downloadSources) {
        logger.info("Migrating download source", downloadSource.url);

        const channel = new BroadcastChannel(
          `download_sources:import:${downloadSource.url}`
        );
        await new Promise((resolve) => {
          downloadSourcesWorker.postMessage([
            "IMPORT_DOWNLOAD_SOURCE",
            downloadSource.url,
          ]);

          channel.onmessage = () => {
            window.electron.deleteDownloadSource(downloadSource.id).then(() => {
              resolve(true);
              logger.info(
                "Deleted download source from SQLite",
                downloadSource.url
              );
            });

            indexRepacks();
            channel.close();
          };
        }).catch(() => channel.close());
      }

      downloadSourceMigrationLock.current = false;
    });
  }, [indexRepacks]);

  const handleCloseSubscriptionTourModal = () => {
    setShowSubscritionTourModal(false);
    window.localStorage.setItem(
      "tourModals",
      JSON.stringify({ subscriptionModal: true } as TourModals)
    );
  };

  const handleToastClose = useCallback(() => {
    dispatch(closeToast());
  }, [dispatch]);

  return (
    <>
      {window.electron.platform === "win32" && (
        <div className={styles.titleBar}>
          <h4>Hydra</h4>
        </div>
      )}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={handleToastClose}
      />

      <SubscriptionTourModal
        visible={showSubscritionTourModal && false}
        onClose={handleCloseSubscriptionTourModal}
      />

      {userDetails && (
        <UserFriendModal
          visible={isFriendsModalVisible}
          initialTab={friendRequetsModalTab}
          onClose={hideFriendsModal}
          userId={friendModalUserId}
        />
      )}

      <main>
        <Sidebar />

        <article className={styles.container}>
          <Header
            onSearch={handleSearch}
            search={search}
            onClear={handleClear}
          />

          <section ref={contentRef} className={styles.content}>
            <Outlet />
          </section>
        </article>
      </main>

      <BottomPanel />
    </>
  );
}
