import { useEffect, useState } from "react";
import { WORLD_PACKAGE_ID } from "./config";
import { asRecord, findNestedString } from "./objectReaders";
import type { ResolvedCharacter } from "./types";
import { gql } from "./unitState";

interface PlayerCharacterState {
  character?: ResolvedCharacter;
  loading: boolean;
  error?: string;
}

// A wallet may hold PlayerProfiles from earlier cycles under retired world
// packages; filtering by the current world package skips those.
const PROFILE_QUERY = `
query ProfileByOwner($owner: SuiAddress!, $type: String!) {
  address(address: $owner) {
    objects(filter: { type: $type } first: 5) {
      nodes { contents { json } }
    }
  }
}`;

const OBJECT_JSON_QUERY = `
query ObjectJson($id: SuiAddress!) {
  object(address: $id) {
    asMoveObject { contents { json } }
  }
}`;

async function resolveViaProfile(
  walletAddress: string,
): Promise<string | undefined> {
  const data = await gql(PROFILE_QUERY, {
    owner: walletAddress,
    type: `${WORLD_PACKAGE_ID}::character::PlayerProfile`,
  });
  const nodes = asRecord(asRecord(asRecord(data?.address)?.objects))?.nodes;
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    const json = asRecord(asRecord(asRecord(node)?.contents)?.json);
    if (typeof json?.character_id === "string") return json.character_id;
  }
  return undefined;
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
        const characterId =
          (await resolveViaProfile(walletAddress)) || fallbackCharacterId;
        if (!characterId) {
          setState({
            loading: false,
            error: "No character found for this wallet in the current cycle.",
          });
          return;
        }

        const data = await gql(OBJECT_JSON_QUERY, { id: characterId });
        const json = asRecord(
          asRecord(asRecord(asRecord(data?.object)?.asMoveObject)?.contents)
            ?.json,
        );
        if (!json?.id || typeof json.id !== "string") {
          throw new Error("Character object could not be read.");
        }

        if (!cancelled) {
          setState({
            loading: false,
            character: {
              id: json.id,
              name:
                findNestedString(json.metadata, ["name"]) ||
                findNestedString(json, ["name"]),
              ownerCapId:
                typeof json.owner_cap_id === "string"
                  ? json.owner_cap_id
                  : undefined,
            },
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Character lookup failed.",
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
