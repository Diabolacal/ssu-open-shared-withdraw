import { useEffect, useState } from "react";
import { getObjectWithJson, getOwnedObjectsByType } from "@evefrontier/dapp-kit";
import { WORLD_PACKAGE_ID } from "./config";
import { findNestedString, readCharacter } from "./objectReaders";
import type { ResolvedCharacter } from "./types";

interface PlayerCharacterState {
  character?: ResolvedCharacter;
  loading: boolean;
  error?: string;
}

export function usePlayerCharacter(
  walletAddress?: string,
  fallbackCharacterId?: string,
): PlayerCharacterState {
  const [state, setState] = useState<PlayerCharacterState>({ loading: false });

  useEffect(() => {
    let cancelled = false;

    async function resolveCharacter() {
      if (!walletAddress) {
        setState({ loading: false });
        return;
      }

      setState({ loading: true });
      try {
        const profileType = `${WORLD_PACKAGE_ID}::character::PlayerProfile`;
        const ownedProfiles = await getOwnedObjectsByType(walletAddress, profileType);
        const profileCharacterId =
          findNestedString(ownedProfiles, ["character_id", "characterId"]) ||
          fallbackCharacterId;

        if (!profileCharacterId) {
          setState({
            loading: false,
            error: "No character profile found for this wallet.",
          });
          return;
        }

        const objectResult = await getObjectWithJson(profileCharacterId);
        const character = readCharacter(objectResult, profileCharacterId);
        if (!character.id) throw new Error("Character object did not include an ID.");

        if (!cancelled) {
          setState({
            loading: false,
            character: { id: character.id, name: character.name },
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : "Character lookup failed.",
          });
        }
      }
    }

    void resolveCharacter();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, fallbackCharacterId]);

  return state;
}

