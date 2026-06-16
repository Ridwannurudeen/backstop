import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddress } from "@mysten/sui/utils";

type SuiAlias = {
  alias: string;
  public_key_base64: string;
};

const suiConfigDir = () =>
  process.env.SUI_CONFIG_DIR ?? join(homedir(), ".sui", "sui_config");

const keystorePath = () =>
  process.env.SUI_KEYSTORE_PATH ?? join(suiConfigDir(), "sui.keystore");

const aliasesPath = () => join(suiConfigDir(), "sui.aliases");

const clientConfigPath = () => join(suiConfigDir(), "client.yaml");

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

const readActiveAddress = (): string | null => {
  const text = readFileSync(clientConfigPath(), "utf8");
  const match = /^active_address:\s*"?([^"\r\n]+)"?/m.exec(text);
  return match?.[1] ? normalizeSuiAddress(match[1]) : null;
};

const keypairFromKeystoreEntry = (entry: string): Ed25519Keypair => {
  const bytes = Buffer.from(entry, "base64");
  if (bytes[0] !== 0) {
    throw new Error("Only Ed25519 Sui keystore keys are supported here");
  }
  return Ed25519Keypair.fromSecretKey(bytes.subarray(1));
};

export function loadSuiKeypair(): Ed25519Keypair {
  const privateKey = process.env.SUI_PRIVATE_KEY?.trim();
  if (privateKey) return Ed25519Keypair.fromSecretKey(privateKey);

  const aliases = readJson<SuiAlias[]>(aliasesPath());
  const keypairs = readJson<string[]>(keystorePath()).map(
    keypairFromKeystoreEntry,
  );
  const requestedAlias = process.env.SUI_KEY_ALIAS?.trim();
  const requestedAddress = process.env.SUI_ADDRESS?.trim()
    ? normalizeSuiAddress(process.env.SUI_ADDRESS)
    : readActiveAddress();

  if (requestedAlias) {
    const alias = aliases.find((entry) => entry.alias === requestedAlias);
    if (!alias) throw new Error(`Sui key alias not found: ${requestedAlias}`);
    const keypair = keypairs.find(
      (kp) => kp.getPublicKey().toSuiPublicKey() === alias.public_key_base64,
    );
    if (!keypair) {
      throw new Error(`Sui keystore entry not found for alias: ${requestedAlias}`);
    }
    return keypair;
  }

  if (requestedAddress) {
    const keypair = keypairs.find(
      (kp) => kp.getPublicKey().toSuiAddress() === requestedAddress,
    );
    if (!keypair) {
      throw new Error(`Sui keystore entry not found for ${requestedAddress}`);
    }
    return keypair;
  }

  if (keypairs.length === 1) return keypairs[0];
  throw new Error("Set SUI_KEY_ALIAS, SUI_ADDRESS, or SUI_PRIVATE_KEY");
}
