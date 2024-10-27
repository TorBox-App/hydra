import { GearIcon, PlayIcon, PlusCircleIcon } from "@primer/octicons-react";
import { Button } from "@renderer/components";
import { useDownload, useLibrary } from "@renderer/hooks";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import * as styles from "./hero-panel-actions.css";

import { gameDetailsContext } from "@renderer/context";
import { DownloadIcon } from "@renderer/components/sidebar/download-icon";

export function HeroPanelActions() {
  const [toggleLibraryGameDisabled, setToggleLibraryGameDisabled] =
    useState(false);

  const { isGameDeleting } = useDownload();

  const {
    game,
    repacks,
    isGameRunning,
    objectId,
    gameTitle,
    setShowGameOptionsModal,
    setShowRepacksModal,
    updateGame,
    selectGameExecutable,
  } = useContext(gameDetailsContext);

  const { lastPacket } = useDownload();

  const isGameDownloading =
    game?.status === "active" && lastPacket?.game.id === game?.id;

  const { updateLibrary } = useLibrary();

  const { t } = useTranslation("game_details");

  const addGameToLibrary = async () => {
    setToggleLibraryGameDisabled(true);

    try {
      await window.electron.addGameToLibrary(objectId!, gameTitle, "steam");

      updateLibrary();
      updateGame();
    } finally {
      setToggleLibraryGameDisabled(false);
    }
  };

  const openGame = async () => {
    if (game) {
      if (game.executablePath) {
        window.electron.openGame(game.id, game.executablePath);
        return;
      }

      const gameExecutablePath = await selectGameExecutable();
      if (gameExecutablePath)
        window.electron.openGame(game.id, gameExecutablePath);
    }
  };

  const closeGame = () => {
    if (game) window.electron.closeGame(game.id);
  };

  const deleting = game ? isGameDeleting(game?.id) : false;

  const addGameToLibraryButton = (
    <Button
      theme="outline"
      disabled={toggleLibraryGameDisabled}
      onClick={addGameToLibrary}
      className={styles.heroPanelAction}
    >
      <PlusCircleIcon />
      {t("add_to_library")}
    </Button>
  );

  const showDownloadOptionsButton = (
    <Button
      onClick={() => setShowRepacksModal(true)}
      theme="outline"
      disabled={deleting}
      className={styles.heroPanelAction}
    >
      {t("open_download_options")}
    </Button>
  );

  const gameActionButton = () => {
    if (isGameRunning) {
      return (
        <Button
          onClick={closeGame}
          theme="outline"
          disabled={deleting}
          className={styles.heroPanelAction}
        >
          {t("close")}
        </Button>
      );
    }

    if (game?.executablePath) {
      return (
        <Button
          onClick={openGame}
          theme="outline"
          disabled={deleting || isGameRunning}
          className={styles.heroPanelAction}
        >
          <PlayIcon />
          {t("play")}
        </Button>
      );
    }

    return (
      <Button
        onClick={() => setShowRepacksModal(true)}
        theme="outline"
        disabled={isGameDownloading || !repacks.length}
        className={styles.heroPanelAction}
      >
        <DownloadIcon isDownloading={false} />
        {t("download")}
      </Button>
    );
  };

  if (repacks.length && !game) {
    return (
      <>
        {addGameToLibraryButton}
        {showDownloadOptionsButton}
      </>
    );
  }

  if (game) {
    return (
      <div className={styles.actions}>
        {gameActionButton()}

        <div className={styles.separator} />

        <Button
          onClick={() => setShowGameOptionsModal(true)}
          theme="outline"
          disabled={deleting}
          className={styles.heroPanelAction}
        >
          <GearIcon />
          {t("options")}
        </Button>
      </div>
    );
  }

  return addGameToLibraryButton;
}
